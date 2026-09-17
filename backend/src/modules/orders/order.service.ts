import { query, pool, execute } from '../../database/db.js';
import { cartService } from '../carts/cart.service.js';
import { broadcastEvent } from '../../services/websocket.js';
import { Order } from '../../shared/types.js';
import { v4 as uuidv4 } from 'uuid';
import { whatsappService } from '../whatsapp/whatsapp.service.js';
import { config } from '../../config/env.js';
import { convertUsdToLbp } from '../../shared/money.js';
import { sanitizeCustomerOutput } from '../ai/customer-output.js';
import { AppError } from '../../shared/response.js';

export class OrderService {
  private async getCustomerNotificationLanguage(customerId: number): Promise<string> {
    const rows = await query<any[]>(`
      SELECT COALESCE(cp.preferred_language, c.preferred_language, 'en') AS preferred_language
      FROM customers c
      LEFT JOIN customer_preferences cp ON cp.customer_id = c.id
      WHERE c.id = ?
      LIMIT 1
    `, [customerId]);
    const language = String(rows[0]?.preferred_language || 'en').toLowerCase();
    return ['arabizi', 'ar', 'ar_lb', 'mixed', 'fr'].includes(language) ? language : 'en';
  }

  private orderStatusNotification(
    event: 'ACCEPTED' | 'REJECTED' | 'DRIVER_ASSIGNED' | 'PICKED_UP' | 'DELIVERED',
    order: Order,
    language: string,
    preparationMinutes?: number,
    rejectionReason?: string,
  ): string {
    const number = order.order_number;
    const merchant = order.merchant_name || 'the restaurant';
    const captain = order.driver_name || 'Ahmad';
    const address = order.address_label || 'delivery address';
    const minutes = preparationMinutes || 20;

    if (language === 'arabizi') {
      if (event === 'REJECTED') return sanitizeCustomerOutput(`${merchant} ma 2der y2bal talabak ${number}. ${rejectionReason || 'Baddak ndawwerlak 3a option tene?'}`);
      if (event === 'ACCEPTED') return sanitizeCustomerOutput(`Khabar 7elo! ${merchant} 2ebel talabak ${number} w ballash y7addro. Ta2riban ${minutes} d2i2a.`);
      if (event === 'DRIVER_ASSIGNED') return sanitizeCustomerOutput(`Captain ${captain} (${order.driver_code || 'D-101'}) صار ma3ayyan ywasel talabak ${number}.`);
      if (event === 'PICKED_UP') return sanitizeCustomerOutput(`Talabak ${number} صار ma3 Captain ${captain} w 3al tari2 la ${address}.`);
      return sanitizeCustomerOutput(`Talabak ${number} wasal. Sahtein w alf hana! 3tina ta2yim men 1 la 5.`);
    }

    if (language === 'ar' || language === 'ar_lb' || language === 'mixed') {
      if (event === 'REJECTED') return sanitizeCustomerOutput(`تعذر على ${merchant} قبول طلبك ${number}. ${rejectionReason || 'هل تريد أن نبحث عن خيار آخر؟'}`);
      if (event === 'ACCEPTED') return sanitizeCustomerOutput(`تم قبول طلبك ${number} من ${merchant} ويجري تحضيره الآن. الوقت التقريبي ${minutes} دقيقة.`);
      if (event === 'DRIVER_ASSIGNED') return sanitizeCustomerOutput(`تم تعيين الكابتن ${captain} لتوصيل طلبك ${number}.`);
      if (event === 'PICKED_UP') return sanitizeCustomerOutput(`تم استلام طلبك ${number} وهو في الطريق إلى ${address} مع الكابتن ${captain}.`);
      return sanitizeCustomerOutput(`وصل طلبك ${number}. صحتين وعافية! قيّم التوصيل من 1 إلى 5.`);
    }

    if (language === 'fr') {
      if (event === 'REJECTED') return sanitizeCustomerOutput(`${merchant} n’a pas pu accepter votre commande ${number}. ${rejectionReason || 'Voulez-vous une autre option ?'}`);
      if (event === 'ACCEPTED') return sanitizeCustomerOutput(`Bonne nouvelle : ${merchant} a accepté votre commande ${number} et la prépare. Environ ${minutes} minutes.`);
      if (event === 'DRIVER_ASSIGNED') return sanitizeCustomerOutput(`Le capitaine ${captain} est chargé de livrer votre commande ${number}.`);
      if (event === 'PICKED_UP') return sanitizeCustomerOutput(`Votre commande ${number} est en route vers ${address} avec le capitaine ${captain}.`);
      return sanitizeCustomerOutput(`Votre commande ${number} est arrivée. Bon appétit ! Notez la livraison de 1 à 5.`);
    }

    if (event === 'REJECTED') return sanitizeCustomerOutput(`${merchant} could not accept your order ${number}. ${rejectionReason || 'Would you like another option?'}`);
    if (event === 'ACCEPTED') return sanitizeCustomerOutput(`Great news! ${merchant} accepted your order ${number} and is preparing it now. About ${minutes} minutes.`);
    if (event === 'DRIVER_ASSIGNED') return sanitizeCustomerOutput(`Captain ${captain} (${order.driver_code || 'D-101'}) has been assigned to deliver your order ${number}.`);
    if (event === 'PICKED_UP') return sanitizeCustomerOutput(`Your order ${number} has been picked up by Captain ${captain} and is on the way to ${address}.`);
    return sanitizeCustomerOutput(`Your order ${number} has arrived. Enjoy! Please rate the delivery from 1 to 5.`);
  }

  private async notifyCustomerOrderStatus(
    event: 'ACCEPTED' | 'REJECTED' | 'DRIVER_ASSIGNED' | 'PICKED_UP' | 'DELIVERED',
    order: Order,
    preparationMinutes?: number,
    rejectionReason?: string,
  ): Promise<void> {
    if (!order.customer_phone) return;
    const language = await this.getCustomerNotificationLanguage(order.customer_id);
    await whatsappService.sendMessage(
      order.customer_phone,
      this.orderStatusNotification(event, order, language, preparationMinutes, rejectionReason),
    );
  }

  /**
   * Create Order from Active Cart with Idempotency and Checkout Revalidation (G-032, G-033)
   */
  async createOrderFromCart(
    customerId: number,
    addressId: number,
    customerNotes?: string | null,
    idempotencyKey?: string,
    options?: { cartId?: number; orderBatchId?: number; conversationId?: number }
  ): Promise<Order> {
    const conn = await pool.getConnection();

    try {
      await conn.beginTransaction();

      // Durable Idempotency Key Check (G-033)
      if (idempotencyKey) {
        const [existingKeyRows]: any = await conn.query(
          `SELECT id, response_json FROM idempotency_keys 
           WHERE scope = 'ORDER_CREATE' AND idempotency_key = ? LIMIT 1`,
          [idempotencyKey]
        );

        if (existingKeyRows.length > 0 && existingKeyRows[0].response_json) {
          await conn.rollback();
          const savedOrder = typeof existingKeyRows[0].response_json === 'string'
            ? JSON.parse(existingKeyRows[0].response_json)
            : existingKeyRows[0].response_json;
          return savedOrder as Order;
        }
      }

      // Fetch active cart
      const cart = options?.cartId
        ? await cartService.getCartById(options.cartId)
        : await cartService.getOrCreateActiveCart(customerId);
      if (cart.items.length === 0) {
        throw new Error('Cannot checkout an empty cart');
      }
      if (!cart.merchant_branch_id) {
        throw new Error('Cart has no assigned merchant');
      }

      const effectiveKey = idempotencyKey || `order_confirm:${customerId}:${cart.id}`;
      const [existingKeyRows]: any = await conn.query(
        `SELECT id, response_json FROM idempotency_keys 
         WHERE scope = 'ORDER_CREATE' AND idempotency_key = ? LIMIT 1`,
        [effectiveKey]
      );

      if (existingKeyRows.length > 0 && existingKeyRows[0].response_json) {
        await conn.rollback();
        const savedOrder = typeof existingKeyRows[0].response_json === 'string'
          ? JSON.parse(existingKeyRows[0].response_json)
          : existingKeyRows[0].response_json;
        return savedOrder as Order;
      }

      // Revalidate branch and merchant (G-032)
      const [branchRows]: any = await conn.query(`
        SELECT mb.merchant_id, mb.id as branch_id, m.name as merchant_name, m.accepts_orders as merchant_accepts, mb.accepts_orders as branch_accepts
        FROM merchant_branches mb
        JOIN merchants m ON m.id = mb.merchant_id
        WHERE mb.id = ? LIMIT 1
      `, [cart.merchant_branch_id]);

      if (branchRows.length === 0 || !branchRows[0].merchant_accepts || !branchRows[0].branch_accepts) {
        throw new Error('Merchant is currently not accepting orders');
      }

      const merchantId = branchRows[0].merchant_id;
      const merchantBranchId = branchRows[0].branch_id;

      // Revalidate address (G-032)
      const [addrRows]: any = await conn.query(`
        SELECT id, label, formatted_address FROM customer_addresses WHERE id = ? AND customer_id = ? LIMIT 1
      `, [addressId, customerId]);

      if (addrRows.length === 0) {
        throw new Error('Selected address not found for customer');
      }

      // Revalidate Item Availability & Price Freshness (G-032)
      let recalculatedSubtotal = 0;
      for (const item of cart.items) {
        const [mpRows]: any = await conn.query(`
          SELECT mp.id, mp.base_price, mp.is_available, p.canonical_name
          FROM merchant_products mp
          JOIN products p ON p.id = mp.product_id
          WHERE mp.id = ? FOR UPDATE
        `, [item.merchant_product_id]);

        if (mpRows.length === 0 || !mpRows[0].is_available) {
          throw new Error(`Product "${item.product_name}" is currently out of stock`);
        }

        let freshUnitPrice = parseFloat(mpRows[0].base_price);
        if (item.merchant_product_variant_id) {
          const [varRows]: any = await conn.query(`
            SELECT price_delta FROM merchant_product_variants WHERE id = ? LIMIT 1
          `, [item.merchant_product_variant_id]);
          if (varRows.length > 0) {
            freshUnitPrice += parseFloat(varRows[0].price_delta || '0');
          }
        }

        recalculatedSubtotal += freshUnitPrice * item.quantity;
      }

      const deliveryFee = cart.estimated_delivery_fee;
      const grandTotal = recalculatedSubtotal + deliveryFee;

      // Generate order number e.g. ORD-2026-9382
      const randomSuffix = Math.floor(1000 + Math.random() * 9000);
      const orderNumber = `ORD-2026-${randomSuffix}`;
      const publicId = uuidv4();

      // Insert Order
      const [insertRes]: any = await conn.query(`
        INSERT INTO orders (
          public_id, order_number, customer_id, conversation_id, cart_id, order_batch_id, merchant_id, merchant_branch_id,
          customer_address_id, status, payment_method_code, payment_status, currency,
          subtotal, delivery_fee, grand_total, customer_notes, confirmed_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'CONFIRMED', 'CASH', 'PENDING', 'USD', ?, ?, ?, ?, NOW())
      `, [
        publicId,
        orderNumber,
        customerId,
        options?.conversationId || null,
        cart.id,
        options?.orderBatchId || null,
        merchantId,
        merchantBranchId,
        addressId,
        recalculatedSubtotal,
        deliveryFee,
        grandTotal,
        customerNotes || null,
      ]);

      const orderId = insertRes.insertId;

      // Insert Order Items
      for (const item of cart.items) {
        await conn.query(`
          INSERT INTO order_items (
            order_id, merchant_product_id, product_name_snapshot, quantity, unit_price, line_total, customer_notes
          ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `, [
          orderId,
          item.merchant_product_id,
          item.product_name,
          item.quantity,
          item.unit_price,
          item.line_total,
          item.customer_notes || null,
        ]);
      }

      // Status history: CONFIRMED
      await conn.query(`
        INSERT INTO order_status_history (order_id, previous_status, new_status, actor_type, note)
        VALUES (?, NULL, 'CONFIRMED', 'CUSTOMER', 'Customer confirmed order via WhatsApp')
      `, [orderId]);

      // Create private delivery communication channel
      await conn.query(`
        INSERT INTO delivery_channels (public_id, order_id, customer_id, driver_id, status)
        VALUES (?, ?, ?, 1, 'OPEN')
      `, [uuidv4(), orderId, customerId]);

      // Clear customer's active cart items so cart is marked checked out
      await conn.query(`UPDATE carts SET status = 'CHECKED_OUT' WHERE id = ?`, [cart.id]);

      // Fetch created order before commit
      const [oRows]: any = await conn.query(`
        SELECT 
          o.*,
          c.display_name as customer_name,
          c.whatsapp_number as customer_phone,
          m.name as merchant_name,
          d.display_code as driver_code,
          d.full_name_private as driver_name,
          ca.label as address_label,
          ca.formatted_address,
          ca.delivery_notes
        FROM orders o
        JOIN customers c ON c.id = o.customer_id
        JOIN merchants m ON m.id = o.merchant_id
        LEFT JOIN drivers d ON d.id = o.driver_id
        JOIN customer_addresses ca ON ca.id = o.customer_address_id
        WHERE o.id = ? LIMIT 1
      `, [orderId]);

      const [itemRows]: any = await conn.query(`SELECT * FROM order_items WHERE order_id = ?`, [orderId]);

      const createdOrder: Order = {
        id: oRows[0].id,
        public_id: oRows[0].public_id,
        order_number: oRows[0].order_number,
        customer_id: oRows[0].customer_id,
        customer_name: oRows[0].customer_name,
        customer_phone: oRows[0].customer_phone,
        merchant_id: oRows[0].merchant_id,
        merchant_branch_id: oRows[0].merchant_branch_id,
        merchant_name: oRows[0].merchant_name,
        driver_id: oRows[0].driver_id,
        driver_name: oRows[0].driver_name,
        driver_code: oRows[0].driver_code,
        customer_address_id: oRows[0].customer_address_id,
        address_label: oRows[0].address_label,
        formatted_address: oRows[0].formatted_address,
        delivery_notes: oRows[0].delivery_notes,
        status: oRows[0].status,
        subtotal: parseFloat(oRows[0].subtotal),
        delivery_fee: parseFloat(oRows[0].delivery_fee),
        grand_total: parseFloat(oRows[0].grand_total),
        lbp_exchange_rate: config.settlement.lbpPerUsd,
        grand_total_lbp: convertUsdToLbp(parseFloat(oRows[0].grand_total)),
        currency: oRows[0].currency,
        customer_notes: oRows[0].customer_notes,
        created_at: oRows[0].created_at,
        updated_at: oRows[0].updated_at,
        items: itemRows,
        timeline: [],
      };

      // Record Idempotency Key (G-033)
      await conn.query(
        `INSERT INTO idempotency_keys (idempotency_key, scope, response_status, response_json, expires_at)
         VALUES (?, 'ORDER_CREATE', 200, ?, NOW() + INTERVAL 24 HOUR)
         ON DUPLICATE KEY UPDATE response_json = VALUES(response_json)`,
        [effectiveKey, JSON.stringify(createdOrder)]
      );

      await conn.commit();

      // Broadcast live event to connected dashboard (G-009)
      broadcastEvent('ORDER_CREATED', createdOrder);

      return createdOrder;
    } catch (error) {
      await conn.rollback();
      throw error;
    } finally {
      conn.release();
    }
  }

  async getOrderById(orderId: number): Promise<Order | null> {
    const rows = await query<any[]>(`
      SELECT 
        o.*,
        c.display_name as customer_name,
        c.whatsapp_number as customer_phone,
        m.name as merchant_name,
        d.display_code as driver_code,
        d.full_name_private as driver_name,
        d.whatsapp_number as driver_whatsapp_number,
        ca.label as address_label,
        ca.formatted_address,
        ca.delivery_notes
      FROM orders o
      JOIN customers c ON c.id = o.customer_id
      JOIN merchants m ON m.id = o.merchant_id
      LEFT JOIN drivers d ON d.id = o.driver_id
      LEFT JOIN customer_addresses ca ON ca.id = o.customer_address_id
      WHERE o.id = ? LIMIT 1
    `, [orderId]);

    if (rows.length === 0) return null;

    const items = await query<any[]>(`
      SELECT * FROM order_items WHERE order_id = ?
    `, [orderId]);

    const timeline = await query<any[]>(`
      SELECT * FROM order_status_history WHERE order_id = ? ORDER BY created_at ASC
    `, [orderId]);

    const o = rows[0];
    return {
      id: o.id,
      public_id: o.public_id,
      order_number: o.order_number,
      customer_id: o.customer_id,
      customer_name: o.customer_name,
      customer_phone: o.customer_phone,
      merchant_id: o.merchant_id,
      merchant_branch_id: o.merchant_branch_id,
      merchant_name: o.merchant_name,
      driver_id: o.driver_id,
      driver_name: o.driver_name,
      driver_code: o.driver_code,
      driver_whatsapp_number: o.driver_whatsapp_number,
      customer_address_id: o.customer_address_id,
      address_label: o.address_label,
      formatted_address: o.formatted_address,
      delivery_notes: o.delivery_notes,
      status: o.status,
      subtotal: parseFloat(o.subtotal),
      delivery_fee: parseFloat(o.delivery_fee),
      grand_total: parseFloat(o.grand_total),
      lbp_exchange_rate: config.settlement.lbpPerUsd,
      grand_total_lbp: convertUsdToLbp(parseFloat(o.grand_total)),
      currency: o.currency,
      customer_notes: o.customer_notes,
      created_at: o.created_at,
      updated_at: o.updated_at,
      items,
      timeline,
    };
  }

  async getLiveOrders(): Promise<Order[]> {
    const orders = await query<any[]>(`
      SELECT 
        o.id,
        o.public_id,
        o.order_number,
        o.status,
        o.grand_total,
        o.currency,
        o.created_at,
        o.updated_at,
        c.display_name as customer_name,
        c.whatsapp_number as customer_phone,
        m.name as merchant_name,
        d.display_code as driver_code,
        d.full_name_private as driver_name,
        d.whatsapp_number as driver_whatsapp_number,
        ca.label as address_label,
        ca.formatted_address
      FROM orders o
      JOIN customers c ON c.id = o.customer_id
      JOIN merchants m ON m.id = o.merchant_id
      LEFT JOIN drivers d ON d.id = o.driver_id
      LEFT JOIN customer_addresses ca ON ca.id = o.customer_address_id
      ORDER BY o.created_at DESC
      LIMIT 50
    `);

    return orders.map(o => ({
      ...o,
      grand_total: parseFloat(o.grand_total),
      lbp_exchange_rate: config.settlement.lbpPerUsd,
      grand_total_lbp: convertUsdToLbp(parseFloat(o.grand_total)),
    }));
  }

  /**
   * Get latest active order for a customer (for status check tool)
   */
  async getCustomerActiveOrder(customerId: number): Promise<any | null> {
    const activeOrders = await query<any[]>(`
      SELECT o.*, m.name as merchant_name, d.full_name_private as driver_name, d.display_code as driver_code
      FROM orders o
      JOIN merchants m ON m.id = o.merchant_id
      LEFT JOIN drivers d ON d.id = o.driver_id
      WHERE o.customer_id = ? AND o.status NOT IN ('DELIVERED', 'CANCELLED', 'MERCHANT_REJECTED')
      ORDER BY o.created_at DESC LIMIT 1
    `, [customerId]);

    return activeOrders.length > 0 ? activeOrders[0] : null;
  }

  /**
   * Merchant: Accept Order (G-034 State Validated)
   */
  async merchantAccept(orderId: number, preparationMinutes: number = 20): Promise<Order> {
    const current = await this.getOrderById(orderId);
    if (!current) throw new Error(`Order ${orderId} not found`);

    if (current.status !== 'CONFIRMED') {
      throw new Error(`Invalid status transition: Cannot accept order in status "${current.status}"`);
    }

    await execute(`
      UPDATE orders 
      SET status = 'PREPARING', merchant_accepted_at = NOW(), ready_at = NOW() + INTERVAL ? MINUTE
      WHERE id = ?
    `, [preparationMinutes, orderId]);

    await execute(`
      INSERT INTO order_status_history (order_id, previous_status, new_status, actor_type, note)
      VALUES (?, 'CONFIRMED', 'PREPARING', 'MERCHANT', 'Merchant accepted order. Preparing.')
    `, [orderId]);

    // Automatically trigger driver offer dispatch
    await this.dispatchToDriver(orderId);

    const updated = (await this.getOrderById(orderId))!;
    broadcastEvent('ORDER_UPDATED', updated);

    // Emit language-matched, plain-text customer notification.
    await this.notifyCustomerOrderStatus('ACCEPTED', updated, preparationMinutes);

    return updated;
  }

  /**
   * Merchant: Reject Order (G-034, G-036)
   */
  async merchantReject(orderId: number, reason: string = 'Kitchen at full capacity'): Promise<Order> {
    const current = await this.getOrderById(orderId);
    if (!current) throw new Error(`Order ${orderId} not found`);

    if (current.status !== 'CONFIRMED') {
      throw new Error(`Invalid status transition: Cannot reject order in status "${current.status}"`);
    }

    await execute(`
      UPDATE orders 
      SET status = 'MERCHANT_REJECTED', merchant_rejected_at = NOW(), cancellation_reason = ?
      WHERE id = ?
    `, [reason, orderId]);

    await execute(`
      INSERT INTO order_status_history (order_id, previous_status, new_status, actor_type, note)
      VALUES (?, 'CONFIRMED', 'MERCHANT_REJECTED', 'MERCHANT', ?)
    `, [orderId, `Merchant rejected order: ${reason}`]);

    const updated = (await this.getOrderById(orderId))!;
    broadcastEvent('ORDER_UPDATED', updated);

    // Keep even failure updates language-matched and free of presentation markup.
    await this.notifyCustomerOrderStatus('REJECTED', updated, undefined, reason);

    return updated;
  }

  /**
   * Merchant: Mark Order Ready for Pickup (G-058)
   */
  async merchantReady(orderId: number): Promise<Order> {
    const current = await this.getOrderById(orderId);
    if (!current) throw new Error(`Order ${orderId} not found`);

    if (current.status !== 'PREPARING') {
      throw new Error(`Invalid status transition: Cannot mark order ready in status "${current.status}". Expected "PREPARING".`);
    }

    await execute(`
      UPDATE orders 
      SET status = 'READY_FOR_PICKUP', ready_at = NOW()
      WHERE id = ?
    `, [orderId]);

    await execute(`
      INSERT INTO order_status_history (order_id, previous_status, new_status, actor_type, note)
      VALUES (?, 'PREPARING', 'READY_FOR_PICKUP', 'MERCHANT', 'Merchant marked order ready for pickup')
    `, [orderId]);

    const updated = (await this.getOrderById(orderId))!;
    broadcastEvent('ORDER_UPDATED', updated);

    // Outbound customer notification
    if (updated.customer_phone) {
      await whatsappService.sendMessage(
        updated.customer_phone,
        `🥡 Your order #${updated.order_number} from *${updated.merchant_name}* is freshly prepared and ready for pickup!`
      );
    }

    return updated;
  }

  /**
   * Driver: Reject Delivery Offer & Reassign to Next Available Driver (G-058)
   */
  async driverReject(orderId: number, driverId?: number, reason: string = 'Driver unavailable / vehicle issue', actingDriverId?: number): Promise<Order> {
    const current = await this.getOrderById(orderId);
    if (!current) throw new Error(`Order ${orderId} not found`);

    const rejectedDriverId = driverId || current.driver_id || 1;
    if (actingDriverId && actingDriverId !== rejectedDriverId) {
      throw new AppError('A driver may reject only their own delivery offer.', 403, 'DRIVER_ACTOR_MISMATCH');
    }
    if (actingDriverId) {
      const offers = await query<any[]>(`
        SELECT id FROM driver_offers
         WHERE order_id = ? AND driver_id = ? AND status IN ('OFFERED', 'PENDING')
         ORDER BY attempt_no DESC LIMIT 1
      `, [orderId, actingDriverId]);
      if (!offers[0] && current.driver_id !== actingDriverId) {
        throw new AppError('This driver has no active offer for the order.', 403, 'DRIVER_OFFER_NOT_OWNED');
      }
    }

    // Record offer rejection in driver_offers table
    await execute(`
      UPDATE driver_offers 
      SET status = 'REJECTED', rejection_reason = ?, responded_at = NOW()
      WHERE order_id = ? AND driver_id = ?
    `, [reason, orderId, rejectedDriverId]);

    await execute(`
      INSERT INTO order_status_history (order_id, previous_status, new_status, actor_type, note)
      VALUES (?, ?, 'WAITING_FOR_DRIVER', 'DRIVER', ?)
    `, [orderId, current.status, `Driver offer rejected: ${reason}. Reassigning.`]);

    // Reset order driver assignment and status to WAITING_FOR_DRIVER
    await execute(`
      UPDATE orders SET driver_id = NULL, status = 'WAITING_FOR_DRIVER' WHERE id = ?
    `, [orderId]);

    // Reassign to next available driver (excluding rejected driver)
    const nextDrivers = await query<any[]>(`
      SELECT id, display_code, full_name_private FROM drivers 
      WHERE status = 'ACTIVE' AND availability_status = 'AVAILABLE' AND id != ?
        AND NOT EXISTS (
          SELECT 1 FROM driver_offers rejected
          WHERE rejected.order_id = ? AND rejected.driver_id = drivers.id AND rejected.status = 'REJECTED'
        )
      ORDER BY rating DESC LIMIT 1
    `, [rejectedDriverId, orderId]);

    if (nextDrivers.length > 0) {
      const nextDriver = nextDrivers[0];
      const attemptRows = await query<any[]>(`
        SELECT COALESCE(MAX(attempt_no), 0) + 1 AS next_attempt FROM driver_offers WHERE order_id = ?
      `, [orderId]);
      const nextAttempt = Number(attemptRows[0]?.next_attempt || 1);

      await execute(`
        INSERT INTO driver_offers (public_id, order_id, driver_id, attempt_no, status, expires_at)
        VALUES (?, ?, ?, ?, 'OFFERED', NOW() + INTERVAL 60 SECOND)
      `, [uuidv4(), orderId, nextDriver.id, nextAttempt]);

      await execute(`
        UPDATE delivery_channels SET driver_id = ? WHERE order_id = ?
      `, [nextDriver.id, orderId]);

      broadcastEvent('DRIVER_OFFER_SENT', { orderId, driverId: nextDriver.id });
    } else {
      await this.raiseNoDriversAvailable(orderId, `No available driver accepted the offer after driver ${rejectedDriverId} rejected it.`);
    }

    const updated = (await this.getOrderById(orderId))!;
    broadcastEvent('ORDER_UPDATED', updated);
    return updated;
  }

  /**
   * Dispatch: Send offer to first available driver
   */
  async dispatchToDriver(orderId: number): Promise<void> {
    const drivers = await query<any[]>(`
      SELECT id FROM drivers 
      WHERE status = 'ACTIVE' AND availability_status = 'AVAILABLE'
      ORDER BY rating DESC LIMIT 1
    `);

    if (drivers.length > 0) {
      const driverId = drivers[0].id;
      await execute(`
        INSERT INTO driver_offers (public_id, order_id, driver_id, attempt_no, status, expires_at)
        VALUES (?, ?, ?, 1, 'OFFERED', NOW() + INTERVAL 60 SECOND)
        ON DUPLICATE KEY UPDATE status = 'OFFERED'
      `, [uuidv4(), orderId, driverId]);

      await execute(`
        UPDATE delivery_channels SET driver_id = ? WHERE order_id = ?
      `, [driverId, orderId]);

      broadcastEvent('DRIVER_OFFER_SENT', { orderId, driverId });
    } else {
      await execute(`
        UPDATE orders SET status = 'WAITING_FOR_DRIVER'
        WHERE id = ? AND status = 'PREPARING'
      `, [orderId]);
      await execute(`
        INSERT INTO order_status_history (order_id, previous_status, new_status, actor_type, note)
        SELECT id, 'PREPARING', 'WAITING_FOR_DRIVER', 'SYSTEM', 'No drivers currently available; dispatcher escalation created.'
        FROM orders WHERE id = ? AND status = 'WAITING_FOR_DRIVER'
      `, [orderId]);
      await this.raiseNoDriversAvailable(orderId, 'No drivers are currently available for dispatch.');
    }
  }

  private async raiseNoDriversAvailable(orderId: number, detail: string): Promise<void> {
    const order = await this.getOrderById(orderId);
    if (!order) return;

    const title = `No drivers available for ${order.order_number}`;
    await execute(`
      INSERT INTO operational_alerts
        (public_id, alert_type, severity, entity_type, entity_id, order_id, title, description, status)
      VALUES (?, 'NO_DRIVERS_AVAILABLE', 'CRITICAL', 'ORDER', ?, ?, ?, ?, 'OPEN')
    `, [uuidv4(), orderId, orderId, title, detail]);

    await execute(`
      INSERT INTO notifications
        (public_id, recipient_type, customer_id, channel, notification_type, title, body, payload_json, status, sent_at)
      VALUES (?, 'CUSTOMER', ?, 'WHATSAPP', 'NO_DRIVERS_AVAILABLE', ?, ?, ?, 'PENDING', NULL)
    `, [uuidv4(), order.customer_id, title, `Your order #${order.order_number} is taking a little longer while we assign an available driver. We will keep you updated with a new ETA.`, JSON.stringify({ orderId, reason: detail })]);

    broadcastEvent('NO_DRIVERS_AVAILABLE', {
      orderId,
      orderNumber: order.order_number,
      status: order.status,
      detail,
    });

    if (order.customer_phone) {
      await whatsappService.sendMessage(
        order.customer_phone,
        `⏳ We need a few extra minutes for order #${order.order_number}: all nearby drivers are currently busy. We are assigning the next available Captain and will update your ETA shortly.`
      );
    }
  }

  /**
   * Driver: Accept Delivery Offer (G-034 State Validated)
   */
  async driverAccept(orderId: number, driverId?: number, actingDriverId?: number): Promise<Order> {
    const connection = await pool.getConnection();
    let committed = false;
    try {
      await connection.beginTransaction();
      const [orderRows] = await connection.execute<any[]>(`SELECT * FROM orders WHERE id = ? FOR UPDATE`, [orderId]);
      const current = orderRows[0];
      if (!current) throw new Error(`Order ${orderId} not found`);
      if (!['PREPARING', 'WAITING_FOR_DRIVER', 'READY_FOR_PICKUP'].includes(current.status)) {
        throw new Error(`Invalid status transition: Cannot accept delivery for order in status "${current.status}"`);
      }

      let targetDriverId = driverId;
      if (!targetDriverId) {
        const [availableDrivers] = await connection.execute<any[]>(`
          SELECT id FROM drivers
           WHERE status = 'ACTIVE' AND availability_status IN ('AVAILABLE', 'ONLINE')
           ORDER BY id ASC LIMIT 1 FOR UPDATE
        `);
        targetDriverId = availableDrivers[0]?.id;
      }
      if (!targetDriverId) throw new Error('No available driver can accept this order');
      if (actingDriverId && targetDriverId !== actingDriverId) {
        throw new AppError('A driver may accept only their own delivery offer.', 403, 'DRIVER_ACTOR_MISMATCH');
      }

      const [driverRows] = await connection.execute<any[]>(`SELECT id, status, availability_status FROM drivers WHERE id = ? FOR UPDATE`, [targetDriverId]);
      if (!driverRows[0] || driverRows[0].status !== 'ACTIVE' || !['AVAILABLE', 'ONLINE'].includes(driverRows[0].availability_status)) {
        throw new Error('The selected driver is not available');
      }
      if (actingDriverId) {
        const [offerRows] = await connection.execute<any[]>(`
          SELECT id FROM driver_offers
           WHERE order_id = ? AND driver_id = ? AND status IN ('OFFERED', 'PENDING')
           ORDER BY attempt_no DESC LIMIT 1 FOR UPDATE
        `, [orderId, targetDriverId]);
        if (!offerRows[0] && current.driver_id !== targetDriverId) {
          throw new AppError('This driver has no active offer for the order.', 403, 'DRIVER_OFFER_NOT_OWNED');
        }
      }

      await connection.execute(`
        UPDATE orders SET driver_id = ?, status = 'DRIVER_ASSIGNED', driver_assigned_at = NOW() WHERE id = ?
      `, [targetDriverId, orderId]);
      await connection.execute(`
        UPDATE drivers SET availability_status = 'BUSY', current_order_count = current_order_count + 1 WHERE id = ?
      `, [targetDriverId]);
      await connection.execute(`
        UPDATE driver_offers SET status = 'ACCEPTED', responded_at = NOW()
         WHERE order_id = ? AND driver_id = ? AND status IN ('OFFERED', 'PENDING')
      `, [orderId, targetDriverId]);
      await connection.execute(`
        INSERT INTO order_status_history (order_id, previous_status, new_status, actor_type, note)
        VALUES (?, ?, 'DRIVER_ASSIGNED', 'DRIVER', 'Driver accepted delivery assignment')
      `, [orderId, current.status]);
      await connection.commit();
      committed = true;
    } finally {
      if (!committed) await connection.rollback();
      connection.release();
    }

    const updated = (await this.getOrderById(orderId))!;
    broadcastEvent('ORDER_UPDATED', updated);

    // Outbound customer notification in the customer's saved conversation language.
    await this.notifyCustomerOrderStatus('DRIVER_ASSIGNED', updated);

    return updated;
  }

  /**
   * Driver: Picked Up (G-034 State Validated)
   */
  async driverPickup(orderId: number, actingDriverId?: number): Promise<Order> {
    const current = await this.getOrderById(orderId);
    if (!current) throw new Error(`Order ${orderId} not found`);
    if (actingDriverId && current.driver_id !== actingDriverId) {
      throw new AppError('A driver may pick up only their assigned order.', 403, 'DRIVER_ORDER_NOT_OWNED');
    }

    if (current.status !== 'DRIVER_ASSIGNED') {
      throw new Error(`Invalid status transition: Cannot pick up order in status "${current.status}". Expected "DRIVER_ASSIGNED".`);
    }

    await execute(`
      UPDATE orders 
      SET status = 'PICKED_UP', picked_up_at = NOW()
      WHERE id = ?
    `, [orderId]);

    await execute(`
      INSERT INTO order_status_history (order_id, previous_status, new_status, actor_type, note)
      VALUES (?, 'DRIVER_ASSIGNED', 'PICKED_UP', 'DRIVER', 'Order picked up from merchant. On the way.')
    `, [orderId]);

    const updated = (await this.getOrderById(orderId))!;
    broadcastEvent('ORDER_UPDATED', updated);

    // The selected label (for example Home) is loaded from the verified address record.
    await this.notifyCustomerOrderStatus('PICKED_UP', updated);

    return updated;
  }

  /**
   * Driver: Delivered (G-034 State Validated)
   */
  async driverDeliver(orderId: number, rating?: number, comment?: string, actingDriverId?: number): Promise<Order> {
    const current = await this.getOrderById(orderId);
    if (!current) throw new Error(`Order ${orderId} not found`);
    if (actingDriverId && current.driver_id !== actingDriverId) {
      throw new AppError('A driver may deliver only their assigned order.', 403, 'DRIVER_ORDER_NOT_OWNED');
    }

    if (current.status !== 'PICKED_UP') {
      throw new Error(`Invalid status transition: Cannot deliver order in status "${current.status}". Expected "PICKED_UP".`);
    }

    await execute(`
      UPDATE orders 
      SET status = 'DELIVERED', delivered_at = NOW(), completed_at = NOW(), payment_status = 'PAID'
      WHERE id = ?
    `, [orderId]);

    // Free driver
    if (current.driver_id) {
      await execute(`
        UPDATE drivers 
        SET availability_status = 'AVAILABLE', current_order_count = GREATEST(0, current_order_count - 1)
        WHERE id = ?
      `, [current.driver_id]);
    }

    await execute(`
      INSERT INTO order_status_history (order_id, previous_status, new_status, actor_type, note)
      VALUES (?, 'PICKED_UP', 'DELIVERED', 'DRIVER', 'Order successfully delivered to customer')
    `, [orderId]);

    if (rating && current.customer_id) {
      await execute(`
        INSERT INTO order_reviews (order_id, customer_id, overall_rating, comment)
        VALUES (?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE overall_rating = VALUES(overall_rating), comment = VALUES(comment)
      `, [orderId, current.customer_id, rating, comment || null]);
    }

    // The masked relay remains available briefly for delivery follow-up, then
    // the expiry worker locks it without exposing either party's phone number.
    await execute(`
      UPDATE delivery_channels
         SET expires_at = COALESCE(expires_at, DATE_ADD(NOW(), INTERVAL 30 MINUTE))
       WHERE order_id = ? AND status = 'OPEN'
    `, [orderId]);

    const updated = (await this.getOrderById(orderId))!;
    broadcastEvent('ORDER_UPDATED', updated);

    // Outbound customer notification asking for a review in the same language.
    await this.notifyCustomerOrderStatus('DELIVERED', updated);

    return updated;
  }

  private async getAssignedOrFirstDriver(orderId: number): Promise<number> {
    const o = await query<any[]>(`SELECT driver_id FROM orders WHERE id = ?`, [orderId]);
    if (o[0]?.driver_id) return o[0].driver_id;
    const d = await query<any[]>(`SELECT id FROM drivers WHERE status='ACTIVE' LIMIT 1`);
    return d[0]?.id || 1;
  }
}

export const orderService = new OrderService();
