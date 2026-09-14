import { query, execute } from '../../database/db.js';
import { Cart, CartItem } from '../../shared/types.js';
import { v4 as uuidv4 } from 'uuid';
import { redis } from '../../database/redis.js';
import { whatsappService } from '../whatsapp/whatsapp.service.js';

export interface ResolveTargetResult {
  targetItem: CartItem | null;
  ambiguous: boolean;
  candidates: CartItem[];
}

export class CartService {
  private abandonmentSchedulerStarted = false;

  async getOrCreateActiveCart(customerId: number): Promise<Cart> {
    const carts = await query<any[]>(`
      SELECT c.*, m.name as merchant_name
      FROM carts c
      LEFT JOIN merchant_branches mb ON mb.id = c.merchant_branch_id
      LEFT JOIN merchants m ON m.id = mb.merchant_id
      WHERE c.customer_id = ? AND c.status = 'ACTIVE'
      ORDER BY c.updated_at DESC LIMIT 1
    `, [customerId]);

    let cartId: number;
    let publicId: string;
    let merchantName: string | undefined;
    let branchId: number | null = null;

    if (carts.length > 0) {
      cartId = carts[0].id;
      publicId = carts[0].public_id;
      merchantName = carts[0].merchant_name;
      branchId = carts[0].merchant_branch_id;
    } else {
      publicId = uuidv4();
      await execute(`
        INSERT INTO carts (public_id, customer_id, status, currency, subtotal, estimated_delivery_fee, estimated_total)
        VALUES (?, ?, 'ACTIVE', 'USD', 0.00, 1.50, 1.50)
      `, [publicId, customerId]);

      const newCart = await query<any[]>(`SELECT id FROM carts WHERE public_id = ?`, [publicId]);
      cartId = newCart[0].id;
    }

    const items = await this.getCartItems(cartId);
    const totals = await this.recalculateCart(cartId);

    return {
      id: cartId,
      public_id: publicId,
      customer_id: customerId,
      merchant_branch_id: branchId,
      merchant_name: merchantName,
      status: 'ACTIVE',
      currency: 'USD',
      subtotal: totals.subtotal,
      estimated_delivery_fee: totals.deliveryFee,
      estimated_total: totals.total,
      items,
    };
  }

  async getCartItems(cartId: number): Promise<CartItem[]> {
    const rows = await query<any[]>(`
      SELECT 
        ci.id,
        ci.cart_id,
        ci.merchant_product_id,
        ci.merchant_product_variant_id,
        ci.quantity,
        ci.unit_price,
        ci.line_total,
        ci.customer_notes,
        COALESCE(mp.merchant_product_name, p.canonical_name) as product_name,
        pv.name as variant_name,
        pv.size_label
      FROM cart_items ci
      JOIN merchant_products mp ON mp.id = ci.merchant_product_id
      JOIN products p ON p.id = mp.product_id
      LEFT JOIN merchant_product_variants mpv ON mpv.id = ci.merchant_product_variant_id
      LEFT JOIN product_variants pv ON pv.id = mpv.product_variant_id
      WHERE ci.cart_id = ?
      ORDER BY ci.id ASC
    `, [cartId]);

    return rows.map(r => ({
      id: r.id,
      cart_id: r.cart_id,
      merchant_product_id: r.merchant_product_id,
      merchant_product_variant_id: r.merchant_product_variant_id,
      product_name: r.variant_name ? `${r.product_name} (${r.variant_name})` : r.product_name,
      raw_product_name: r.product_name,
      variant_name: r.variant_name || null,
      size: r.size_label || undefined,
      quantity: parseFloat(r.quantity),
      unit_price: parseFloat(r.unit_price),
      line_total: parseFloat(r.line_total),
      customer_notes: r.customer_notes,
    }));
  }

  async addItem(
    cartId: number,
    merchantProductId: number,
    quantity: number = 1,
    customerNotes?: string | null,
    variantNameOrCode?: string
  ): Promise<void> {
    // Look up real merchant product price and branch from DB
    const mpRows = await query<any[]>(`
      SELECT id, merchant_branch_id, base_price, is_available
      FROM merchant_products WHERE id = ? LIMIT 1
    `, [merchantProductId]);

    if (mpRows.length === 0 || !mpRows[0].is_available) {
      throw new Error('Product is unavailable');
    }

    const mp = mpRows[0];
    let unitPrice = parseFloat(mp.base_price);
    const branchId = mp.merchant_branch_id;
    let variantId: number | null = null;

    // Check if variant requested (G-029)
    if (variantNameOrCode) {
      const varRows = await query<any[]>(`
        SELECT mpv.id, mpv.price_delta, pv.name as variant_name, pv.size_label
        FROM merchant_product_variants mpv
        JOIN product_variants pv ON pv.id = mpv.product_variant_id
        WHERE mpv.merchant_product_id = ? 
          AND (LOWER(pv.name) LIKE ? OR LOWER(pv.size_label) LIKE ?)
        LIMIT 1
      `, [merchantProductId, `%${variantNameOrCode.toLowerCase()}%`, `%${variantNameOrCode.toLowerCase()}%`]);

      if (varRows.length > 0) {
        variantId = varRows[0].id;
        unitPrice += parseFloat(varRows[0].price_delta || '0');
      }
    }

    // Check if cart already has items from another merchant
    const cartRows = await query<any[]>(`SELECT merchant_branch_id FROM carts WHERE id = ?`, [cartId]);
    if (cartRows.length > 0 && cartRows[0].merchant_branch_id && cartRows[0].merchant_branch_id !== branchId) {
      // Clear items from other merchant
      await execute(`DELETE FROM cart_items WHERE cart_id = ?`, [cartId]);
    }

    // Set cart branch
    await execute(`UPDATE carts SET merchant_branch_id = ? WHERE id = ?`, [branchId, cartId]);
    await redis.del(`cart:reminder:${cartId}`);

    // Check if item already in cart with same variant
    const existing = await query<any[]>(`
      SELECT id, quantity FROM cart_items
      WHERE cart_id = ? AND merchant_product_id = ? AND (merchant_product_variant_id = ? OR (? IS NULL AND merchant_product_variant_id IS NULL)) LIMIT 1
    `, [cartId, merchantProductId, variantId, variantId]);

    if (existing.length > 0) {
      const newQty = parseFloat(existing[0].quantity) + quantity;
      const newLineTotal = newQty * unitPrice;
      await execute(`
        UPDATE cart_items 
        SET quantity = ?, unit_price = ?, line_total = ?, customer_notes = COALESCE(?, customer_notes)
        WHERE id = ?
      `, [newQty, unitPrice, newLineTotal, customerNotes || null, existing[0].id]);
    } else {
      const lineTotal = quantity * unitPrice;
      await execute(`
        INSERT INTO cart_items (cart_id, merchant_product_id, merchant_product_variant_id, quantity, unit_price, line_total, customer_notes)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `, [cartId, merchantProductId, variantId, quantity, unitPrice, lineTotal, customerNotes || null]);
    }

    await this.recalculateCart(cartId);
  }

  /**
   * Safe item targeting without first-item fallback (G-022)
   */
  async resolveTargetItem(cartId: number, targetQuery: string): Promise<ResolveTargetResult> {
    const items = await this.getCartItems(cartId);
    if (items.length === 0) {
      return { targetItem: null, ambiguous: false, candidates: [] };
    }

    const normalized = targetQuery.toLowerCase().trim();

    // Direct name match
    const directMatches = items.filter(i =>
      i.product_name.toLowerCase().includes(normalized) ||
      (i as any).raw_product_name?.toLowerCase().includes(normalized)
    );

    if (directMatches.length === 1) {
      return { targetItem: directMatches[0], ambiguous: false, candidates: directMatches };
    }

    if (directMatches.length > 1) {
      return { targetItem: null, ambiguous: true, candidates: directMatches };
    }

    // Generic category/type matches (e.g. "meal", "drink", "chicken")
    if (normalized.includes('meal') || normalized.includes('chicken') || normalized.includes('وجبة')) {
      const chickenMatches = items.filter(i => i.product_name.toLowerCase().includes('chicken') || i.product_name.toLowerCase().includes('meal'));
      if (chickenMatches.length === 1) {
        return { targetItem: chickenMatches[0], ambiguous: false, candidates: chickenMatches };
      }
      if (chickenMatches.length > 1) {
        return { targetItem: null, ambiguous: true, candidates: chickenMatches };
      }
    }

    if (normalized.includes('drink') || normalized.includes('coke') || normalized.includes('cola') || normalized.includes('مشروب')) {
      const drinkMatches = items.filter(i => i.product_name.toLowerCase().includes('coke') || i.product_name.toLowerCase().includes('drink'));
      if (drinkMatches.length === 1) {
        return { targetItem: drinkMatches[0], ambiguous: false, candidates: drinkMatches };
      }
      if (drinkMatches.length > 1) {
        return { targetItem: null, ambiguous: true, candidates: drinkMatches };
      }
    }

    // If only one item exists in the whole cart, it's unambiguous
    if (items.length === 1) {
      return { targetItem: items[0], ambiguous: false, candidates: items };
    }

    // Multiple items exist and target query didn't resolve cleanly -> ambiguous!
    return { targetItem: null, ambiguous: true, candidates: items };
  }

  async updateItemQuantity(cartId: number, targetQuery: string, newQuantity: number): Promise<{ success: boolean; ambiguous: boolean; item?: CartItem; candidates?: CartItem[] }> {
    const target = await this.resolveTargetItem(cartId, targetQuery);

    if (target.ambiguous) {
      return { success: false, ambiguous: true, candidates: target.candidates };
    }

    if (!target.targetItem) {
      return { success: false, ambiguous: false };
    }

    const item = target.targetItem;
    if (newQuantity <= 0) {
      await execute(`DELETE FROM cart_items WHERE id = ?`, [item.id]);
    } else {
      const newLineTotal = newQuantity * item.unit_price;
      await execute(`
        UPDATE cart_items SET quantity = ?, line_total = ? WHERE id = ?
      `, [newQuantity, newLineTotal, item.id]);
    }

    await this.recalculateCart(cartId);
    return { success: true, ambiguous: false, item };
  }

  /**
   * Apply real product variant (e.g. Large / Regular) to cart item (G-029)
   */
  async updateItemVariant(cartId: number, targetQuery: string, variantName: string): Promise<{ success: boolean; ambiguous: boolean; item?: CartItem; newPrice?: number; candidates?: CartItem[]; error?: string }> {
    const target = await this.resolveTargetItem(cartId, targetQuery);

    if (target.ambiguous) {
      return { success: false, ambiguous: true, candidates: target.candidates };
    }

    if (!target.targetItem) {
      return { success: false, ambiguous: false };
    }

    const item = target.targetItem;

    // Look up variant for this merchant_product_id
    const varRows = await query<any[]>(`
      SELECT mpv.id, mpv.price_delta, pv.name as variant_name, pv.size_label, mp.base_price
      FROM merchant_product_variants mpv
      JOIN product_variants pv ON pv.id = mpv.product_variant_id
      JOIN merchant_products mp ON mp.id = mpv.merchant_product_id
      WHERE mpv.merchant_product_id = ? 
        AND (LOWER(pv.name) LIKE ? OR LOWER(pv.size_label) LIKE ?)
      LIMIT 1
    `, [item.merchant_product_id, `%${variantName.toLowerCase()}%`, `%${variantName.toLowerCase()}%`]);

    if (varRows.length === 0) {
      // Reject missing variants as a validation error instead of silently falling back to a note (G-060)
      return {
        success: false,
        ambiguous: false,
        item,
        error: `Variant "${variantName}" is not available for ${item.product_name}`,
      };
    }

    const variant = varRows[0];
    const basePrice = parseFloat(variant.base_price);
    const adjustment = parseFloat(variant.price_delta || '0');
    const newUnitPrice = basePrice + adjustment;
    const newLineTotal = item.quantity * newUnitPrice;

    await execute(`
      UPDATE cart_items 
      SET merchant_product_variant_id = ?, unit_price = ?, line_total = ?, customer_notes = ?
      WHERE id = ?
    `, [variant.id, newUnitPrice, newLineTotal, `Size: ${variant.variant_name || variantName}`, item.id]);

    await this.recalculateCart(cartId);
    return { success: true, ambiguous: false, item, newPrice: newUnitPrice };
  }

  async updateItemNotes(cartId: number, targetQuery: string, notes: string): Promise<boolean> {
    const target = await this.resolveTargetItem(cartId, targetQuery);
    if (!target.targetItem) return false;

    await execute(`
      UPDATE cart_items SET customer_notes = ? WHERE id = ?
    `, [notes, target.targetItem.id]);
    await execute(`UPDATE carts SET updated_at = CURRENT_TIMESTAMP(3) WHERE id = ?`, [cartId]);
    await redis.del(`cart:reminder:${cartId}`);

    return true;
  }

  async removeItem(cartId: number, targetQuery: string): Promise<boolean> {
    const target = await this.resolveTargetItem(cartId, targetQuery);
    if (!target.targetItem) return false;

    await execute(`DELETE FROM cart_items WHERE id = ?`, [target.targetItem.id]);
    await this.recalculateCart(cartId);
    await redis.del(`cart:reminder:${cartId}`);
    return true;
  }

  async clearCart(cartId: number): Promise<void> {
    await execute(`DELETE FROM cart_items WHERE cart_id = ?`, [cartId]);
    await execute(`
      UPDATE carts 
      SET merchant_branch_id = NULL, subtotal = 0.00, estimated_delivery_fee = 0.00, estimated_total = 0.00, expires_at = NULL
      WHERE id = ?
    `, [cartId]);
    await redis.del(`cart:reminder:${cartId}`);
  }

  async recalculateCart(cartId: number): Promise<{ subtotal: number; deliveryFee: number; total: number }> {
    const subRows = await query<any[]>(`
      SELECT COALESCE(SUM(line_total), 0) as subtotal FROM cart_items WHERE cart_id = ?
    `, [cartId]);

    const subtotal = parseFloat(subRows[0]?.subtotal) || 0;

    // Look up delivery fee for the cart's branch
    const cart = await query<any[]>(`
      SELECT c.merchant_branch_id, COALESCE(mbz.delivery_fee_override, dz.base_delivery_fee, 1.50) as delivery_fee
      FROM carts c
      LEFT JOIN merchant_branches mb ON mb.id = c.merchant_branch_id
      LEFT JOIN merchant_branch_delivery_zones mbz ON mbz.merchant_branch_id = mb.id
      LEFT JOIN delivery_zones dz ON dz.id = mbz.delivery_zone_id
      WHERE c.id = ?
    `, [cartId]);

    const deliveryFee = subtotal > 0 ? (parseFloat(cart[0]?.delivery_fee) || 1.50) : 0;
    const total = subtotal + deliveryFee;

    await execute(`
      UPDATE carts 
      SET subtotal = ?, estimated_delivery_fee = ?, estimated_total = ?
      WHERE id = ?
    `, [subtotal, deliveryFee, total, cartId]);

    if (subtotal > 0) {
      await redis.del(`cart:reminder:${cartId}`);
    }

    return { subtotal, deliveryFee, total };
  }

  /** Start the 30-minute inactivity watcher used by the live demo server. */
  startAbandonmentScheduler(intervalMs: number = 60_000): void {
    if (this.abandonmentSchedulerStarted) return;
    this.abandonmentSchedulerStarted = true;
    const timer = setInterval(() => {
      this.sendAbandonmentReminders().catch((error) => {
        console.warn('[CartService] Abandonment reminder sweep failed:', error?.message || error);
      });
    }, intervalMs);
    timer.unref?.();
  }

  /** Public for deterministic tests and operational maintenance jobs. */
  async sendAbandonmentReminders(): Promise<number> {
    const carts = await query<any[]>(`
      SELECT c.id, c.customer_id, c.updated_at, cu.whatsapp_number
      FROM carts c
      JOIN customers cu ON cu.id = c.customer_id
      WHERE c.status = 'ACTIVE'
        AND c.updated_at <= DATE_SUB(CURRENT_TIMESTAMP(3), INTERVAL 30 MINUTE)
        AND EXISTS (SELECT 1 FROM cart_items ci WHERE ci.cart_id = c.id)
      ORDER BY c.updated_at ASC
      LIMIT 100
    `);

    let sent = 0;
    for (const cart of carts) {
      const reminderKey = `cart:reminder:${cart.id}`;
      if (await redis.get(reminderKey)) continue;

      const sendResult = await whatsappService.sendMessage(
        cart.whatsapp_number,
        `🛒 You left delicious items in your cart! Reply "view cart" to review and finish your order.`
      );
      await redis.set(reminderKey, JSON.stringify({ sentAt: new Date().toISOString(), success: sendResult.success }), 1800);
      await execute(`UPDATE carts SET expires_at = CURRENT_TIMESTAMP(3) + INTERVAL 30 MINUTE WHERE id = ?`, [cart.id]);
      if (sendResult.success) sent += 1;
    }
    return sent;
  }
}

export const cartService = new CartService();
