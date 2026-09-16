import { execute, query } from '../../database/db.js';
import { v4 as uuidv4 } from 'uuid';
import { cartService } from '../carts/cart.service.js';
import { orderService } from './order.service.js';

export interface BatchChildSummary {
  id: number;
  index: number;
  merchantName: string;
  cartId: number;
  addressId: number | null;
  status: string;
  confirmationStatus: string;
  subtotal: number;
  deliveryFee: number;
  total: number;
  orderId: number | null;
  orderNumber?: string | null;
  failureReason?: string | null;
}

export interface OrderBatchSummary {
  id: number;
  publicId: string;
  status: string;
  paymentPolicy: 'SEPARATE_CASH';
  children: BatchChildSummary[];
}

export class OrderBatchService {
  async createOrExtendBatch(input: {
    customerId: number;
    conversationId?: number | null;
    sourceCartId?: number | null;
    additionalItems?: { merchantProductId: number; quantity?: number }[];
    idempotencyKey: string;
  }): Promise<OrderBatchSummary> {
    const existing = await query<any[]>(`SELECT id FROM order_batches WHERE idempotency_key = ? LIMIT 1`, [input.idempotencyKey]);
    if (existing.length) return this.getBatchSummary(Number(existing[0].id));

    const result: any = await execute(
      `INSERT INTO order_batches (public_id, customer_id, conversation_id, status, payment_policy, idempotency_key)
       VALUES (?, ?, ?, 'REVIEW', 'SEPARATE_CASH', ?)`,
      [uuidv4(), input.customerId, input.conversationId || null, input.idempotencyKey],
    );
    const batchId = Number(result.insertId);

    const source = input.sourceCartId
      ? await cartService.getCartById(input.sourceCartId)
      : await cartService.getActiveCartReadOnly(input.customerId);
    if (source?.items?.length && source.merchant_branch_id) {
      await execute(`UPDATE carts SET order_batch_id = ? WHERE id = ?`, [batchId, source.id]);
      await this.attachCart(batchId, source.id, source.merchant_branch_id);
    }

    for (const selection of input.additionalItems || []) {
      const productRows = await query<any[]>(`SELECT merchant_branch_id FROM merchant_products WHERE id = ? AND is_available = 1 LIMIT 1`, [selection.merchantProductId]);
      if (!productRows.length) throw new Error('Requested product is not available');
      const branchId = Number(productRows[0].merchant_branch_id);
      const childRows = await query<any[]>(
        `SELECT cart_id FROM order_batch_children WHERE order_batch_id = ? AND merchant_branch_id = ? LIMIT 1`,
        [batchId, branchId],
      );
      const childCart = childRows.length
        ? await cartService.getCartById(Number(childRows[0].cart_id))
        : await cartService.createBatchChildCart(input.customerId, batchId, branchId);
      if (!childRows.length) await this.attachCart(batchId, childCart.id, branchId);
      await cartService.addItem(childCart.id, selection.merchantProductId, selection.quantity || 1);
    }

    const summary = await this.getBatchSummary(batchId);
    if (summary.children.length < 2) throw new Error('A multi-order plan requires items from at least two merchants');
    return summary;
  }

  async setSharedAddress(batchId: number, customerId: number, addressId: number): Promise<OrderBatchSummary> {
    const address = await query<any[]>(`SELECT id FROM customer_addresses WHERE id = ? AND customer_id = ? LIMIT 1`, [addressId, customerId]);
    if (!address.length) throw new Error('Selected address not found for customer');
    await execute(`UPDATE order_batches SET shared_address_id = ?, summary_revision = summary_revision + 1 WHERE id = ?`, [addressId, batchId]);
    await execute(`UPDATE order_batch_children SET customer_address_id = ?, confirmation_status = 'PENDING' WHERE order_batch_id = ? AND status = 'REVIEW'`, [addressId, batchId]);
    return this.getBatchSummary(batchId);
  }

  async cancelChild(batchId: number, childIndex: number): Promise<OrderBatchSummary> {
    const children = await this.getChildRows(batchId);
    const child = children[childIndex - 1];
    if (!child) throw new Error('Order batch child was not found');
    if (child.order_id) throw new Error('A placed child order cannot be cancelled through batch review');
    await execute(`UPDATE order_batch_children SET status = 'CANCELLED', confirmation_status = 'DECLINED' WHERE id = ?`, [child.id]);
    return this.getBatchSummary(batchId);
  }

  async confirm(batchId: number, customerId: number, selection: '1' | '2' | 'both', conversationId?: number | null): Promise<OrderBatchSummary> {
    const children = await this.getChildRows(batchId);
    const selected = selection === 'both' ? children.filter((child) => child.status === 'REVIEW') : [children[Number(selection) - 1]].filter(Boolean);
    if (!selected.length) throw new Error('No reviewable order batch child was selected');
    for (const child of selected) {
      if (!child.customer_address_id) throw new Error('A delivery address and fresh summaries are required before confirmation');
    }

    for (const child of selected) {
      if (child.order_id) continue;
      try {
        const order = await orderService.createOrderFromCart(
          customerId,
          Number(child.customer_address_id),
          null,
          String(child.idempotency_key),
          { cartId: Number(child.cart_id), orderBatchId: batchId, conversationId: conversationId || undefined },
        );
        await execute(`UPDATE order_batch_children SET order_id = ?, status = 'PLACED', confirmation_status = 'CONFIRMED', failure_reason = NULL WHERE id = ?`, [order.id, child.id]);
      } catch (error: any) {
        await execute(`UPDATE order_batch_children SET status = 'FAILED', failure_reason = ? WHERE id = ?`, [String(error?.message || error).slice(0, 1000), child.id]);
      }
    }
    const summary = await this.getBatchSummary(batchId);
    const remaining = summary.children.some((child) => child.status === 'REVIEW' || child.status === 'FAILED');
    await execute(`UPDATE order_batches SET status = ? WHERE id = ?`, [remaining ? 'PARTIAL' : 'PLACED', batchId]);
    return this.getBatchSummary(batchId);
  }

  async getBatchSummary(batchId: number, options?: { refreshQuotes?: boolean }): Promise<OrderBatchSummary> {
    const rows = await query<any[]>(`SELECT id, public_id, status, payment_policy FROM order_batches WHERE id = ? LIMIT 1`, [batchId]);
    if (!rows.length) throw new Error('Order batch was not found');
    const children = await this.getChildRows(batchId, options?.refreshQuotes !== false);
    return {
      id: Number(rows[0].id),
      publicId: String(rows[0].public_id),
      status: String(rows[0].status),
      paymentPolicy: 'SEPARATE_CASH',
      children: children.map((child, index) => ({
        id: Number(child.id), index: index + 1, merchantName: String(child.merchant_name), cartId: Number(child.cart_id),
        addressId: child.customer_address_id ? Number(child.customer_address_id) : null, status: String(child.status),
        confirmationStatus: String(child.confirmation_status), subtotal: Number(child.quoted_subtotal),
        deliveryFee: Number(child.quoted_delivery_fee), total: Number(child.quoted_total), orderId: child.order_id ? Number(child.order_id) : null,
        orderNumber: child.order_number || null, failureReason: child.failure_reason || null,
      })),
    };
  }

  private async attachCart(batchId: number, cartId: number, branchId: number): Promise<void> {
    const merchantRows = await query<any[]>(`SELECT merchant_id FROM merchant_branches WHERE id = ? LIMIT 1`, [branchId]);
    if (!merchantRows.length) throw new Error('Merchant branch was not found');
    const cart = await cartService.getCartById(cartId);
    await execute(
      `INSERT INTO order_batch_children
       (public_id, order_batch_id, cart_id, merchant_id, merchant_branch_id, quoted_subtotal, quoted_delivery_fee, quoted_total, quoted_eta_minutes, idempotency_key)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [uuidv4(), batchId, cartId, merchantRows[0].merchant_id, branchId, cart.subtotal, cart.estimated_delivery_fee, cart.estimated_total, 0, `order_batch_child:${batchId}:${branchId}`],
    );
  }

  private async getChildRows(batchId: number, refreshQuotes = true): Promise<any[]> {
    const rows = await query<any[]>(`
      SELECT bc.*, m.name AS merchant_name, o.order_number
      FROM order_batch_children bc
      JOIN merchants m ON m.id = bc.merchant_id
      LEFT JOIN orders o ON o.id = bc.order_id
      WHERE bc.order_batch_id = ?
      ORDER BY bc.id ASC
    `, [batchId]);
    for (const child of rows) {
      if (refreshQuotes && ['REVIEW', 'FAILED'].includes(String(child.status))) {
        const cart = await cartService.getCartById(Number(child.cart_id));
        child.quoted_subtotal = cart.subtotal;
        child.quoted_delivery_fee = cart.estimated_delivery_fee;
        child.quoted_total = cart.estimated_total;
        await execute(
          `UPDATE order_batch_children
           SET quoted_subtotal = ?, quoted_delivery_fee = ?, quoted_total = ?
           WHERE id = ?`,
          [cart.subtotal, cart.estimated_delivery_fee, cart.estimated_total, child.id],
        );
      }
    }
    return rows;
  }
}

export const orderBatchService = new OrderBatchService();
