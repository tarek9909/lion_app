import crypto from 'crypto';
import { config } from '../../config/env.js';
import { query, execute } from '../../database/db.js';

export interface WebhookDeduplicationResult {
  isDuplicate: boolean;
  eventDbId: number;
}

export interface MetaErrorClassification {
  code?: number;
  isPermanent: boolean;
  canRetry: boolean;
  category: 'RATE_LIMIT' | 'WINDOW_EXPIRED' | 'UNDELIVERABLE' | 'AUTH_ERROR' | 'SERVER_ERROR' | 'UNKNOWN';
}

export function classifyMetaError(status: number, data: any): MetaErrorClassification {
  const code = data?.error?.code || data?.error?.error_data?.code;
  if (code === 131026) {
    return { code, isPermanent: true, canRetry: false, category: 'UNDELIVERABLE' };
  }
  if (code === 131047) {
    return { code, isPermanent: true, canRetry: false, category: 'WINDOW_EXPIRED' };
  }
  if (status === 429 || code === 80007) {
    return { code, isPermanent: false, canRetry: true, category: 'RATE_LIMIT' };
  }
  if (status === 401 || status === 403 || code === 190) {
    return { code, isPermanent: true, canRetry: false, category: 'AUTH_ERROR' };
  }
  if (status >= 500) {
    return { code, isPermanent: false, canRetry: true, category: 'SERVER_ERROR' };
  }
  return { code, isPermanent: false, canRetry: status >= 500, category: 'UNKNOWN' };
}

export interface SendMessageResult {
  success: boolean;
  messageId?: string;
  error?: string;
  isMock?: boolean;
  mode: 'MOCK' | 'LIVE';
  provider: 'MOCK_WHATSAPP' | 'META_CLOUD_API';
  classification?: MetaErrorClassification;
}

export class WhatsAppService {
  private fetchFn: typeof fetch = fetch;

  /**
   * Injectable fetch for testing live provider error boundaries and retry logic
   */
  setFetchFn(fn: typeof fetch) {
    this.fetchFn = fn;
  }

  resetFetchFn() {
    this.fetchFn = fetch;
  }

  /**
   * Ping Meta Graph API endpoint (G-053 live test verification)
   */
  async pingMetaApi(): Promise<{ ok: boolean; status?: number; data?: any; error?: string }> {
    if (!config.whatsapp.accessToken || !config.whatsapp.phoneNumberId || config.whatsapp.accessToken.startsWith('demo_')) {
      return { ok: false, error: 'Credentials not configured (EXTERNAL VERIFICATION PENDING)' };
    }
    try {
      const res = await this.fetchFn(`https://graph.facebook.com/${config.whatsapp.graphApiVersion}/${config.whatsapp.phoneNumberId}`, {
        headers: { Authorization: `Bearer ${config.whatsapp.accessToken}` },
      });
      const data = await res.json();
      return { ok: res.ok, status: res.status, data };
    } catch (e: any) {
      return { ok: false, error: e.message };
    }
  }

  /**
   * Verify X-Hub-Signature-256 header from Meta
   */
  verifySignature(rawBody: string | Buffer, signatureHeader?: string): boolean {
    if (!config.whatsapp.appSecret || config.whatsapp.appSecret === 'lion_demo_meta_app_secret') {
      // In local dev/test or default demo, signature is valid if header matches or if testing
      if (!signatureHeader) return true;
    }

    if (!signatureHeader) return false;

    const parts = signatureHeader.split('=');
    if (parts.length !== 2 || parts[0] !== 'sha256') {
      return false;
    }

    const expectedHash = parts[1];
    const computedHash = crypto
      .createHmac('sha256', config.whatsapp.appSecret)
      .update(typeof rawBody === 'string' ? rawBody : rawBody.toString('utf8'))
      .digest('hex');

    try {
      return crypto.timingSafeEqual(Buffer.from(computedHash, 'utf8'), Buffer.from(expectedHash, 'utf8'));
    } catch {
      return false;
    }
  }

  /**
   * Deduplicate incoming webhook events via MySQL integration_webhook_events table
   */
  async recordAndDeduplicateWebhook(
    providerEventId: string,
    eventType: string,
    payload: any,
    signatureVerified: boolean
  ): Promise<WebhookDeduplicationResult> {
    const existing = await query<any[]>(
      `SELECT id, processing_status FROM integration_webhook_events 
       WHERE provider = 'META_WHATSAPP' AND provider_event_id = ? LIMIT 1`,
      [providerEventId]
    );

    if (existing.length > 0) {
      console.log(`[WhatsApp Webhook] Duplicate event detected: ${providerEventId}`);
      return { isDuplicate: true, eventDbId: existing[0].id };
    }

    try {
      const res: any = await execute(
        `INSERT INTO integration_webhook_events 
         (provider, provider_event_id, event_type, payload_json, signature_verified, processing_status, received_at)
         VALUES ('META_WHATSAPP', ?, ?, ?, ?, 'RECEIVED', NOW())`,
        [providerEventId, eventType, JSON.stringify(payload), signatureVerified ? 1 : 0]
      );
      return { isDuplicate: false, eventDbId: res.insertId };
    } catch (err: any) {
      if (err.code === 'ER_DUP_ENTRY') {
        const dup = await query<any[]>(
          `SELECT id FROM integration_webhook_events WHERE provider = 'META_WHATSAPP' AND provider_event_id = ? LIMIT 1`,
          [providerEventId]
        );
        return { isDuplicate: true, eventDbId: dup[0]?.id || 0 };
      }
      throw err;
    }
  }

  /**
   * Mark webhook processing status in MySQL
   */
  async markWebhookProcessed(eventDbId: number, status: 'PROCESSED' | 'FAILED', error?: string): Promise<void> {
    await execute(
      `UPDATE integration_webhook_events 
       SET processing_status = ?, processed_at = NOW(), last_error = ? 
       WHERE id = ?`,
      [status, error || null, eventDbId]
    );
  }

  /**
   * Send Outbound WhatsApp Message via Meta Cloud API or Explicit Mock
   * Implements error classification, exponential retry, and status persistence (G-053)
   */
  async sendMessage(
    to: string,
    messageText: string,
    retryCount: number = 2,
    conversationId?: number,
    persistFailure: boolean = true
  ): Promise<SendMessageResult> {
    const sanitizedTo = to.replace(/\+/g, '').trim();

    // Explicit MOCK mode check (G-053)
    if (config.whatsapp.mode === 'MOCK') {
      const messageId = `wamid.mock.${Date.now()}.${Math.floor(Math.random() * 10000)}`;
      console.log(`[WhatsApp Service Boundary: MOCK] Mocking delivery to ${sanitizedTo}. Outbound: "${messageText.substring(0, 40)}..."`);

      // Persist mock outbound message if conversation exists
      await this.persistOutboundMessage(sanitizedTo, messageId, messageText, 'DELIVERED', 'MOCK_WHATSAPP', conversationId);

      return {
        success: true,
        messageId,
        isMock: true,
        mode: 'MOCK',
        provider: 'MOCK_WHATSAPP',
      };
    }

    // LIVE mode selected - Never fall back to mock (G-053)
    const isConfigured =
      Boolean(config.whatsapp.accessToken) &&
      Boolean(config.whatsapp.phoneNumberId) &&
      !config.whatsapp.accessToken.startsWith('demo_') &&
      !config.whatsapp.phoneNumberId.startsWith('demo_');

    if (!isConfigured) {
      const errMsg = 'WHATSAPP_MODE is LIVE but Meta Cloud API credentials are missing or placeholder.';
      console.error(`[WhatsApp Service: LIVE] Error: ${errMsg}`);
      if (persistFailure) {
        await this.persistOutboundMessage(sanitizedTo, undefined, messageText, 'FAILED', 'META_CLOUD_API', conversationId);
      }
      return {
        success: false,
        error: errMsg,
        isMock: false,
        mode: 'LIVE',
        provider: 'META_CLOUD_API',
      };
    }

    const url = `https://graph.facebook.com/${config.whatsapp.graphApiVersion}/${config.whatsapp.phoneNumberId}/messages`;
    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: sanitizedTo,
      type: 'text',
      text: {
        preview_url: false,
        body: messageText,
      },
    };

    let attempt = 0;
    while (attempt <= retryCount) {
      try {
        const response = await this.fetchFn(url, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${config.whatsapp.accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        });

        const data: any = await response.json();

        if (!response.ok) {
          const classification = classifyMetaError(response.status, data);
          if (classification.isPermanent) {
            console.warn(`[WhatsApp Service] Permanent Meta Error ${response.status} (${classification.category}):`, data);
            if (persistFailure) {
              await this.persistOutboundMessage(sanitizedTo, undefined, messageText, 'FAILED', 'META_CLOUD_API', conversationId);
            }
            return {
              success: false,
              error: `Meta Cloud API ${classification.category}: ${JSON.stringify(data)}`,
              isMock: false,
              mode: 'LIVE',
              provider: 'META_CLOUD_API',
              classification,
            };
          }
          throw new Error(`Meta Cloud API HTTP ${response.status}: ${JSON.stringify(data)}`);
        }

        const messageId = data.messages?.[0]?.id || `wamid.${Date.now()}`;
        console.log(`[WhatsApp Service: LIVE] Sent outbound message to ${sanitizedTo}, ID: ${messageId}`);
        await this.persistOutboundMessage(sanitizedTo, messageId, messageText, 'SENT', 'META_CLOUD_API', conversationId);

        return {
          success: true,
          messageId,
          isMock: false,
          mode: 'LIVE',
          provider: 'META_CLOUD_API',
        };
      } catch (error: any) {
        attempt++;
        console.warn(`[WhatsApp Service] Outbound message attempt ${attempt} failed:`, error.message);
        if (attempt > retryCount) {
          if (persistFailure) {
            await this.persistOutboundMessage(sanitizedTo, undefined, messageText, 'FAILED', 'META_CLOUD_API', conversationId);
          }
          return {
            success: false,
            error: error.message,
            isMock: false,
            mode: 'LIVE',
            provider: 'META_CLOUD_API',
          };
        }
        // Exponential backoff: 300ms, 600ms
        await new Promise((resolve) => setTimeout(resolve, attempt * 300));
      }
    }

    return {
      success: false,
      error: 'Max retries exceeded',
      isMock: false,
      mode: 'LIVE',
      provider: 'META_CLOUD_API',
    };
  }

  async recordOutboundFailure(to: string, messageText: string, conversationId?: number): Promise<void> {
    await this.persistOutboundMessage(
      to.replace(/\+/g, '').trim(),
      undefined,
      messageText,
      'FAILED',
      'META_CLOUD_API',
      conversationId
    );
  }

  async updateOutboundDeliveryStatus(
    providerMessageId: string,
    providerStatus: string,
    errorDetails?: any
  ): Promise<void> {
    const normalizedStatus = String(providerStatus || '').toUpperCase();
    const status = normalizedStatus === 'READ'
      ? 'READ'
      : normalizedStatus === 'DELIVERED'
        ? 'DELIVERED'
        : normalizedStatus === 'SENT'
          ? 'SENT'
          : normalizedStatus === 'FAILED'
            ? 'FAILED'
            : null;
    if (!status || !providerMessageId) return;

    await execute(
      `UPDATE messages
       SET status = ?,
           delivered_at = CASE WHEN ? IN ('DELIVERED', 'READ') THEN COALESCE(delivered_at, NOW()) ELSE delivered_at END,
           read_at = CASE WHEN ? = 'READ' THEN COALESCE(read_at, NOW()) ELSE read_at END,
           metadata_json = CASE WHEN ? = 'FAILED' AND ? IS NOT NULL
             THEN JSON_SET(COALESCE(metadata_json, JSON_OBJECT()), '$.provider_error', CAST(? AS JSON))
             ELSE metadata_json END
       WHERE provider = 'META_CLOUD_API' AND provider_message_id = ?
         AND direction = 'OUTBOUND'`,
      [status, status, status, status, errorDetails ? JSON.stringify(errorDetails) : null, errorDetails ? JSON.stringify(errorDetails) : null, providerMessageId]
    );
  }

  private async persistOutboundMessage(phone: string, providerMsgId: string | undefined, body: string, status: string, provider: string, conversationId?: number) {
    try {
      const convs = conversationId
        ? await query<any[]>(`SELECT id FROM conversations WHERE id = ? LIMIT 1`, [conversationId])
        : await query<any[]>(`
          SELECT id FROM conversations WHERE customer_id = (
            SELECT id FROM customers WHERE whatsapp_number = ? LIMIT 1
          ) ORDER BY id DESC LIMIT 1
        `, [phone]);

      if (convs.length > 0) {
        await execute(`
          INSERT INTO messages 
          (public_id, conversation_id, provider, provider_message_id, direction, sender_type, sender_reference, message_type, text_body, status, sent_at, processed_at)
          VALUES (?, ?, ?, ?, 'OUTBOUND', 'BUSINESS', 'LION_DASHBOARD_OR_AI', 'TEXT', ?, ?, NOW(), NOW())
        `, [crypto.randomUUID(), convs[0].id, provider, providerMsgId || null, body, status]);
        await execute(`UPDATE conversations SET last_message_at = NOW() WHERE id = ?`, [convs[0].id]);
      }
    } catch (e) {
      // Non-fatal telemetry persistence
      console.warn('[WhatsApp Service] Message persistence notice:', e);
    }
  }
}

export const whatsappService = new WhatsAppService();
