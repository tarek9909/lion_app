import { Request, Response } from 'express';
import { orderService } from './order.service.js';
import { sendSuccess, sendError } from '../../shared/response.js';
import { query } from '../../database/db.js';

export async function getLiveOrders(req: Request, res: Response) {
  try {
    const orders = await orderService.getLiveOrders();
    return sendSuccess(res, orders);
  } catch (error: any) {
    return sendError(res, error);
  }
}

export async function getOrderById(req: Request, res: Response) {
  try {
    const orderId = parseInt(req.params.id, 10);
    const order = await orderService.getOrderById(orderId);
    if (!order) return sendError(res, 'Order not found', 404);
    return sendSuccess(res, order);
  } catch (error: any) {
    return sendError(res, error);
  }
}

export async function merchantAcceptOrder(req: Request, res: Response) {
  try {
    const orderId = parseInt(req.params.id, 10);
    const { preparationMinutes = 20 } = req.body;
    const updated = await orderService.merchantAccept(orderId, preparationMinutes);
    return sendSuccess(res, updated);
  } catch (error: any) {
    return sendError(res, error);
  }
}

export async function merchantRejectOrder(req: Request, res: Response) {
  try {
    const orderId = parseInt(req.params.id, 10);
    const { reason = 'Kitchen too busy' } = req.body;
    const updated = await orderService.merchantReject(orderId, reason);
    return sendSuccess(res, updated);
  } catch (error: any) {
    return sendError(res, error);
  }
}

export async function merchantReadyOrder(req: Request, res: Response) {
  try {
    const orderId = parseInt(req.params.id, 10);
    const updated = await orderService.merchantReady(orderId);
    return sendSuccess(res, updated);
  } catch (error: any) {
    return sendError(res, error);
  }
}

export async function driverAcceptOrder(req: Request, res: Response) {
  try {
    const orderId = parseInt(req.params.id, 10);
    const { driverId } = req.body;
    const updated = await orderService.driverAccept(orderId, driverId);
    return sendSuccess(res, updated);
  } catch (error: any) {
    return sendError(res, error);
  }
}

export async function driverRejectOrder(req: Request, res: Response) {
  try {
    const orderId = parseInt(req.params.id, 10);
    const { driverId, reason } = req.body;
    const updated = await orderService.driverReject(orderId, driverId, reason);
    return sendSuccess(res, updated);
  } catch (error: any) {
    return sendError(res, error);
  }
}

export async function driverPickupOrder(req: Request, res: Response) {
  try {
    const orderId = parseInt(req.params.id, 10);
    const updated = await orderService.driverPickup(orderId);
    return sendSuccess(res, updated);
  } catch (error: any) {
    return sendError(res, error);
  }
}

export async function driverDeliverOrder(req: Request, res: Response) {
  try {
    const orderId = parseInt(req.params.id, 10);
    const { rating, comment } = req.body;
    const updated = await orderService.driverDeliver(orderId, rating, comment);
    return sendSuccess(res, updated);
  } catch (error: any) {
    return sendError(res, error);
  }
}

export async function getDrivers(req: Request, res: Response) {
  try {
    const drivers = await query<any[]>(`
      SELECT d.id, d.public_id, d.display_code, d.full_name_private, d.whatsapp_number, d.status,
             d.availability_status, d.vehicle_type, d.rating, d.current_order_count,
             dl.latitude, dl.longitude, dl.recorded_at as location_recorded_at,
             active.id as active_order_id, active.status as active_order_status,
             ca.latitude as destination_latitude, ca.longitude as destination_longitude
      FROM drivers d
      LEFT JOIN driver_locations dl ON dl.id = (
        SELECT latest.id FROM driver_locations latest
        WHERE latest.driver_id = d.id
        ORDER BY latest.recorded_at DESC, latest.id DESC LIMIT 1
      )
      LEFT JOIN orders active ON active.driver_id = d.id
        AND active.status IN ('DRIVER_ASSIGNED', 'PICKED_UP', 'OUT_FOR_DELIVERY')
      LEFT JOIN customer_addresses ca ON ca.id = active.customer_address_id
      ORDER BY display_code ASC
    `);
    return sendSuccess(res, drivers);
  } catch (error: any) {
    return sendError(res, error);
  }
}
