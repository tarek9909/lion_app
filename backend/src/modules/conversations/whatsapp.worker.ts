import { v4 as uuidv4 } from 'uuid';
import { config } from '../../config/env.js';
import { query, execute } from '../../database/db.js';
import { broadcastEvent } from '../../services/websocket.js';
import { whatsappService } from '../whatsapp/whatsapp.service.js';
import {
  processInboundWhatsAppMessage,
  getMessagePhone,
} from './whatsapp-message.processor.js';
import { persistInboundMessage } from './conversation.persistence.js';

interface WebhookEventRow {
  id: number;
  provider_event_id: string;
  payload_json: any;
  retry_count: number;
}

interface OutboxEventRow {
  id: number;
  aggregate_id: number;
  payload_json: any;
  retry_count: number;
}

interface ReplyOutboxPayload {
  to: string;
  text: string;
  conversationId: number;
  intent: string;
  source: 'AI' | 'SYSTEM_FALLBACK';
}

function parseJson(value: any): any {
  if (typeof value !== 'string') return value;
  try { return JSON.parse(value); } catch { return null; }
}

function errorText(error: any): string {
  return String(error?.message || error || 'Unknown worker error').slice(0, 4000);
}

function isRetryableError(error: any): boolean {
  const message = errorText(error).toLowerCase();
  const status = Number(error?.status || message.match(/http\s+(\d{3})/)?.[1] || 0);
  if ([400, 401, 403, 404].includes(status)) return false;
  if (status === 429 || status >= 500) return true;
  return message.includes('timed out') ||
    message.includes('timeout') ||
    message.includes('connection') ||
    message.includes('econn') ||
    message.includes('temporar') ||
    message.includes('deadlock') ||
    message.includes('lock wait');
}

export class WhatsAppWorker {
  private timer: NodeJS.Timeout | undefined;
  private draining = false;
  private started = false;

  start(): void {
    if (this.started) return;
    this.started = true;
    this.timer = setInterval(() => this.kick(), Math.max(250, config.whatsappWorker.pollMs));
    this.timer.unref?.();
    void this.recoverStaleJobs().then(() => this.drain()).catch((error) => {
      console.warn('[WhatsApp Worker] Startup recovery failed:', errorText(error));
    });
    console.log(`[WhatsApp Worker] Started (poll=${config.whatsappWorker.pollMs}ms, maxRetries=${config.whatsappWorker.maxRetries})`);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    this.started = false;
  }

  /** Trigger an immediate non-blocking drain after a webhook is accepted. */
  kick(): void {
    if (this.draining) return;
    void this.drain().catch((error) => {
      console.error('[WhatsApp Worker] Drain failed:', errorText(error));
    });
  }

  async drainOnce(): Promise<boolean> {
    const inbound = await this.claimInboundEvent();
    if (inbound) {
      await this.processInboundEvent(inbound);
      return true;
    }

    const outbound = await this.claimOutboxEvent();
    if (outbound) {
      await this.processOutboxEvent(outbound);
      return true;
    }

    return false;
  }

  private async drain(): Promise<void> {
    if (this.draining) return;
    this.draining = true;
    try {
      for (let i = 0; i < 25; i++) {
        if (!(await this.drainOnce())) break;
      }
    } finally {
      this.draining = false;
    }
  }

  private async recoverStaleJobs(): Promise<void> {
    const staleSeconds = Math.max(60, config.whatsappWorker.staleSeconds);
    await execute(
      `UPDATE integration_webhook_events
       SET processing_status = 'RETRY', processed_at = NULL,
           last_error = COALESCE(last_error, 'Recovered stale WhatsApp worker claim')
       WHERE provider = 'META_WHATSAPP'
         AND processing_status = 'PROCESSING'
         AND processed_at < DATE_SUB(NOW(), INTERVAL ? SECOND)`,
      [staleSeconds]
    );
    await execute(
      `UPDATE outbox_events
       SET status = 'PENDING', processed_at = NULL,
           last_error = COALESCE(last_error, 'Recovered stale WhatsApp outbox claim')
       WHERE aggregate_type = 'WHATSAPP_INBOUND'
         AND status = 'PROCESSING'
         AND processed_at < DATE_SUB(NOW(), INTERVAL ? SECOND)`,
      [staleSeconds]
    );
  }

  private async claimInboundEvent(): Promise<WebhookEventRow | null> {
    const rows = await query<any[]>(
      `SELECT id, provider_event_id, payload_json, retry_count
       FROM integration_webhook_events
       WHERE provider = 'META_WHATSAPP'
         AND processing_status IN ('RECEIVED', 'RETRY')
       ORDER BY id ASC LIMIT 1`
    );
    if (rows.length === 0) return null;

    const row = rows[0];
    const result: any = await execute(
      `UPDATE integration_webhook_events
       SET processing_status = 'PROCESSING', processed_at = NOW()
       WHERE id = ? AND processing_status IN ('RECEIVED', 'RETRY')`,
      [row.id]
    );
    if (Number(result.affectedRows || 0) !== 1) return null;
    return {
      id: Number(row.id),
      provider_event_id: String(row.provider_event_id),
      payload_json: row.payload_json,
      retry_count: Number(row.retry_count || 0),
    };
  }

  private async claimOutboxEvent(): Promise<OutboxEventRow | null> {
    const rows = await query<any[]>(
      `SELECT id, aggregate_id, payload_json, retry_count
       FROM outbox_events
       WHERE aggregate_type = 'WHATSAPP_INBOUND'
         AND status IN ('PENDING', 'RETRY')
         AND available_at <= NOW()
       ORDER BY id ASC LIMIT 1`
    );
    if (rows.length === 0) return null;

    const row = rows[0];
    const result: any = await execute(
      `UPDATE outbox_events
       SET status = 'PROCESSING', processed_at = NOW()
       WHERE id = ? AND status IN ('PENDING', 'RETRY')`,
      [row.id]
    );
    if (Number(result.affectedRows || 0) !== 1) return null;
    return {
      id: Number(row.id),
      aggregate_id: Number(row.aggregate_id),
      payload_json: row.payload_json,
      retry_count: Number(row.retry_count || 0),
    };
  }

  private async getReplyOutbox(eventId: number): Promise<OutboxEventRow | null> {
    const rows = await query<any[]>(
      `SELECT id, aggregate_id, payload_json, retry_count
       FROM outbox_events
       WHERE aggregate_type = 'WHATSAPP_INBOUND'
         AND aggregate_id = ? AND event_type = 'WHATSAPP_AI_REPLY'
       ORDER BY id DESC LIMIT 1`,
      [eventId]
    );
    if (rows.length === 0) return null;
    return {
      id: Number(rows[0].id),
      aggregate_id: Number(rows[0].aggregate_id),
      payload_json: rows[0].payload_json,
      retry_count: Number(rows[0].retry_count || 0),
    };
  }

  private async enqueueReply(eventId: number, payload: ReplyOutboxPayload): Promise<void> {
    const existing = await this.getReplyOutbox(eventId);
    if (existing) return;
    await execute(
      `INSERT INTO outbox_events
       (public_id, aggregate_type, aggregate_id, event_type, payload_json, status, available_at)
       VALUES (?, 'WHATSAPP_INBOUND', ?, 'WHATSAPP_AI_REPLY', ?, 'PENDING', NOW())`,
      [uuidv4(), eventId, JSON.stringify(payload)]
    );
  }

  private async processInboundEvent(event: WebhookEventRow): Promise<void> {
    const message = parseJson(event.payload_json);
    if (!message || typeof message !== 'object') {
      await this.failInbound(event, new Error('Malformed WhatsApp message payload'), false);
      return;
    }

    const existingReply = await this.getReplyOutbox(event.id);
    if (existingReply) {
      await whatsappService.markWebhookProcessed(event.id, 'PROCESSED');
      return;
    }

    try {
      // Use the event key selected by the webhook controller. This keeps
      // malformed/provider-less payloads idempotent across queue retries.
      const draft = await processInboundWhatsAppMessage(message, event.provider_event_id);
      if (draft.noReply || !draft.replyText) {
        await whatsappService.markWebhookProcessed(event.id, 'PROCESSED');
        return;
      }

      await this.enqueueReply(event.id, {
        to: draft.phone,
        text: draft.replyText,
        conversationId: draft.conversationId,
        intent: draft.intent,
        source: 'AI',
      });
      await whatsappService.markWebhookProcessed(event.id, 'PROCESSED');
    } catch (error: any) {
      await this.failInbound(event, error, isRetryableError(error));
    }
  }

  private async failInbound(event: WebhookEventRow, error: any, retryable: boolean): Promise<void> {
    const attempts = event.retry_count + 1;
    const message = errorText(error);
    if (retryable && attempts <= config.whatsappWorker.maxRetries) {
      await execute(
        `UPDATE integration_webhook_events
         SET processing_status = 'RETRY', retry_count = retry_count + 1,
             processed_at = NULL, last_error = ?
         WHERE id = ?`,
        [message, event.id]
      );
      console.warn(`[WhatsApp Worker] Retrying inbound event ${event.provider_event_id} (${attempts}/${config.whatsappWorker.maxRetries}): ${message}`);
      return;
    }

    try {
      const messagePayload = parseJson(event.payload_json) || {};
      const phone = getMessagePhone(messagePayload);
      if (phone) {
        const persisted = await persistInboundMessage(phone, '[WhatsApp message processing failed]', {
          inboundType: String(messagePayload.type || 'UNSUPPORTED').toUpperCase(),
          providerMessageId: event.provider_event_id,
        });
        await this.enqueueReply(event.id, {
          to: phone,
          text: 'I’m sorry, I could not complete that request right now. Please try again in a moment or type “help” to reach Lion support.',
          conversationId: persisted.conversationId,
          intent: 'SYSTEM_FALLBACK',
          source: 'SYSTEM_FALLBACK',
        });
        await whatsappService.markWebhookProcessed(event.id, 'PROCESSED', message);
      } else {
        await whatsappService.markWebhookProcessed(event.id, 'FAILED', message);
      }
    } catch (fallbackError: any) {
      const combined = `${message}; fallback failed: ${errorText(fallbackError)}`;
      await whatsappService.markWebhookProcessed(event.id, 'FAILED', combined);
      await this.recordFailedJob(event, combined);
    }
  }

  private async processOutboxEvent(event: OutboxEventRow): Promise<void> {
    const payload = parseJson(event.payload_json) as ReplyOutboxPayload | null;
    if (!payload?.to || !payload.text || !payload.conversationId) {
      await this.failOutbox(event, new Error('Malformed WhatsApp reply outbox payload'), false);
      return;
    }

    const result = await whatsappService.sendMessage(payload.to, payload.text, 0, payload.conversationId, false);
    if (result.success) {
      await execute(
        `UPDATE outbox_events SET status = 'SENT', processed_at = NOW(), last_error = NULL WHERE id = ?`,
        [event.id]
      );
      broadcastEvent('CONVERSATION_MESSAGE', {
        eventId: `outbox:${event.id}`,
        messageId: `outbox:${event.id}`,
        conversationId: payload.conversationId,
        phone: payload.to,
        customerMessage: null,
        aiReply: payload.text,
        intent: payload.intent,
        source: payload.source,
        timestamp: new Date().toISOString(),
      });
      return;
    }

    const retryable = !result.classification?.isPermanent && isRetryableError(new Error(result.error || 'Meta delivery failed'));
    await this.failOutbox(event, new Error(result.error || 'Meta delivery failed'), retryable);
  }

  private async failOutbox(event: OutboxEventRow, error: any, retryable: boolean): Promise<void> {
    const attempts = event.retry_count + 1;
    const message = errorText(error);
    if (retryable && attempts <= config.whatsappWorker.maxRetries) {
      const backoffSeconds = Math.min(300, Math.pow(2, attempts) * 5);
      await execute(
        `UPDATE outbox_events
         SET status = 'RETRY', retry_count = retry_count + 1,
             available_at = DATE_ADD(NOW(), INTERVAL ? SECOND), processed_at = NULL, last_error = ?
         WHERE id = ?`,
        [backoffSeconds, message, event.id]
      );
      console.warn(`[WhatsApp Worker] Retrying outbound event ${event.id} (${attempts}/${config.whatsappWorker.maxRetries}): ${message}`);
      return;
    }

    const payload = parseJson(event.payload_json) as ReplyOutboxPayload | null;
    if (payload?.to && payload.text) {
      await whatsappService.recordOutboundFailure(payload.to, payload.text, payload.conversationId);
    }
    await execute(
      `UPDATE outbox_events SET status = 'FAILED', processed_at = NOW(), last_error = ? WHERE id = ?`,
      [message, event.id]
    );
    await this.recordFailedJob(event, message);
  }

  private async recordFailedJob(event: { id: number; provider_event_id?: string; payload_json: any }, message: string): Promise<void> {
    await execute(
      `INSERT INTO failed_jobs (queue_name, job_name, job_reference, payload_json, error_text, attempts)
       VALUES ('whatsapp', 'process_webhook', ?, ?, ?, 1)`,
      [String(event.provider_event_id || event.id), JSON.stringify(parseJson(event.payload_json)), message]
    ).catch((error) => {
      console.warn('[WhatsApp Worker] Failed-job telemetry unavailable:', error?.message || error);
    });
  }
}

export const whatsappWorker = new WhatsAppWorker();
