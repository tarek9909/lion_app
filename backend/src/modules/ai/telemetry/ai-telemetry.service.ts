import { v4 as uuidv4 } from 'uuid';
import { execute, query } from '../../../database/db.js';
import { PiiRedactor } from './pii-redactor.js';
import { CanonicalIntent, BEHAVIOR_CONTRACT_VERSION } from '../contract/behavior.contract.js';
import { SanitizedStateSnapshot } from '../state/ai-state.types.js';

export interface TelemetryRecordInput {
  conversationId?: number | null;
  dashboardUserId?: number | null;
  aiContext: 'CUSTOMER_WHATSAPP' | 'MANAGEMENT_COPILOT' | 'INTERNAL_EVAL';
  provider: string;
  model: string;
  interactionType: 'CHAT_TURN' | 'TOOL_CALL' | 'ANALYTICS_QUERY' | 'CLARIFICATION' | 'ERROR';
  rawInput: string;
  rawOutput: string;
  detectedIntent?: CanonicalIntent | string;
  detectedLanguage?: string;
  toolCalls?: Array<{ name: string; args: Record<string, any>; result?: any; error?: string }>;
  stateBefore?: SanitizedStateSnapshot | null;
  stateAfter?: SanitizedStateSnapshot | null;
  promptVersion?: string;
  toolSchemaVersion?: string;
  inputTokens?: number | null;
  outputTokens?: number | null;
  latencyMs?: number | null;
  estimatedCostUsd?: number | null;
  success?: boolean;
  errorCode?: string | null;
  errorMessage?: string | null;
  humanHandoff?: boolean;
  executionMode?: 'LIVE' | 'SHADOW' | 'CANARY' | 'DETERMINISTIC';
  requestId?: string | null;
}

export class AiTelemetryService {
  /**
   * Record an AI interaction safely into MySQL.
   * Telemetry failures are caught and logged; they will NEVER throw or disrupt customer experience.
   */
  async recordInteraction(data: TelemetryRecordInput): Promise<string | null> {
    try {
      const publicId = uuidv4();
      const inputSummary = PiiRedactor.redactText(data.rawInput).slice(0, 2000);
      const outputSummary = PiiRedactor.redactText(data.rawOutput).slice(0, 2000);

      const structuredPayload = {
        prompt_version: data.promptVersion || '2026-09-15.v2',
        behavior_version: BEHAVIOR_CONTRACT_VERSION,
        tool_schema_version: data.toolSchemaVersion || '2026-09-15.v2',
        detected_language: data.detectedLanguage || 'unknown',
        detected_intent: data.detectedIntent || 'UNKNOWN',
        human_handoff: Boolean(data.humanHandoff),
        execution_mode: data.executionMode || 'LIVE',
        request_id: data.requestId || null,
        error_message: data.errorMessage || null,
        state_before: data.stateBefore ? PiiRedactor.redactObject(data.stateBefore) : null,
        state_after: data.stateAfter ? PiiRedactor.redactObject(data.stateAfter) : null,
      };

      const redactedToolCalls = data.toolCalls
        ? PiiRedactor.redactObject(data.toolCalls)
        : null;

      await execute(
        `INSERT INTO ai_interactions (
          public_id,
          conversation_id,
          dashboard_user_id,
          ai_context,
          model_name,
          interaction_type,
          input_summary,
          output_summary,
          structured_output,
          tool_calls_json,
          input_tokens,
          output_tokens,
          estimated_cost_usd,
          latency_ms,
          success,
          error_code
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          publicId,
          data.conversationId || null,
          data.dashboardUserId || null,
          data.aiContext,
          `${data.provider}:${data.model}`.slice(0, 120),
          data.interactionType,
          inputSummary,
          outputSummary,
          JSON.stringify(structuredPayload),
          redactedToolCalls ? JSON.stringify(redactedToolCalls) : null,
          data.inputTokens || null,
          data.outputTokens || null,
          data.estimatedCostUsd || null,
          data.latencyMs || null,
          data.success !== false ? 1 : 0,
          data.errorCode
            ? data.errorCode.slice(0, 100)
            : data.errorMessage
            ? data.errorMessage.slice(0, 100)
            : null,
        ]
      );

      return publicId;
    } catch (error: any) {
      console.warn('[AI Telemetry] Non-blocking telemetry persistence error:', error?.message || error);
      return null;
    }
  }

  /**
   * Track a customer catalog search session in MySQL.
   */
  async recordSearchSession(params: {
    customerId: number;
    conversationId?: number | null;
    rawQuery: string;
    normalizedQuery?: string;
    requestedBudget?: number | null;
    preference?: string | null;
    results: Array<{ merchantProductId: number; rank: number; price: number; deliveryFee?: number; etaMinutes?: number }>;
  }): Promise<number | null> {
    try {
      const publicId = uuidv4();
      const insertResult = await execute(
        `INSERT INTO search_sessions (
          public_id, customer_id, conversation_id, raw_query, normalized_query,
          requested_budget, preference, result_count
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          publicId,
          params.customerId,
          params.conversationId || null,
          params.rawQuery.slice(0, 500),
          (params.normalizedQuery || params.rawQuery).slice(0, 500),
          params.requestedBudget || null,
          params.preference || null,
          params.results.length,
        ]
      );

      const sessionId = (insertResult as any).insertId;

      if (sessionId && params.results.length > 0) {
        for (const res of params.results.slice(0, 5)) {
          await execute(
            `INSERT INTO search_results (
              search_session_id, merchant_product_id, rank_position, displayed_price, delivery_fee, eta_minutes
            ) VALUES (?, ?, ?, ?, ?, ?)`,
            [
              sessionId,
              res.merchantProductId,
              res.rank,
              res.price,
              res.deliveryFee || 0,
              res.etaMinutes || 25,
            ]
          );
        }
      }

      return sessionId;
    } catch (error: any) {
      console.warn('[AI Telemetry] Search session tracking error:', error?.message || error);
      return null;
    }
  }

  /**
   * Mark search session converted to order
   */
  async markSearchConverted(customerId: number): Promise<void> {
    try {
      await execute(
        `UPDATE search_sessions
         SET converted_to_order = 1
         WHERE customer_id = ? AND created_at >= NOW() - INTERVAL 2 HOUR
         ORDER BY id DESC LIMIT 1`,
        [customerId]
      );
    } catch (error) {
      console.warn('[AI Telemetry] Could not mark search conversion:', error);
    }
  }
}

export const aiTelemetryService = new AiTelemetryService();
