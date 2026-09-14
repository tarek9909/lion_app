import { Request, Response } from 'express';
import { aiService } from '../ai/ai.service.js';
import { sendSuccess, sendError } from '../../shared/response.js';
import { query, execute } from '../../database/db.js';
import { config } from '../../config/env.js';
import { v4 as uuidv4 } from 'uuid';
import { broadcastEvent } from '../../services/websocket.js';
import { whatsappService } from '../whatsapp/whatsapp.service.js';
import { mediaService } from '../media/media.service.js';

export async function verifyWebhook(req: Request, res: Response) {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === config.whatsapp.verifyToken) {
    return res.status(200).send(challenge);
  }
  return res.status(403).send('Forbidden');
}

export async function handleWebhook(req: Request, res: Response) {
  let dedupe: any;
  try {
    const rawBody = (req as any).rawBody || JSON.stringify(req.body);
    const signature = req.headers['x-hub-signature-256'] as string | undefined;

    // Validate Signature (G-018)
    const isSigValid = whatsappService.verifySignature(rawBody, signature);
    if (!isSigValid && config.whatsapp.appSecret && config.whatsapp.appSecret !== 'lion_demo_meta_app_secret') {
      console.warn('[WhatsApp Webhook] Signature verification failed');
      return res.status(401).send('Invalid signature');
    }

    const body = req.body;
    const entry = body.entry?.[0];
    const changes = entry?.changes?.[0];
    const value = changes?.value;
    const message = value?.messages?.[0];

    if (!message) {
      return res.status(200).send('EVENT_RECEIVED');
    }

    const fromPhone = message.from;
    const providerMessageId = message.id || `wamid.${Date.now()}`;
    const rawType = message.type || 'text';

    // Deduplicate incoming webhook (G-018)
    dedupe = await whatsappService.recordAndDeduplicateWebhook(
      providerMessageId,
      `INBOUND_${rawType.toUpperCase()}`,
      message,
      isSigValid
    );

    if (dedupe.isDuplicate) {
      console.log(`[WhatsApp Webhook] Ignoring duplicate message: ${providerMessageId}`);
      return res.status(200).send('EVENT_RECEIVED');
    }

    let processedText = '';
    let mediaType: 'text' | 'image' | 'audio' | 'location' = 'text';
    let mediaUrl: string | undefined;
    let mediaTranscript: string | undefined;

    // Handle incoming media types (G-017, G-030, G-031)
    if (rawType === 'text') {
      processedText = message.text?.body || '';
      mediaType = 'text';
    } else if (rawType === 'audio' || rawType === 'voice') {
      mediaType = 'audio';
      const audioId = message.audio?.id || message.voice?.id || 'demo_audio';
      mediaUrl = `https://whatsapp.meta.com/media/${audioId}`;
      const transcription = await mediaService.processAudioMessage(audioId);
      processedText = transcription.transcript;
      mediaTranscript = transcription.transcript;
    } else if (rawType === 'image') {
      mediaType = 'image';
      const imgId = message.image?.id || 'demo_img';
      mediaUrl = `https://whatsapp.meta.com/media/${imgId}`;
      const analysis = await mediaService.processImageMessage(imgId, undefined, message.image?.caption);
      if (analysis.candidates && analysis.candidates.length > 1 && analysis.confidence >= 0.60 && analysis.confidence <= 0.85) {
        processedText = `[IMAGE_CANDIDATES] ${analysis.candidates.map((candidate: any, index: number) => `${index + 1}: ${candidate.productName}`).join(' | ')}`;
      } else {
        processedText = message.image?.caption || (analysis.matchedProduct ? analysis.matchedProduct.productName : 'product image');
      }
    } else if (rawType === 'location') {
      mediaType = 'location';
      const loc = message.location;
      processedText = `Location: Lat ${loc.latitude}, Lng ${loc.longitude} (${loc.name || loc.address || 'User pin'})`;
    }

    // Process with AI Engine
    const result = await aiService.processCustomerMessage(fromPhone, processedText, mediaType);

    // Save Inbound & Outbound records to MySQL (G-019)
    await saveInboundOutbound(fromPhone, processedText, result.replyText, {
      inboundType: mediaType,
      mediaUrl,
      transcript: mediaTranscript,
      providerMessageId,
      intent: result.intent,
    });

    // Send real outbound reply via Meta Cloud API (G-016)
    const sendResult = await whatsappService.sendMessage(fromPhone, result.replyText);

    // Mark webhook status based on real delivery result (G-053)
    await whatsappService.markWebhookProcessed(
      dedupe.eventDbId,
      sendResult.success ? 'PROCESSED' : 'FAILED',
      sendResult.error
    );

    // Broadcast message to dashboard conversation log
    broadcastEvent('CONVERSATION_MESSAGE', {
      phone: fromPhone,
      customerMessage: processedText,
      aiReply: result.replyText,
      intent: result.intent,
      mediaType,
      mediaTranscript,
      timestamp: new Date().toISOString(),
    });

    return res.status(200).send('EVENT_RECEIVED');
  } catch (error: any) {
    console.error('[WhatsApp Webhook Error]:', error);
    if (dedupe?.eventDbId) {
      await whatsappService.markWebhookProcessed(dedupe.eventDbId, 'FAILED', error.message);
    }
    return res.status(500).send('Webhook processing error');
  }
}

/**
 * Interactive Simulation API for Frontend Simulator & Automated Tests
 */
export async function simulateWhatsAppMessage(req: Request, res: Response) {
  try {
    const userPhone = req.body.phone || req.body.from || '96170123456';
    const mediaType = req.body.mediaType || 'text';
    const audioUrl = req.body.audioUrl || req.body.mediaUrl;
    const imageUrl = req.body.imageUrl || req.body.mediaUrl;
    const voiceTranscriptHint = req.body.voiceTranscriptHint;
    let processedMessage = req.body.message || req.body.text || '';
    let transcript: string | undefined;

    // Real audio transcription boundary (G-030)
    if (mediaType === 'audio') {
      const audioRes = await mediaService.processAudioMessage(audioUrl || 'demo_voice_note.ogg', undefined, voiceTranscriptHint || processedMessage);
      processedMessage = audioRes.transcript;
      transcript = audioRes.transcript;
    } else if (mediaType === 'image') {
      // Real image understanding boundary (G-031)
      const imgRes = await mediaService.processImageMessage(imageUrl || 'demo_food_item.jpg', undefined, processedMessage);
      if (imgRes.candidates && imgRes.candidates.length > 1 && imgRes.confidence >= 0.60 && imgRes.confidence <= 0.85) {
        processedMessage = `[IMAGE_CANDIDATES] ${imgRes.candidates.map((candidate: any, index: number) => `${index + 1}: ${candidate.productName}`).join(' | ')}`;
      } else if (imgRes.matchedProduct && !processedMessage) {
        processedMessage = imgRes.matchedProduct.productName;
      }
    }

    if (!processedMessage && mediaType === 'text') {
      return sendError(res, 'Message text is required');
    }

    // Process with AI Engine
    const result = await aiService.processCustomerMessage(userPhone, processedMessage, mediaType);

    // Save Inbound & Outbound messages into MySQL (G-019)
    await saveInboundOutbound(userPhone, processedMessage, result.replyText, {
      inboundType: mediaType,
      mediaUrl: audioUrl || imageUrl,
      transcript,
      intent: result.intent,
    });

    // Send outbound reply through provider client (G-016)
    await whatsappService.sendMessage(userPhone, result.replyText);

    // Broadcast event over WebSocket
    broadcastEvent('CONVERSATION_MESSAGE', {
      phone: userPhone,
      customerMessage: processedMessage,
      aiReply: result.replyText,
      intent: result.intent,
      mediaType,
      transcript,
      timestamp: new Date().toISOString(),
    });

    return sendSuccess(res, {
      from: userPhone,
      inbound: processedMessage,
      reply: result.replyText,
      replyText: result.replyText,
      intent: result.intent,
      actionTaken: result.actionTaken,
      orderCreated: result.orderCreated,
      transcript,
    });
  } catch (error: any) {
    console.error('[Simulate WhatsApp Error]:', error);
    return sendError(res, error);
  }
}

export async function getConversations(req: Request, res: Response) {
  try {
    const messages = await query<any[]>(`
      SELECT m.id, m.public_id, m.direction, m.sender_type, m.message_type, m.text_body, m.created_at, m.status,
             c.whatsapp_number, c.display_name,
             mm.original_url as media_url, mm.transcript as media_transcript
      FROM messages m
      JOIN conversations conv ON conv.id = m.conversation_id
      LEFT JOIN customers c ON c.id = conv.customer_id
      LEFT JOIN message_media mm ON mm.message_id = m.id
      ORDER BY m.created_at DESC LIMIT 100
    `);

    return sendSuccess(res, messages);
  } catch (error: any) {
    return sendError(res, error);
  }
}

export async function saveInboundOutbound(
  phone: string,
  inboundText: string,
  outboundText: string,
  options?: {
    inboundType?: string;
    mediaUrl?: string;
    transcript?: string;
    providerMessageId?: string;
    intent?: string;
  }
) {
  try {
    // 1. Resolve or create customer (G-019)
    const custRows = await query<any[]>(
      `SELECT id FROM customers WHERE whatsapp_number = ? LIMIT 1`,
      [phone]
    );

    let customerId: number;
    if (custRows.length > 0) {
      customerId = custRows[0].id;
    } else {
      const newCust: any = await execute(
        `INSERT INTO customers (public_id, whatsapp_number, display_name, status) VALUES (?, ?, ?, 'ACTIVE')`,
        [uuidv4(), phone, `Customer ${phone.slice(-4)}`]
      );
      customerId = newCust.insertId;
    }

    // 2. Resolve or create active conversation
    const convRows = await query<any[]>(
      `SELECT id FROM conversations WHERE customer_id = ? AND status = 'OPEN' ORDER BY id DESC LIMIT 1`,
      [customerId]
    );

    let convId: number;
    if (convRows.length > 0) {
      convId = convRows[0].id;
    } else {
      const newConv: any = await execute(
        `INSERT INTO conversations (public_id, customer_id, channel, conversation_type, status, ai_mode)
         VALUES (?, ?, 'WHATSAPP', 'CUSTOMER_ORDER', 'OPEN', 'AI')`,
        [uuidv4(), customerId]
      );
      convId = newConv.insertId;
    }

    const msgType = (options?.inboundType || 'TEXT').toUpperCase();

    // 3. Save Inbound Message
    const inRes: any = await execute(
      `INSERT INTO messages 
       (public_id, conversation_id, provider, provider_message_id, direction, sender_type, sender_reference, message_type, text_body, status, received_at, processed_at, metadata_json)
       VALUES (?, ?, 'META_WHATSAPP', ?, 'INBOUND', 'CUSTOMER', ?, ?, ?, 'PROCESSED', NOW(), NOW(), ?)`,
      [
        uuidv4(),
        convId,
        options?.providerMessageId || null,
        phone,
        msgType,
        inboundText || '',
        options?.intent ? JSON.stringify({ intent: options.intent }) : null,
      ]
    );

    // 4. Save Media if present
    if (options?.mediaUrl || options?.transcript) {
      try {
        await execute(
          `INSERT INTO message_media (message_id, media_type, original_url, transcript)
           VALUES (?, ?, ?, ?)`,
          [inRes.insertId, msgType, options.mediaUrl || null, options.transcript || null]
        );
      } catch (mediaErr) {
        console.warn('[Conversation Storage] Media save warning:', mediaErr);
      }
    }

    // 5. Save Outbound Message (Lion AI Reply)
    await execute(
      `INSERT INTO messages 
       (public_id, conversation_id, provider, direction, sender_type, sender_reference, message_type, text_body, status, sent_at, processed_at)
       VALUES (?, ?, 'META_WHATSAPP', 'OUTBOUND', 'BUSINESS', 'LION_AI', 'TEXT', ?, 'SENT', NOW(), NOW())`,
      [uuidv4(), convId, outboundText]
    );

    // 6. Update conversation timestamp and state
    await execute(
      `UPDATE conversations SET last_message_at = NOW() WHERE id = ?`,
      [convId]
    );

    try {
      await execute(
        `INSERT INTO conversation_state (conversation_id, current_state, last_intent)
         VALUES (?, 'ACTIVE', ?)
         ON DUPLICATE KEY UPDATE current_state='ACTIVE', last_intent=VALUES(last_intent)`,
        [convId, options?.intent || 'GENERAL']
      );
    } catch {
      // conversation_state update
    }
  } catch (err) {
    console.error('[Conversation Storage Error]:', err);
  }
}
