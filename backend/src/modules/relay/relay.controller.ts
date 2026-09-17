import { Request, Response } from 'express';
import { relayService } from './relay.service.js';
import { sendSuccess, sendError } from '../../shared/response.js';
import { query, execute } from '../../database/db.js';

export async function getRelayMessages(req: Request, res: Response) {
  try {
    const orderId = parseInt(req.params.orderId, 10);
    if (isNaN(orderId)) return sendError(res, 'Invalid order ID', 400);

    const user = req.user;
    if (!user) return sendError(res, 'Authentication required', 401);

    // Look up channel and order (G-040, G-058)
    const channel = await relayService.getDeliveryChannel(orderId);
    let orderCustomer = channel?.customer_id;
    let orderDriver = channel?.driver_id;

    if (!channel) {
      const ord: any = await query(`SELECT customer_id, driver_id FROM orders WHERE id = ?`, [orderId]);
      if (ord.length === 0) return sendError(res, 'Order not found', 404);
      orderCustomer = ord[0].customer_id;
      orderDriver = ord[0].driver_id;
    }

    if (channel && !relayService.isChannelOpen(channel)) {
      return sendError(res, 'This private relay channel is closed', 403);
    }

    // Role-based channel access validation: prevent drivers/customers from reading unrelated orders
    if (user.role === 'DRIVER') {
      if (!user.driverId || user.driverId !== orderDriver) {
        return sendError(res, 'Forbidden: Driver is not assigned to this order relay channel', 403);
      }
    } else if (user.role === 'CUSTOMER') {
      if (!user.customerId || user.customerId !== orderCustomer) {
        return sendError(res, 'Forbidden: Customer does not own this order relay channel', 403);
      }
    } else if (!['SUPERADMIN', 'ADMIN', 'OPERATOR', 'DISPATCHER'].includes(user.role)) {
      return sendError(res, 'Forbidden: Unauthorized to access relay channel', 403);
    }

    const messages = await relayService.getMessagesForOrder(orderId);
    return sendSuccess(res, messages);
  } catch (error: any) {
    return sendError(res, error);
  }
}

export async function sendRelayMessage(req: Request, res: Response) {
  try {
    const orderId = parseInt(req.params.orderId, 10);
    if (isNaN(orderId)) return sendError(res, 'Invalid order ID', 400);

    const text = (req.body.text || req.body.message || '').trim();
    if (!text) return sendError(res, 'Message text is required', 400);

    const user = req.user;
    if (!user) return sendError(res, 'Authentication required', 401);

    // Look up channel and order
    const channel = await relayService.getDeliveryChannel(orderId);
    let orderCustomer = channel?.customer_id;
    let orderDriver = channel?.driver_id;

    if (!channel) {
      const ord: any = await query(`SELECT customer_id, driver_id FROM orders WHERE id = ?`, [orderId]);
      if (ord.length === 0) return sendError(res, 'Order not found', 404);
      orderCustomer = ord[0].customer_id;
      orderDriver = ord[0].driver_id;
    }

    if (channel && !relayService.isChannelOpen(channel)) {
      return sendError(res, 'This private relay channel is closed', 403);
    }

    let senderRole: 'CUSTOMER' | 'DRIVER' | 'SYSTEM';

    // NEVER trust senderRole, senderType, driverId, or customerId from request body (G-040, G-058)
    if (user.role === 'DRIVER') {
      if (!user.driverId || user.driverId !== orderDriver) {
        return sendError(res, 'Forbidden: Driver is not assigned to this order relay channel', 403);
      }
      senderRole = 'DRIVER';
    } else if (user.role === 'CUSTOMER') {
      if (!user.customerId || user.customerId !== orderCustomer) {
        return sendError(res, 'Forbidden: Customer does not own this order relay channel', 403);
      }
      senderRole = 'CUSTOMER';
    } else if (['SUPERADMIN', 'ADMIN', 'OPERATOR', 'DISPATCHER'].includes(user.role)) {
      // Operators cannot impersonate customer or driver unless explicitly audited
      if (req.body.impersonate && ['CUSTOMER', 'DRIVER'].includes(req.body.impersonate)) {
        senderRole = req.body.impersonate;
        try {
          await execute(`
            INSERT INTO audit_logs (actor_user_id, actor_type, action, entity_type, entity_id, metadata_json)
            VALUES (?, 'OPERATOR', 'RELAY_IMPERSONATE_POST', 'ORDER', ?, ?)
          `, [user.userId, orderId, JSON.stringify({ impersonatedRole: senderRole, reason: req.body.auditReason || 'Operator relay action' })]);
        } catch (e) {
          console.warn('[Relay Audit] Failed to persist audit log for relay impersonation:', e);
        }
      } else {
        senderRole = 'SYSTEM';
      }
    } else {
      return sendError(res, 'Forbidden: Unauthorized to post in relay channel', 403);
    }

    const relayed = await relayService.sendRelayMessage(orderId, senderRole, text);
    return sendSuccess(res, relayed);
  } catch (error: any) {
    return sendError(res, error);
  }
}
