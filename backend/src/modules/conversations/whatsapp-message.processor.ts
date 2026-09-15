import { aiService, AIProcessResult } from '../ai/ai.service.js';
import { sanitizeCustomerOutput } from '../ai/customer-output.js';
import { mediaService } from '../media/media.service.js';
import { broadcastEvent } from '../../services/websocket.js';
import {
  getConversationAiMode,
  persistInboundMessage,
  setConversationAiMode,
} from './conversation.persistence.js';

export type InboundMediaType = 'text' | 'image' | 'audio' | 'location';

export interface NormalizedWhatsAppMessage {
  phone: string;
  providerMessageId: string;
  processedText: string;
  mediaType: InboundMediaType;
  messageType: string;
  mediaUrl?: string;
  mediaTranscript?: string;
  immediateReply?: string;
}

export interface InboundProcessingDraft {
  phone: string;
  conversationId: number;
  inboundMessageId: number;
  providerMessageId: string;
  processedText: string;
  mediaType: InboundMediaType;
  mediaUrl?: string;
  mediaTranscript?: string;
  replyText?: string;
  intent: string;
  actionTaken?: string;
  orderCreated?: any;
  noReply?: boolean;
}

const unsupportedReply = 'I can currently process text, voice notes, clear product photos, and location pins. Please send one of those and I’ll help you with your Lion order.';

function safePhone(phone: unknown): string {
  return String(phone || '').replace(/\+/g, '').trim();
}

function safeProviderMessageId(message: any): string {
  return String(message?.id || `wamid.local.${Date.now()}.${Math.random().toString(36).slice(2, 10)}`);
}

export function extractWhatsAppValues(body: any): any[] {
  const values: any[] = [];
  for (const entry of Array.isArray(body?.entry) ? body.entry : []) {
    for (const change of Array.isArray(entry?.changes) ? entry.changes : []) {
      if (change?.value) values.push(change.value);
    }
  }
  return values;
}

export function extractInboundMessages(body: any): any[] {
  return extractWhatsAppValues(body).flatMap((value) => Array.isArray(value?.messages) ? value.messages : []);
}

export function extractDeliveryStatuses(body: any): any[] {
  return extractWhatsAppValues(body).flatMap((value) => Array.isArray(value?.statuses) ? value.statuses : []);
}

export function getMessagePhone(message: any): string {
  return safePhone(message?.from);
}

export async function normalizeWhatsAppMessage(message: any, providerMessageIdOverride?: string): Promise<NormalizedWhatsAppMessage> {
  const phone = getMessagePhone(message);
  if (!phone) throw new Error('WhatsApp message is missing the sender phone number.');

  const providerMessageId = providerMessageIdOverride || safeProviderMessageId(message);
  const rawType = String(message?.type || 'text').toLowerCase();
  let processedText = '';
  let mediaType: InboundMediaType = 'text';
  let mediaUrl: string | undefined;
  let mediaTranscript: string | undefined;
  let immediateReply: string | undefined;
  let messageType = rawType.toUpperCase();

  if (rawType === 'text') {
    processedText = String(message?.text?.body || '').trim();
    if (!processedText) immediateReply = 'I received an empty text message. Please tell me what you would like to order.';
  } else if (rawType === 'interactive') {
    const choice = message?.interactive?.button_reply || message?.interactive?.list_reply;
    processedText = String(choice?.title || choice?.description || choice?.id || '').trim();
    messageType = 'INTERACTIVE';
    if (!processedText) immediateReply = 'I received the menu interaction, but I could not read the selected option. Please send it as text.';
  } else if (rawType === 'button') {
    processedText = String(message?.button?.text || message?.button?.payload || '').trim();
    messageType = 'BUTTON';
    if (!processedText) immediateReply = 'I received the button interaction, but I could not read the selected option. Please send it as text.';
  } else if (rawType === 'audio' || rawType === 'voice') {
    mediaType = 'audio';
    const audioId = String(message?.audio?.id || message?.voice?.id || '').trim();
    mediaUrl = audioId ? `https://whatsapp.meta.com/media/${audioId}` : undefined;
    messageType = 'AUDIO';
    if (!audioId) {
      immediateReply = 'I received a voice message without a readable audio file. Please send it again or type your request.';
      processedText = '[Voice note could not be read]';
    } else {
      try {
        const transcription = await mediaService.processAudioMessage(audioId);
        processedText = String(transcription.transcript || '').trim();
        mediaTranscript = processedText;
        if (!processedText) immediateReply = 'I received your voice note, but it was silent. Please try again or type your request.';
      } catch (error: any) {
        console.warn('[WhatsApp Message] Audio processing failed:', error?.message || error);
        processedText = '[Voice note could not be transcribed]';
        immediateReply = 'I received your voice note, but could not transcribe it. Please type your request and I’ll continue helping you.';
      }
    }
  } else if (rawType === 'image') {
    mediaType = 'image';
    const imageId = String(message?.image?.id || '').trim();
    mediaUrl = imageId ? `https://whatsapp.meta.com/media/${imageId}` : undefined;
    messageType = 'IMAGE';
    const caption = String(message?.image?.caption || '').trim();
    if (!imageId) {
      processedText = caption || '[Product photo could not be read]';
      immediateReply = 'I received a photo without a readable image file. Please send it again or describe the product.';
    } else {
      try {
        const analysis = await mediaService.processImageMessage(imageId, undefined, caption);
        if (analysis.candidates && analysis.candidates.length > 1 && analysis.confidence >= 0.60 && analysis.confidence <= 0.85) {
          processedText = `[IMAGE_CANDIDATES] ${analysis.candidates.map((candidate: any, index: number) => `${index + 1}: ${candidate.productName}`).join(' | ')}`;
        } else {
          processedText = caption || (analysis.matchedProduct ? analysis.matchedProduct.productName : 'product image');
        }
      } catch (error: any) {
        console.warn('[WhatsApp Message] Image processing failed:', error?.message || error);
        processedText = caption || '[Product photo could not be analyzed]';
        immediateReply = 'I received your photo, but could not identify the product confidently. Please send a clearer photo or tell me the product name.';
      }
    }
  } else if (rawType === 'location') {
    mediaType = 'location';
    const latitude = Number(message?.location?.latitude);
    const longitude = Number(message?.location?.longitude);
    messageType = 'LOCATION';
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      processedText = '[Location pin could not be read]';
      immediateReply = 'I received a location pin, but its coordinates were not readable. Please send it again or choose a saved address such as Home.';
    } else {
      const label = String(message?.location?.name || message?.location?.address || 'User pin').slice(0, 200);
      processedText = `Location: Lat ${latitude}, Lng ${longitude} (${label})`;
    }
  } else {
    messageType = rawType.toUpperCase().slice(0, 30) || 'UNSUPPORTED';
    processedText = `[Unsupported WhatsApp message type: ${messageType}]`;
    immediateReply = unsupportedReply;
  }

  return {
    phone,
    providerMessageId,
    processedText,
    mediaType,
    messageType,
    mediaUrl,
    mediaTranscript,
    immediateReply,
  };
}

export async function processInboundWhatsAppMessage(message: any, providerMessageIdOverride?: string): Promise<InboundProcessingDraft> {
  const normalized = await normalizeWhatsAppMessage(message, providerMessageIdOverride);
  const persisted = await persistInboundMessage(normalized.phone, normalized.processedText, {
    inboundType: normalized.messageType,
    mediaUrl: normalized.mediaUrl,
    transcript: normalized.mediaTranscript,
    providerMessageId: normalized.providerMessageId,
  });

  broadcastEvent('CONVERSATION_MESSAGE', {
    eventId: normalized.providerMessageId,
    messageId: persisted.messageId,
    conversationId: persisted.conversationId,
    phone: normalized.phone,
    customerMessage: normalized.processedText,
    aiReply: null,
    mediaType: normalized.mediaType,
    mediaTranscript: normalized.mediaTranscript,
    timestamp: new Date().toISOString(),
  });

  if (await getConversationAiMode(persisted.conversationId) === 'HUMAN') {
    return {
      phone: normalized.phone,
      conversationId: persisted.conversationId,
      inboundMessageId: persisted.messageId,
      providerMessageId: normalized.providerMessageId,
      processedText: normalized.processedText,
      mediaType: normalized.mediaType,
      mediaUrl: normalized.mediaUrl,
      mediaTranscript: normalized.mediaTranscript,
      intent: 'HUMAN_HANDOFF',
      noReply: true,
    };
  }

  const result: AIProcessResult = normalized.immediateReply
    ? { replyText: normalized.immediateReply, intent: 'GENERAL_GREETING', confidence: 0.99, actionTaken: undefined, orderCreated: undefined }
    : await aiService.processCustomerMessage(normalized.phone, normalized.processedText, normalized.mediaType, {
      conversationId: persisted.conversationId,
      requestId: normalized.providerMessageId,
      inboundMessageId: persisted.messageId,
    });

  if (result.intent === 'SUPPORT_REQUEST') {
    await setConversationAiMode(persisted.conversationId, 'HUMAN');
  }

  return {
    phone: normalized.phone,
    conversationId: persisted.conversationId,
    inboundMessageId: persisted.messageId,
    providerMessageId: normalized.providerMessageId,
    processedText: normalized.processedText,
    mediaType: normalized.mediaType,
    mediaUrl: normalized.mediaUrl,
    mediaTranscript: normalized.mediaTranscript,
    replyText: sanitizeCustomerOutput(result.replyText),
    intent: String(result.intent || 'GENERAL_GREETING'),
    actionTaken: result.actionTaken,
    orderCreated: result.orderCreated,
  };
}

export const unsupportedWhatsAppReply = unsupportedReply;
