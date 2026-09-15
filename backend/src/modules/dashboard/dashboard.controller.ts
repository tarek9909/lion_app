import { Request, Response } from 'express';
import { query, execute } from '../../database/db.js';
import { sendSuccess, sendError } from '../../shared/response.js';
import { whatsappService } from '../whatsapp/whatsapp.service.js';
import { broadcastEvent } from '../../services/websocket.js';
import { sanitizeCustomerOutput } from '../ai/customer-output.js';

export async function getDashboardContacts(_req: Request, res: Response) {
  try {
    const [users, drivers, customers] = await Promise.all([
      query<any[]>(`
        SELECT
          u.id, u.public_id, u.full_name, u.email, u.username, u.phone, u.status,
          GROUP_CONCAT(DISTINCT r.code ORDER BY r.code SEPARATOR ', ') AS roles
        FROM users u
        LEFT JOIN user_roles ur ON ur.user_id = u.id
        LEFT JOIN roles r ON r.id = ur.role_id
        WHERE u.deleted_at IS NULL
        GROUP BY u.id, u.public_id, u.full_name, u.email, u.username, u.phone, u.status
        ORDER BY u.full_name ASC
      `),
      query<any[]>(`
        SELECT
          id, public_id, display_code, full_name_private, phone_private,
          whatsapp_number, status, availability_status, vehicle_type
        FROM drivers
        WHERE deleted_at IS NULL
        ORDER BY display_code ASC
      `),
      query<any[]>(`
        SELECT
          id, public_id, display_name, whatsapp_number, status, created_at,
          last_order_at, total_completed_orders, lifetime_spend
        FROM customers
        WHERE deleted_at IS NULL
        ORDER BY created_at DESC
      `),
    ]);

    return sendSuccess(res, {
      counts: {
        users: users.length,
        drivers: drivers.length,
        customers: customers.length,
      },
      users,
      drivers,
      customers,
    });
  } catch (error: any) {
    return sendError(res, error);
  }
}

export async function getWhatsAppInboxConversations(_req: Request, res: Response) {
  try {
    const conversations = await query<any[]>(`
      SELECT
        conv.id,
        conv.public_id,
        conv.channel,
        conv.status,
        conv.ai_mode,
        conv.last_message_at,
        conv.created_at,
        c.whatsapp_number,
        c.display_name,
        (SELECT COUNT(*) FROM messages cm WHERE cm.conversation_id = conv.id) AS message_count,
        (SELECT COUNT(*) FROM messages cim WHERE cim.conversation_id = conv.id AND cim.direction = 'INBOUND') AS inbound_count,
        (SELECT lm.text_body FROM messages lm WHERE lm.conversation_id = conv.id ORDER BY lm.created_at DESC, lm.id DESC LIMIT 1) AS last_message,
        (SELECT lm.direction FROM messages lm WHERE lm.conversation_id = conv.id ORDER BY lm.created_at DESC, lm.id DESC LIMIT 1) AS last_message_direction,
        (SELECT lm.message_type FROM messages lm WHERE lm.conversation_id = conv.id ORDER BY lm.created_at DESC, lm.id DESC LIMIT 1) AS last_message_type
      FROM conversations conv
      LEFT JOIN customers c ON c.id = conv.customer_id
      WHERE conv.channel = 'WHATSAPP'
      ORDER BY COALESCE(conv.last_message_at, conv.updated_at, conv.created_at) DESC, conv.id DESC
      LIMIT 200
    `);

    return sendSuccess(res, conversations.map((conversation) => ({
      ...conversation,
      message_count: Number(conversation.message_count || 0),
      inbound_count: Number(conversation.inbound_count || 0),
    })));
  } catch (error: any) {
    return sendError(res, error);
  }
}

export async function getWhatsAppInboxMessages(req: Request, res: Response) {
  try {
    const conversationId = Number(req.params.id);
    const messages = await query<any[]>(`
      SELECT
        m.id,
        m.conversation_id,
        m.direction,
        m.sender_type,
        m.sender_reference,
        m.message_type,
        m.text_body,
        m.status,
        m.created_at,
        mm.original_url AS media_url,
        mm.transcript AS media_transcript
      FROM messages m
      LEFT JOIN message_media mm ON mm.message_id = m.id
      WHERE m.conversation_id = ?
      ORDER BY m.created_at ASC, m.id ASC
    `, [conversationId]);

    return sendSuccess(res, messages);
  } catch (error: any) {
    return sendError(res, error);
  }
}

export async function sendWhatsAppInboxReply(req: Request, res: Response) {
  try {
    const conversationId = Number(req.params.id);
    const text = sanitizeCustomerOutput(req.body.text);
    if (!text) {
      return sendError(res, 'WhatsApp reply text is required after removing unsupported formatting', 400);
    }
    const conversations = await query<any[]>(`
      SELECT conv.id, c.whatsapp_number
      FROM conversations conv
      JOIN customers c ON c.id = conv.customer_id
      WHERE conv.id = ? AND conv.channel = 'WHATSAPP'
      LIMIT 1
    `, [conversationId]);

    if (conversations.length === 0) {
      return sendError(res, 'WhatsApp conversation not found', 404);
    }

    const recipient = conversations[0].whatsapp_number;
    const result = await whatsappService.sendMessage(recipient, text, 2, conversationId);
    if (!result.success) {
      return sendError(res, result.error || 'WhatsApp message could not be sent', 502);
    }

    await execute(`UPDATE conversations SET last_message_at = NOW() WHERE id = ?`, [conversationId]);
    // A human operator's reply takes ownership of the conversation so the AI
    // worker does not answer over the operator. It can be re-enabled by a
    // future explicit resume-AI action.
    await execute(`UPDATE conversations SET ai_mode = 'HUMAN' WHERE id = ?`, [conversationId]);
    broadcastEvent('CONVERSATION_MESSAGE', {
      conversationId,
      phone: recipient,
      customerMessage: null,
      aiReply: result.text,
      source: 'DASHBOARD_OPERATOR',
      timestamp: new Date().toISOString(),
    });

    return sendSuccess(res, {
      conversationId,
      phone: recipient,
      text: result.text,
      status: 'SENT',
      providerMessageId: result.messageId,
    });
  } catch (error: any) {
    return sendError(res, error);
  }
}
