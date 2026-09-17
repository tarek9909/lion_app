import { query, execute } from '../../database/db.js';
import { v4 as uuidv4 } from 'uuid';

export interface PersistInboundMessageOptions {
  inboundType?: string;
  mediaUrl?: string;
  transcript?: string;
  providerMessageId?: string;
  intent?: string;
}

export interface PersistedInboundMessage {
  customerId: number;
  conversationId: number;
  messageId: number;
  inserted: boolean;
}

/** A completed customer-turn reply stored in the append-only AI event log. */
export interface CompletedInboundAiTurn {
  replyText: string;
  intent: string;
  responseCategory?: string;
  actionTaken?: string;
}

/**
 * Persist an inbound WhatsApp message exactly once. The provider message ID
 * is backed by the database unique key, so worker retries cannot duplicate
 * the customer message in the dashboard.
 */
export async function persistInboundMessage(
  phone: string,
  inboundText: string,
  options?: PersistInboundMessageOptions
): Promise<PersistedInboundMessage> {
  const normalizedPhone = String(phone || '').replace(/\+/g, '').trim();
  if (!normalizedPhone) throw new Error('Inbound WhatsApp message is missing a sender phone number.');

  const custRows = await query<any[]>(
    `SELECT id FROM customers WHERE whatsapp_number = ? LIMIT 1`,
    [normalizedPhone]
  );

  let customerId: number;
  if (custRows.length > 0) {
    customerId = Number(custRows[0].id);
  } else {
    try {
      const newCust: any = await execute(
        `INSERT INTO customers (public_id, whatsapp_number, display_name, status) VALUES (?, ?, ?, 'ACTIVE')`,
        [uuidv4(), normalizedPhone, `Customer ${normalizedPhone.slice(-4)}`]
      );
      customerId = Number(newCust.insertId);
    } catch (error: any) {
      if (error?.code !== 'ER_DUP_ENTRY') throw error;
      const existingCustomer = await query<any[]>(
        `SELECT id FROM customers WHERE whatsapp_number = ? LIMIT 1`,
        [normalizedPhone]
      );
      if (existingCustomer.length === 0) throw error;
      customerId = Number(existingCustomer[0].id);
    }
  }

  const existingMessage = options?.providerMessageId
    ? await query<any[]>(
      `SELECT id, conversation_id FROM messages
       WHERE provider = 'META_WHATSAPP' AND provider_message_id = ? LIMIT 1`,
      [options.providerMessageId]
    )
    : [];

  if (existingMessage.length > 0) {
    return {
      customerId,
      conversationId: Number(existingMessage[0].conversation_id),
      messageId: Number(existingMessage[0].id),
      inserted: false,
    };
  }

  const convRows = await query<any[]>(
    `SELECT id, last_message_at
     FROM conversations
     WHERE customer_id = ? AND status = 'OPEN'
     ORDER BY id DESC LIMIT 1`,
    [customerId]
  );

  let conversationId: number;
  if (convRows.length > 0) {
    const lastMessageAt = convRows[0].last_message_at ? new Date(convRows[0].last_message_at).getTime() : 0;
    const inactiveForMs = lastMessageAt > 0 ? Date.now() - lastMessageAt : 0;
    // Do not let an abandoned OPEN conversation own a new shopping session.
    // The previous transcript remains durable, while a fresh conversation gets
    // a clean task/state boundary after 24 hours of inactivity.
    if (inactiveForMs > 24 * 60 * 60 * 1000) {
      await execute(
        `UPDATE conversations SET status = 'CLOSED' WHERE id = ? AND status = 'OPEN'`,
        [convRows[0].id]
      );
      const newConv: any = await execute(
        `INSERT INTO conversations (public_id, customer_id, channel, conversation_type, status, ai_mode)
         VALUES (?, ?, 'WHATSAPP', 'CUSTOMER_ORDER', 'OPEN', 'AI')`,
        [uuidv4(), customerId]
      );
      conversationId = Number(newConv.insertId);
    } else {
      conversationId = Number(convRows[0].id);
    }
  } else {
    const newConv: any = await execute(
      `INSERT INTO conversations (public_id, customer_id, channel, conversation_type, status, ai_mode)
       VALUES (?, ?, 'WHATSAPP', 'CUSTOMER_ORDER', 'OPEN', 'AI')`,
      [uuidv4(), customerId]
    );
    conversationId = Number(newConv.insertId);
  }

  const msgType = (options?.inboundType || 'TEXT').toUpperCase();
  let inRes: any;
  try {
    inRes = await execute(
      `INSERT INTO messages
       (public_id, conversation_id, provider, provider_message_id, direction, sender_type, sender_reference, message_type, text_body, status, received_at, processed_at, metadata_json)
       VALUES (?, ?, 'META_WHATSAPP', ?, 'INBOUND', 'CUSTOMER', ?, ?, ?, 'PROCESSED', NOW(), NOW(), ?)`,
      [
        uuidv4(),
        conversationId,
        options?.providerMessageId || null,
        normalizedPhone,
        msgType,
        String(inboundText || '').slice(0, 10000),
        options?.intent ? JSON.stringify({ intent: options.intent }) : null,
      ]
    );
  } catch (error: any) {
    if (error?.code !== 'ER_DUP_ENTRY' || !options?.providerMessageId) throw error;
    const duplicate = await query<any[]>(
      `SELECT id, conversation_id FROM messages
       WHERE provider = 'META_WHATSAPP' AND provider_message_id = ? LIMIT 1`,
      [options.providerMessageId]
    );
    if (duplicate.length === 0) throw error;
    return {
      customerId,
      conversationId: Number(duplicate[0].conversation_id),
      messageId: Number(duplicate[0].id),
      inserted: false,
    };
  }

  const messageId = Number(inRes.insertId);
  if (options?.mediaUrl || options?.transcript) {
    await execute(
      `INSERT INTO message_media (message_id, media_type, original_url, transcript)
       VALUES (?, ?, ?, ?)`,
      [messageId, msgType, options.mediaUrl || null, options.transcript || null]
    ).catch((error) => {
      console.warn('[Conversation Storage] Media save warning:', error?.message || error);
    });
  }

  await execute(`UPDATE conversations SET last_message_at = NOW() WHERE id = ?`, [conversationId]);
  // conversation_state has no last_intent column. Do not hide a schema error
  // here; otherwise an inbound turn can appear persisted without a durable
  // conversation-state row.
  await execute(
    `INSERT INTO conversation_state (conversation_id, current_state)
     VALUES (?, 'ACTIVE')
     ON DUPLICATE KEY UPDATE current_state='ACTIVE'`,
    [conversationId]
  );

  return { customerId, conversationId, messageId, inserted: true };
}

export async function getConversationAiMode(conversationId: number): Promise<string> {
  const rows = await query<any[]>(`SELECT ai_mode FROM conversations WHERE id = ? LIMIT 1`, [conversationId]);
  return rows[0]?.ai_mode || 'AI';
}

export async function setConversationAiMode(conversationId: number, mode: 'AI' | 'HUMAN'): Promise<void> {
  await execute(`UPDATE conversations SET ai_mode = ? WHERE id = ?`, [mode, conversationId]);
}

export async function loadCompletedInboundAiTurn(
  inboundMessageId: number,
): Promise<CompletedInboundAiTurn | null> {
  const rows = await query<any[]>(
    `SELECT sanitized_payload_json
       FROM conversation_ai_events
      WHERE inbound_message_id = ?
        AND event_type = 'TURN_COMPLETED'
      ORDER BY id DESC
      LIMIT 1`,
    [inboundMessageId],
  );
  if (rows.length === 0 || !rows[0]?.sanitized_payload_json) return null;

  try {
    const raw = rows[0].sanitized_payload_json;
    const payload = typeof raw === 'string' ? JSON.parse(raw) : raw;
    const replyText = typeof payload?.replyText === 'string' ? payload.replyText.trim() : '';
    const intent = typeof payload?.intent === 'string' ? payload.intent : 'GENERAL_GREETING';
    if (!replyText) return null;
    return {
      replyText,
      intent,
      responseCategory: typeof payload?.responseCategory === 'string' ? payload.responseCategory : undefined,
      actionTaken: typeof payload?.actionTaken === 'string' ? payload.actionTaken : undefined,
    };
  } catch (error: any) {
    // A malformed receipt is never a reason to repeat a customer mutation.
    console.warn('[Conversation Storage] Invalid completed AI turn receipt:', error?.message || error);
    return null;
  }
}
