import { Request, Response } from 'express';
import { aiService } from '../ai/ai.service.js';
import { sanitizeCustomerOutput } from '../ai/customer-output.js';
import { sendSuccess, sendError } from '../../shared/response.js';
import { query } from '../../database/db.js';
import { config } from '../../config/env.js';
import { broadcastEvent } from '../../services/websocket.js';
import { whatsappService } from '../whatsapp/whatsapp.service.js';
import { mediaService } from '../media/media.service.js';
import crypto from 'crypto';
import { whatsappWorker } from './whatsapp.worker.js';
import {
  extractDeliveryStatuses,
  extractInboundMessages,
  getMessagePhone,
} from './whatsapp-message.processor.js';
import { persistInboundMessage } from './conversation.persistence.js';

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
    const messages = extractInboundMessages(body);
    const statuses = extractDeliveryStatuses(body);

    // Delivery receipts are lightweight and should be applied immediately;
    // customer AI work is handled asynchronously by the durable worker.
    for (const status of statuses) {
      if (!status?.id || !status?.status) continue;
      try {
        await whatsappService.updateOutboundDeliveryStatus(status.id, status.status, status.errors?.[0] || null);
        broadcastEvent('WHATSAPP_DELIVERY_STATUS', {
          providerMessageId: status.id,
          status: String(status.status).toUpperCase(),
          recipient: status.recipient_id,
          timestamp: new Date().toISOString(),
        });
      } catch (statusError: any) {
        console.warn('[WhatsApp Webhook] Delivery status persistence failed:', statusError?.message || statusError);
      }
    }

    let queued = 0;
    for (const message of messages) {
      const fromPhone = getMessagePhone(message);
      if (!fromPhone) {
        console.warn('[WhatsApp Webhook] Ignoring inbound message without sender phone number');
        continue;
      }

      // Meta normally supplies wamid. If a malformed test/provider payload
      // omits it, a stable body hash still gives us idempotent deduplication.
      const providerMessageId = message.id || `wamid.hash.${crypto.createHash('sha256').update(JSON.stringify(message)).digest('hex')}`;
      const dedupe = await whatsappService.recordAndDeduplicateWebhook(
        providerMessageId,
        `INBOUND_${String(message.type || 'text').toUpperCase()}`,
        message,
        isSigValid
      );

      if (!dedupe.isDuplicate) queued++;
    }

    if (queued > 0) whatsappWorker.kick();
    return res.status(200).send('EVENT_RECEIVED');
  } catch (error: any) {
    console.error('[WhatsApp Webhook Error]:', error);
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

    const persisted = await persistInboundMessage(userPhone, processedMessage, {
      inboundType: mediaType,
      mediaUrl: audioUrl || imageUrl,
      transcript,
    });

    // Process against the exact conversation row just persisted. This keeps
    // telemetry, Redis state, and the outbound message on one conversation.
    const result = await aiService.processCustomerMessage(userPhone, processedMessage, mediaType, {
      conversationId: persisted.conversationId,
      requestId: `sim-${persisted.messageId}`,
      inboundMessageId: persisted.messageId,
    });

    // Send outbound reply through provider client (G-016)
    const customerReply = sanitizeCustomerOutput(result.replyText);
    await whatsappService.sendMessage(userPhone, customerReply, 2, persisted.conversationId);

    // Broadcast event over WebSocket
    broadcastEvent('CONVERSATION_MESSAGE', {
      phone: userPhone,
      customerMessage: processedMessage,
      aiReply: customerReply,
      intent: result.intent,
      mediaType,
      transcript,
      timestamp: new Date().toISOString(),
    });

    return sendSuccess(res, {
      from: userPhone,
      conversationId: persisted.conversationId,
      inbound: processedMessage,
      reply: customerReply,
      replyText: customerReply,
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
