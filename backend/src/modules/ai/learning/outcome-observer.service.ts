import { v4 as uuidv4 } from 'uuid';
import { execute } from '../../../database/db.js';

export interface MultiDimensionalOutcome {
  safety: number;
  groundedness: number;
  intentCorrectness: number;
  entityCorrectness: number;
  contextContinuity: number;
  clarificationQuality: number;
  languageMatch: number;
  toolSuccess: number;
  customerEffort: number;
  taskCompletion: number;
  customerSentiment: number;
  latencyQuality: number;
  overallScore: number;
}

export interface TurnOutcomeInput {
  conversationId: number;
  turnIndex: number;
  inboundMessageId?: number | null;
  assistantMessageId?: number | null;
  requestId?: string;
  customerReaction:
    | 'ACCEPTED'
    | 'CHOICE_SELECTED'
    | 'REPHRASED'
    | 'CORRECTED_ASSISTANT'
    | 'UNDO_REQUESTED'
    | 'HANDOFF_REQUESTED'
    | 'REPEATED_QUESTION';
  primaryRootCause?: string;
  contributingCauses?: string[];
  toolSuccess?: boolean;
  isUnsafeMutationAttempted?: boolean;
  isInventedFactDetected?: boolean;
  isPiiLeaked?: boolean;
  isClaimedSuccessAfterFailure?: boolean;
  latencyMs?: number;
  observedSignals?: Record<string, any>;
}

export class OutcomeObserverService {
  async recordOutcome(input: TurnOutcomeInput): Promise<{
    publicId: string;
    scores: MultiDimensionalOutcome;
    hardRejections: string[];
  }> {
    const publicId = uuidv4();
    const hardRejections: string[] = [];

    // Check hard rejections
    if (input.isUnsafeMutationAttempted) {
      hardRejections.push('UNSAFE_MUTATION_ATTEMPTED');
    }
    if (input.isInventedFactDetected) {
      hardRejections.push('INVENTED_OPERATIONAL_FACT');
    }
    if (input.isPiiLeaked) {
      hardRejections.push('PII_LEAK_DETECTED');
    }
    if (input.isClaimedSuccessAfterFailure) {
      hardRejections.push('CLAIMED_SUCCESS_AFTER_FAILURE');
    }

    // Compute dimensions (0.0 to 1.0)
    const safety = hardRejections.includes('UNSAFE_MUTATION_ATTEMPTED') || hardRejections.includes('PII_LEAK_DETECTED') ? 0 : 1;
    const groundedness = hardRejections.includes('INVENTED_OPERATIONAL_FACT') ? 0 : 1;
    const toolSuccess = input.toolSuccess !== false ? 1 : 0;

    let intentCorrectness = 1.0;
    let contextContinuity = 1.0;
    let customerEffort = 1.0;
    let customerSentiment = 1.0;

    if (input.customerReaction === 'CORRECTED_ASSISTANT') {
      intentCorrectness = 0.3;
      contextContinuity = 0.4;
      customerEffort = 0.3;
      customerSentiment = 0.4;
    } else if (input.customerReaction === 'REPHRASED') {
      intentCorrectness = 0.5;
      customerEffort = 0.5;
    } else if (input.customerReaction === 'REPEATED_QUESTION') {
      contextContinuity = 0.3;
      customerEffort = 0.4;
    } else if (input.customerReaction === 'UNDO_REQUESTED') {
      intentCorrectness = 0.4;
      customerEffort = 0.4;
    } else if (input.customerReaction === 'HANDOFF_REQUESTED') {
      intentCorrectness = 0.2;
      customerEffort = 0.1;
      customerSentiment = 0.2;
    }

    const clarificationQuality = input.customerReaction === 'CHOICE_SELECTED' ? 1.0 : 0.8;
    const languageMatch = 1.0;
    const taskCompletion = input.customerReaction === 'ACCEPTED' || input.customerReaction === 'CHOICE_SELECTED' ? 1.0 : 0.6;

    let latencyQuality = 1.0;
    if (input.latencyMs) {
      if (input.latencyMs > 10000) latencyQuality = 0.4;
      else if (input.latencyMs > 5000) latencyQuality = 0.7;
    }

    // Overall weighted score
    const overallScore = hardRejections.length > 0
      ? 0
      : Math.round(
          (safety * 0.25 +
            groundedness * 0.20 +
            intentCorrectness * 0.15 +
            contextContinuity * 0.15 +
            toolSuccess * 0.10 +
            customerEffort * 0.10 +
            latencyQuality * 0.05) *
            100
        ) / 100;

    const scores: MultiDimensionalOutcome = {
      safety,
      groundedness,
      intentCorrectness,
      entityCorrectness: intentCorrectness,
      contextContinuity,
      clarificationQuality,
      languageMatch,
      toolSuccess,
      customerEffort,
      taskCompletion,
      customerSentiment,
      latencyQuality,
      overallScore,
    };

    try {
      await execute(
        `INSERT INTO ai_turn_outcomes (
          public_id, conversation_id, turn_index, inbound_message_id, assistant_message_id,
          request_id, customer_reaction, primary_root_cause, contributing_causes_json,
          safety_score, groundedness_score, intent_score, entity_score,
          context_score, clarification_score, language_score, tool_success_score,
          customer_effort_score, task_completion_score, sentiment_score, latency_quality_score,
          overall_score, hard_rejections_json, observed_signals_json, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
        [
          publicId,
          input.conversationId,
          input.turnIndex,
          input.inboundMessageId || null,
          input.assistantMessageId || null,
          input.requestId || null,
          input.customerReaction,
          input.primaryRootCause || null,
          input.contributingCauses ? JSON.stringify(input.contributingCauses) : null,
          scores.safety,
          scores.groundedness,
          scores.intentCorrectness,
          scores.entityCorrectness,
          scores.contextContinuity,
          scores.clarificationQuality,
          scores.languageMatch,
          scores.toolSuccess,
          scores.customerEffort,
          scores.taskCompletion,
          scores.customerSentiment,
          scores.latencyQuality,
          scores.overallScore,
          hardRejections.length > 0 ? JSON.stringify(hardRejections) : null,
          input.observedSignals ? JSON.stringify(input.observedSignals) : null,
        ]
      );
    } catch (err: any) {
      console.warn('[OutcomeObserver] DB insert error:', err.message);
    }

    return { publicId, scores, hardRejections };
  }
}

export const outcomeObserverService = new OutcomeObserverService();
