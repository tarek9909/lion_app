import { v4 as uuidv4 } from 'uuid';
import { query, execute } from '../../../database/db.js';
import { PiiRedactor } from '../telemetry/pii-redactor.js';
import { assignSplit, DatasetTurnRecord } from './dataset-builder.js';
import { detectSenderLanguage } from '../sender-language.js';
import { customerMemoryService } from '../memory/customer-memory.service.js';

export interface RawConversationTurn {
  conversationId: number;
  customerId: number;
  turnIndex: number;
  correlationId?: string;
  inboundMessageId?: number;
  assistantMessageId?: number;
  userMessage: string;
  assistantResponse: string;
  detectedIntent?: string;
  toolCalls?: Array<{ name: string; args: any; result?: any }>;
  orderConverted?: boolean;
  orderStatus?: string;
  humanHandoff?: boolean;
  hadError?: boolean;
  createdAt?: string;
}

export interface HarvestedCurationItem {
  id?: number;
  publicId: string;
  conversationId: number;
  customerId: number;
  turnIndex: number;
  correlationId?: string | null;
  inboundMessageId?: number | null;
  assistantMessageId?: number | null;
  datasetVersion?: string | null;
  senderLanguage: string;
  // NOTE: Strictly sanitized content only. Raw text is NEVER stored.
  sanitizedUserMessage: string;
  sanitizedModelResponse: string;
  detectedIntent: string;
  toolCallsJson: any;
  qualityScore: number;
  conversionStatus: 'CONVERTED_ORDER' | 'BROWSED_ONLY' | 'CANCELLED' | 'HANDED_OFF';
  reviewStatus: 'PENDING' | 'HUMAN_APPROVED' | 'REJECTED';
  reviewedBy?: number | null;
  reviewedAt?: string | null;
  reviewNotes?: string | null;
  createdAt?: string;
}

export interface HarvestCheckpoint {
  harvesterName: string;
  lastMessageId: number;
  lastHarvestedAt: string;
  status: string;
  metrics: {
    totalHarvested: number;
    totalSkippedNonConsenting: number;
    totalDuplicatesSkipped: number;
    totalQuarantined: number;
    totalErrors: number;
  };
}

export class ConversationHarvesterService {
  private inMemoryQueue: HarvestedCurationItem[] = [];
  private inMemoryCheckpoint: HarvestCheckpoint = {
    harvesterName: 'main_conversation_harvester',
    lastMessageId: 0,
    lastHarvestedAt: new Date().toISOString(),
    status: 'IDLE',
    metrics: {
      totalHarvested: 0,
      totalSkippedNonConsenting: 0,
      totalDuplicatesSkipped: 0,
      totalQuarantined: 0,
      totalErrors: 0,
    },
  };

  /**
   * Score a conversation turn based on conversion, efficiency, and safety.
   * Score ranges from 0 to 100.
   */
  scoreTurn(turn: RawConversationTurn): number {
    let score = 50;

    // Converted to active paid order
    if (turn.orderConverted && turn.orderStatus !== 'CANCELLED') {
      score += 35;
    } else if (turn.orderStatus === 'CANCELLED') {
      score -= 20;
    }

    // Bot handled turn without requiring dispatcher handoff
    if (turn.humanHandoff) {
      score -= 30;
    } else {
      score += 10;
    }

    // Clean execution without unhandled errors
    if (turn.hadError) {
      score -= 25;
    } else {
      score += 5;
    }

    // Customer satisfaction cues
    if (/(?:shukran|choukrane|thanks|thank you|merci|yatik el 3afye|يعطيك العافية|شكرا|تسلم)/iu.test(turn.userMessage)) {
      score += 10;
    }

    return Math.max(0, Math.min(100, score));
  }

  /**
   * Sanitize, evaluate, and stage a conversation turn into the curation queue.
   * CRITICAL PRIVACY RULE: Raw user and model text are scrubbed immediately.
   * Only sanitized text is retained in the queue and DB.
   */
  async stageTurnForCuration(turn: RawConversationTurn): Promise<HarvestedCurationItem | null> {
    // 1. Double check consent if customerId is given
    if (turn.customerId && turn.customerId > 0) {
      const hasConsent = await this.checkCustomerConsent(turn.customerId);
      if (!hasConsent) {
        this.inMemoryCheckpoint.metrics.totalSkippedNonConsenting++;
        return null;
      }
    }

    const correlationId = turn.correlationId || `turn_${turn.conversationId}_${turn.turnIndex}`;

    // 2. Check for duplicate turn (idempotency)
    const existing = this.inMemoryQueue.find(
      (item) => item.conversationId === turn.conversationId && item.correlationId === correlationId
    );
    if (existing) {
      this.inMemoryCheckpoint.metrics.totalDuplicatesSkipped++;
      return existing;
    }

    const qualityScore = this.scoreTurn(turn);
    // SCRUB ALL PII
    const sanitizedUser = PiiRedactor.redactText(turn.userMessage);
    const sanitizedAssistant = PiiRedactor.redactText(turn.assistantResponse);
    const language = detectSenderLanguage(turn.userMessage);

    let conversionStatus: HarvestedCurationItem['conversionStatus'] = 'BROWSED_ONLY';
    if (turn.humanHandoff) {
      conversionStatus = 'HANDED_OFF';
    } else if (turn.orderConverted && turn.orderStatus !== 'CANCELLED') {
      conversionStatus = 'CONVERTED_ORDER';
    } else if (turn.orderStatus === 'CANCELLED') {
      conversionStatus = 'CANCELLED';
    }

    const publicId = uuidv4();
    const curationItem: HarvestedCurationItem = {
      publicId,
      conversationId: turn.conversationId,
      customerId: turn.customerId,
      turnIndex: turn.turnIndex || 1,
      correlationId,
      inboundMessageId: turn.inboundMessageId || null,
      assistantMessageId: turn.assistantMessageId || null,
      datasetVersion: 'v1.0.0',
      senderLanguage: language,
      sanitizedUserMessage: sanitizedUser,
      sanitizedModelResponse: sanitizedAssistant,
      detectedIntent: turn.detectedIntent || 'UNKNOWN',
      toolCallsJson: turn.toolCalls ? PiiRedactor.redactObject(turn.toolCalls) : [],
      qualityScore,
      conversionStatus,
      reviewStatus: qualityScore >= 75 ? 'PENDING' : 'REJECTED',
      createdAt: new Date().toISOString(),
    };

    // Store in memory queue
    this.inMemoryQueue.unshift(curationItem);
    if (this.inMemoryQueue.length > 500) {
      this.inMemoryQueue.pop();
    }

    this.inMemoryCheckpoint.metrics.totalHarvested++;

    // Persist to MySQL (strictly sanitized fields only)
    try {
      await execute(
        `INSERT INTO training_curation_queue (
          public_id,
          conversation_id,
          customer_id,
          turn_index,
          correlation_id,
          inbound_message_id,
          assistant_message_id,
          dataset_version,
          sender_language,
          sanitized_user_message,
          sanitized_model_response,
          detected_intent,
          tool_calls_json,
          quality_score,
          conversion_status,
          review_status,
          created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
        ON DUPLICATE KEY UPDATE updated_at = NOW()`,
        [
          curationItem.publicId,
          curationItem.conversationId || null,
          curationItem.customerId || null,
          curationItem.turnIndex,
          curationItem.correlationId,
          curationItem.inboundMessageId,
          curationItem.assistantMessageId,
          curationItem.datasetVersion,
          curationItem.senderLanguage,
          curationItem.sanitizedUserMessage,
          curationItem.sanitizedModelResponse,
          curationItem.detectedIntent,
          JSON.stringify(curationItem.toolCallsJson),
          curationItem.qualityScore,
          curationItem.conversionStatus,
          curationItem.reviewStatus,
        ]
      );
    } catch (err: any) {
      console.error('[ConversationHarvester] MySQL insert error:', err.message);
      throw err;
    }

    return curationItem;
  }

  /**
   * Run an idempotent harvest cycle using checkpoint watermark.
   * Only harvests consenting customers and tracks metrics & checkpoints.
   * STRICT PAIRING RULE:
   * Removes loose conversation_id pairing. Requires exact inbound_message_id
   * or turn_correlation_id match. Unmatched turns are quarantined and rejected.
   */
  async harvestWithWatermark(limit: number = 50): Promise<{
    harvested: HarvestedCurationItem[];
    checkpoint: HarvestCheckpoint;
  }> {
    const checkpoint = await this.getCheckpoint();
    const harvested: HarvestedCurationItem[] = [];

    try {
      // Query completed pairs where inbound message ID > lastMessageId
      // AND customer has allow_ai_training = 1
      // STRICT JOIN: No loose OR ai.conversation_id = c.id
      const rows = await query<any[]>(
        `SELECT
          m.id AS message_id,
          m.conversation_id,
          c.customer_id,
          m.text_body AS user_text,
          ai.output_summary AS assistant_text,
          ai.structured_output,
          ai.tool_calls_json,
          ai.success AS ai_success,
          ai.error_code,
          cp.allow_ai_training,
          o.id AS order_id,
          o.status AS order_status
        FROM messages m
        JOIN conversations c ON m.conversation_id = c.id
        LEFT JOIN customer_preferences cp ON c.customer_id = cp.customer_id
        LEFT JOIN ai_interactions ai ON (
          JSON_UNQUOTE(JSON_EXTRACT(ai.structured_output, '$.inbound_message_id')) = CAST(m.id AS CHAR)
          OR (
            JSON_UNQUOTE(JSON_EXTRACT(m.metadata_json, '$.turn_correlation_id')) IS NOT NULL
            AND JSON_UNQUOTE(JSON_EXTRACT(ai.structured_output, '$.turn_correlation_id')) = JSON_UNQUOTE(JSON_EXTRACT(m.metadata_json, '$.turn_correlation_id'))
          )
        )
        LEFT JOIN orders o ON o.customer_id = c.customer_id AND o.created_at >= m.created_at
        WHERE m.direction = 'INBOUND'
          AND m.id > ?
          AND m.text_body IS NOT NULL
        ORDER BY m.id ASC
        LIMIT ?`,
        [checkpoint.lastMessageId, limit]
      );

      let maxSeenMessageId = checkpoint.lastMessageId;

      for (const row of rows || []) {
        maxSeenMessageId = Math.max(maxSeenMessageId, row.message_id);

        // Strict consent enforcement
        if (!row.allow_ai_training) {
          checkpoint.metrics.totalSkippedNonConsenting++;
          continue;
        }

        // Strict pairing check: reject or quarantine turns with no exact matching response
        if (!row.assistant_text || !row.user_text || row.ai_success === 0 || row.error_code) {
          checkpoint.metrics.totalQuarantined = (checkpoint.metrics.totalQuarantined || 0) + 1;
          continue;
        }

        const structured = typeof row.structured_output === 'string'
          ? JSON.parse(row.structured_output || '{}')
          : row.structured_output || {};

        const turn: RawConversationTurn = {
          conversationId: row.conversation_id,
          customerId: row.customer_id,
          turnIndex: 1,
          inboundMessageId: row.message_id,
          correlationId: structured.turn_correlation_id || structured.request_id || `msg_${row.message_id}`,
          userMessage: row.user_text,
          assistantResponse: row.assistant_text,
          detectedIntent: structured.detected_intent || 'CONVERSATION',
          toolCalls: typeof row.tool_calls_json === 'string' ? JSON.parse(row.tool_calls_json || '[]') : row.tool_calls_json,
          orderConverted: Boolean(row.order_id),
          orderStatus: row.order_status || 'UNKNOWN',
          humanHandoff: Boolean(structured.human_handoff),
          hadError: row.ai_success === 0 || Boolean(row.error_code),
        };

        const staged = await this.stageTurnForCuration(turn);
        if (staged) {
          harvested.push(staged);
        }
      }

      // Update checkpoint watermark
      checkpoint.lastMessageId = maxSeenMessageId;
      checkpoint.lastHarvestedAt = new Date().toISOString();
      await this.saveCheckpoint(checkpoint);
    } catch (err: any) {
      checkpoint.metrics.totalErrors++;
      console.error('[ConversationHarvester] Watermark harvest error:', err.message);
      throw err;
    }

    return { harvested, checkpoint };
  }

  /**
   * Manual harvest endpoint for backward compatibility / backfill.
   */
  async harvestRecentConversations(limit: number = 50): Promise<HarvestedCurationItem[]> {
    const result = await this.harvestWithWatermark(limit);
    return result.harvested;
  }

  /**
   * Run retention cleanup:
   * - Deletes rejected turns older than 7 days
   * - Deletes approved/processed turns older than retentionDays (default: 90 days)
   * - Logs an audit event for deleted records
   */
  async runRetentionPolicyCleanup(retentionDays: number = 90): Promise<{ deletedCount: number }> {
    let deletedCount = 0;

    // 1. In-memory queue cleanup
    const cutoffDate = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000).toISOString();
    const rejectedCutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const beforeLen = this.inMemoryQueue.length;
    this.inMemoryQueue = this.inMemoryQueue.filter((item) => {
      if (item.reviewStatus === 'REJECTED' && item.createdAt && item.createdAt < rejectedCutoff) {
        return false;
      }
      if (item.createdAt && item.createdAt < cutoffDate) {
        return false;
      }
      return true;
    });
    deletedCount += beforeLen - this.inMemoryQueue.length;

    // 2. MySQL cleanup
    try {
      const res: any = await execute(
        `DELETE FROM training_curation_queue
         WHERE (review_status = 'REJECTED' AND created_at < NOW() - INTERVAL 7 DAY)
            OR (created_at < NOW() - INTERVAL ? DAY)`,
        [retentionDays]
      );
      if (res?.affectedRows) {
        deletedCount = Math.max(deletedCount, res.affectedRows);
      }

      // Audit event
      await execute(
        `INSERT INTO ai_audit_events (event_type, entity_type, entity_id, details_json, created_at)
         VALUES ('RETENTION_POLICY_CLEANUP', 'CURATION_QUEUE', 'BATCH', ?, NOW())`,
        [JSON.stringify({ deletedCount, retentionDays, timestamp: new Date().toISOString() })]
      );
    } catch (err: any) {
      console.error('[ConversationHarvester] Retention policy cleanup error:', err.message);
      throw err;
    }

    return { deletedCount };
  }

  /**
   * Get items in the curation queue.
   * NOTE: Responses NEVER return raw text. Only sanitized text is returned.
   */
  async getQueue(filter?: {
    reviewStatus?: 'PENDING' | 'HUMAN_APPROVED' | 'REJECTED';
    minScore?: number;
    limit?: number;
  }): Promise<HarvestedCurationItem[]> {
    const status = filter?.reviewStatus || 'PENDING';
    const minScore = filter?.minScore ?? 0;
    const limit = filter?.limit || 50;

    // Try DB first
    try {
      const rows = await query<any[]>(
        `SELECT
          id, public_id, conversation_id, customer_id, turn_index,
          correlation_id, inbound_message_id, assistant_message_id, dataset_version,
          sender_language, sanitized_user_message, sanitized_model_response,
          detected_intent, tool_calls_json, quality_score, conversion_status,
          review_status, reviewed_by, reviewed_at, review_notes, created_at
         FROM training_curation_queue
         WHERE review_status = ? AND quality_score >= ?
         ORDER BY quality_score DESC, created_at DESC
         LIMIT ?`,
        [status, minScore, limit]
      );

      if (rows && rows.length > 0) {
        return rows.map((r) => ({
          id: r.id,
          publicId: r.public_id,
          conversationId: r.conversation_id,
          customerId: r.customer_id,
          turnIndex: r.turn_index,
          correlationId: r.correlation_id,
          inboundMessageId: r.inbound_message_id,
          assistantMessageId: r.assistant_message_id,
          datasetVersion: r.dataset_version,
          senderLanguage: r.sender_language,
          sanitizedUserMessage: r.sanitized_user_message,
          sanitizedModelResponse: r.sanitized_model_response,
          detectedIntent: r.detected_intent,
          toolCallsJson: typeof r.tool_calls_json === 'string' ? JSON.parse(r.tool_calls_json || '[]') : r.tool_calls_json,
          qualityScore: r.quality_score,
          conversionStatus: r.conversion_status,
          reviewStatus: r.review_status,
          reviewedBy: r.reviewed_by,
          reviewedAt: r.reviewed_at,
          reviewNotes: r.review_notes,
          createdAt: r.created_at,
        }));
      }
    } catch (err: any) {
      console.error('[ConversationHarvester] getQueue DB error:', err.message);
      throw err;
    }

    // Fall back to in-memory queue
    return this.inMemoryQueue
      .filter((item) => (!status || item.reviewStatus === status) && item.qualityScore >= minScore)
      .slice(0, limit);
  }

  /**
   * Human operator approves or rejects a staged dialogue turn.
   */
  async reviewItem(
    publicId: string,
    action: 'HUMAN_APPROVED' | 'REJECTED',
    reviewerId?: number,
    notes?: string
  ): Promise<boolean> {
    const memItem = this.inMemoryQueue.find((i) => i.publicId === publicId);
    if (memItem) {
      memItem.reviewStatus = action;
      memItem.reviewedBy = reviewerId || null;
      memItem.reviewedAt = new Date().toISOString();
      memItem.reviewNotes = notes || null;
    }

    try {
      await execute(
        `UPDATE training_curation_queue
         SET review_status = ?, reviewed_by = ?, review_notes = ?, reviewed_at = NOW(), updated_at = NOW()
         WHERE public_id = ?`,
        [action, reviewerId || null, notes || null, publicId]
      );

      // Audit review action
      await execute(
        `INSERT INTO ai_audit_events (event_type, entity_type, entity_id, performed_by, details_json, created_at)
         VALUES ('TRAINING_TURN_REVIEWED', 'CURATION_ITEM', ?, ?, ?, NOW())`,
        [publicId, reviewerId || null, JSON.stringify({ action, notes })]
      );
      return true;
    } catch (err: any) {
      console.error('[ConversationHarvester] reviewItem error:', err.message);
      throw err;
    }
  }

  /**
   * Convert approved curation items to DatasetTurnRecords for dataset-builder.ts.
   * Ensures faithful customer/assistant message pairing.
   */
  convertToDatasetRecords(items: HarvestedCurationItem[]): DatasetTurnRecord[] {
    return items.map((item, idx) => {
      const customerIdStr = `cust_${item.customerId || idx}`;
      const split = assignSplit(customerIdStr);

      return {
        id: `harvested_${item.publicId.slice(0, 8)}`,
        conversation_id: `conv_${item.conversationId || idx}`,
        customer_id: customerIdStr,
        split,
        turn_index: item.turnIndex,
        history: [],
        state_before: {},
        customer_message: item.sanitizedUserMessage,
        // Faithful paired assistant response (P0 closure)
        model_response: item.sanitizedModelResponse,
        language: (['en', 'ar', 'arabizi'].includes(item.senderLanguage)
          ? item.senderLanguage
          : 'en') as any,
        intent: item.detectedIntent,
        entities: {},
        needs_clarification: false,
        clarification_type: null,
        expected_tool: item.toolCallsJson?.[0]?.name || null,
        expected_tool_arguments: item.toolCallsJson?.[0]?.args || null,
        expected_state_change: null,
        required_reply_facts: [item.sanitizedModelResponse],
        forbidden_actions: [],
        provenance: 'CUSTOMER_LOG',
        human_review_status: item.reviewStatus === 'HUMAN_APPROVED' ? 'HUMAN_APPROVED' : 'PENDING',
      };
    });
  }

  /**
   * Check if a customer has granted explicit consent for AI training.
   */
  async checkCustomerConsent(customerId: number): Promise<boolean> {
    try {
      const prefs = await customerMemoryService.getPreferences(customerId);
      return Boolean(prefs.allowAiTraining);
    } catch {
      return false;
    }
  }

  async getCheckpoint(): Promise<HarvestCheckpoint> {
    try {
      const rows = await query<any[]>(
        `SELECT * FROM training_harvest_checkpoints WHERE harvester_name = ? LIMIT 1`,
        [this.inMemoryCheckpoint.harvesterName]
      );
      if (rows && rows.length > 0) {
        const row = rows[0];
        return {
          harvesterName: row.harvester_name,
          lastMessageId: Number(row.last_message_id) || 0,
          lastHarvestedAt: row.last_harvested_at ? new Date(row.last_harvested_at).toISOString() : new Date().toISOString(),
          status: row.status || 'IDLE',
          metrics: typeof row.metrics_json === 'string' ? JSON.parse(row.metrics_json || '{}') : (row.metrics_json || this.inMemoryCheckpoint.metrics),
        };
      }
    } catch {}
    return this.inMemoryCheckpoint;
  }

  async saveCheckpoint(cp: HarvestCheckpoint): Promise<void> {
    this.inMemoryCheckpoint = cp;
    try {
      await execute(
        `INSERT INTO training_harvest_checkpoints (
          harvester_name,
          last_message_id,
          last_harvested_at,
          status,
          metrics_json,
          updated_at
        ) VALUES (?, ?, NOW(), ?, ?, NOW())
        ON DUPLICATE KEY UPDATE
          last_message_id = VALUES(last_message_id),
          last_harvested_at = NOW(),
          status = VALUES(status),
          metrics_json = VALUES(metrics_json),
          updated_at = NOW()`,
        [
          cp.harvesterName,
          cp.lastMessageId,
          cp.status,
          JSON.stringify(cp.metrics),
        ]
      );
    } catch (err: any) {
      console.error('[ConversationHarvester] saveCheckpoint DB error:', err.message);
      throw err;
    }
  }
}

export const conversationHarvesterService = new ConversationHarvesterService();
