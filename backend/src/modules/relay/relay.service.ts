import { query } from '../../database/db.js';
import { broadcastEvent } from '../../services/websocket.js';
import { v4 as uuidv4 } from 'uuid';

export interface RelayedMessage {
  id: number;
  publicId: string;
  orderId: number;
  senderRole: 'CUSTOMER' | 'DRIVER' | 'SYSTEM';
  senderDisplay: string;
  recipientDisplay: string;
  text: string;
  createdAt: string;
}

export class RelayService {
  async getDeliveryChannel(orderId: number): Promise<any | null> {
    const rows = await query<any[]>(`
      SELECT dc.*, d.display_code as driver_code, d.whatsapp_number as driver_phone, c.whatsapp_number as customer_phone
      FROM delivery_channels dc
      JOIN drivers d ON d.id = dc.driver_id
      JOIN customers c ON c.id = dc.customer_id
      WHERE dc.order_id = ? LIMIT 1
    `, [orderId]);
    return rows.length > 0 ? rows[0] : null;
  }

  async sendRelayMessage(
    orderId: number,
    senderRole: 'CUSTOMER' | 'DRIVER' | 'SYSTEM',
    text: string
  ): Promise<RelayedMessage> {
    let channel = await this.getDeliveryChannel(orderId);

    if (!channel) {
      const ord: any = await query(`SELECT customer_id, driver_id FROM orders WHERE id = ?`, [orderId]);
      if (ord.length === 0) throw new Error('Order not found for communication channel');
      const custId = ord[0].customer_id;
      const driverId = ord[0].driver_id || 1;

      await query(`
        INSERT INTO delivery_channels (public_id, order_id, customer_id, driver_id, status)
        VALUES (?, ?, ?, ?, 'OPEN')
      `, [uuidv4(), orderId, custId, driverId]);

      channel = await this.getDeliveryChannel(orderId);
    }

    const publicId = uuidv4();
    const res: any = await query(`
      INSERT INTO delivery_messages (
        public_id, delivery_channel_id, sender_role, message_type, text_body, relay_status, sent_at
      ) VALUES (?, ?, ?, 'TEXT', ?, 'DELIVERED', NOW())
    `, [publicId, channel.id, senderRole, text]);

    // Masked identities: Neither sees personal numbers
    const senderDisplay = senderRole === 'CUSTOMER' ? 'Customer (Protected)' : (senderRole === 'DRIVER' ? `Driver ${channel.driver_code || 'D-101'}` : 'System Dispatcher');
    const recipientDisplay = senderRole === 'CUSTOMER' ? `Driver ${channel.driver_code || 'D-101'}` : 'Customer (Protected)';

    const relayed: RelayedMessage = {
      id: res.insertId,
      publicId,
      orderId,
      senderRole,
      senderDisplay,
      recipientDisplay,
      text,
      createdAt: new Date().toISOString(),
    };

    // Broadcast to dashboard
    broadcastEvent('RELAY_MESSAGE', relayed);

    return relayed;
  }

  async getMessagesForOrder(orderId: number): Promise<RelayedMessage[]> {
    const channel = await this.getDeliveryChannel(orderId);
    if (!channel) return [];

    const rows = await query<any[]>(`
      SELECT dm.*, dc.driver_id
      FROM delivery_messages dm
      JOIN delivery_channels dc ON dc.id = dm.delivery_channel_id
      WHERE dc.order_id = ?
      ORDER BY dm.created_at ASC
    `, [orderId]);

    return rows.map(r => ({
      id: r.id,
      publicId: r.public_id,
      orderId,
      senderRole: r.sender_role,
      senderDisplay: r.sender_role === 'CUSTOMER' ? 'Customer (Protected)' : `Driver ${channel.driver_code || 'D-101'}`,
      recipientDisplay: r.sender_role === 'CUSTOMER' ? `Driver ${channel.driver_code || 'D-101'}` : 'Customer (Protected)',
      text: r.text_body,
      createdAt: r.created_at,
    }));
  }
}

export const relayService = new RelayService();
