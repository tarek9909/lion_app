import { v4 as uuidv4 } from 'uuid';
import { query, execute } from '../../../database/db.js';
import { RootCauseCategory } from './root-cause-classifier.service.js';

export interface CreateLearningCaseInput {
  conversationId: number;
  customerId?: number;
  turnIndex: number;
  correlationId?: string;
  inboundMessageId?: number;
  assistantMessageId?: number;
  senderLanguage: string;
  userMessage: string;
  actualPlan?: any;
  actualTools?: any[];
  actualResponse: string;
  toolResults?: any[];
  customerReaction?: string;
  rootCause: RootCauseCategory;
  riskTier?: 'NORMAL' | 'HIGH' | 'CRITICAL';
  geminiProposedPlan?: any;
  geminiProposedReply?: string;
  promptVersion?: string;
  modelVersion?: string;
}

export interface ReviewCaseInput {
  reviewerId: number;
  status: 'HUMAN_APPROVED' | 'REJECTED';
  notes?: string;
  correctedIntent?: string;
  correctedEntities?: Record<string, any>;
  correctedTool?: string;
  correctedArgs?: Record<string, any>;
  correctedState?: Record<string, any>;
  correctedReply?: string;
  requiredFacts?: string[];
  forbiddenFacts?: string[];
}

export class CaseBuilderService {
  /**
   * Calculates priority score according to Section 10.4 active-learning priority.
   */
  calculatePriority(rootCause: RootCauseCategory, customerReaction?: string, riskTier?: string): number {
    if (riskTier === 'CRITICAL') return 100;
    if (rootCause === 'UNSUPPORTED_CLAIM') return 95;
    if (customerReaction === 'CORRECTED_ASSISTANT' || customerReaction === 'UNDO_REQUESTED') return 85;
    if (rootCause === 'CONTEXT_LOSS' || rootCause === 'REFERENCE_RESOLUTION') return 80;
    if (customerReaction === 'HANDOFF_REQUESTED') return 75;
    if (rootCause === 'RESPONSE_LANGUAGE') return 70;
    if (rootCause === 'TOOL_OR_PROVIDER_FAILURE') return 60;
    return 40;
  }

  async createCase(input: CreateLearningCaseInput): Promise<string> {
    const publicId = uuidv4();
    const priority = this.calculatePriority(input.rootCause, input.customerReaction, input.riskTier);

    await execute(
      `INSERT INTO ai_learning_cases (
        public_id, conversation_id, customer_id, turn_index, correlation_id,
        inbound_message_id, assistant_message_id, sender_language, user_message,
        actual_plan_json, actual_tools_json, actual_response, tool_results_json,
        customer_reaction, root_cause, risk_tier, priority_score,
        gemini_proposed_plan_json, gemini_proposed_reply, review_status,
        prompt_version, model_version, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?, ?, NOW(), NOW())`,
      [
        publicId,
        input.conversationId,
        input.customerId || null,
        input.turnIndex,
        input.correlationId || null,
        input.inboundMessageId || null,
        input.assistantMessageId || null,
        input.senderLanguage,
        input.userMessage,
        input.actualPlan ? JSON.stringify(input.actualPlan) : null,
        input.actualTools ? JSON.stringify(input.actualTools) : null,
        input.actualResponse,
        input.toolResults ? JSON.stringify(input.toolResults) : null,
        input.customerReaction || null,
        input.rootCause,
        input.riskTier || 'NORMAL',
        priority,
        input.geminiProposedPlan ? JSON.stringify(input.geminiProposedPlan) : null,
        input.geminiProposedReply || null,
        input.promptVersion || null,
        input.modelVersion || null,
      ]
    );

    return publicId;
  }

  async createCaseFromTurn(params: {
    conversationId: number;
    turnIndex: number;
    primaryRootCause: string;
    inputContext: { rawInput: string };
    actualExecution: { intent: string; replyText: string };
    isUnsafeMutationAttempt?: boolean;
    isHardRejection?: boolean;
    latencyMs?: number;
  }): Promise<{ publicId: string; priorityScore: number }> {
    const publicId = uuidv4();
    const priorityScore = this.calculatePriority(
      params.primaryRootCause as any,
      'CORRECTED_ASSISTANT',
      params.isUnsafeMutationAttempt ? 'HIGH' : 'NORMAL'
    );

    await execute(
      `INSERT INTO ai_learning_cases (
        public_id, conversation_id, turn_index, sender_language, user_message,
        actual_response, root_cause, priority_score, review_status, created_at, updated_at
      ) VALUES (?, ?, ?, 'arabizi', ?, ?, ?, ?, 'PROPOSED', NOW(), NOW())`,
      [
        publicId,
        params.conversationId,
        params.turnIndex,
        params.inputContext?.rawInput || '',
        params.actualExecution?.replyText || '',
        params.primaryRootCause,
        priorityScore,
      ]
    );

    return { publicId, priorityScore };
  }

  async getCases(options?: {
    status?: 'PENDING' | 'HUMAN_APPROVED' | 'REJECTED';
    rootCause?: string;
    minPriority?: number;
    limit?: number;
  }): Promise<any[]> {
    let sql = `SELECT * FROM ai_learning_cases WHERE 1=1`;
    const params: any[] = [];

    if (options?.status) {
      sql += ` AND review_status = ?`;
      params.push(options.status);
    }
    if (options?.rootCause) {
      sql += ` AND root_cause = ?`;
      params.push(options.rootCause);
    }
    if (options?.minPriority !== undefined) {
      sql += ` AND priority_score >= ?`;
      params.push(options.minPriority);
    }

    sql += ` ORDER BY priority_score DESC, id DESC LIMIT ?`;
    params.push(options?.limit || 50);

    const rows = await query<any[]>(sql, params);
    return rows.map((r) => ({
      id: Number(r.id),
      publicId: r.public_id,
      conversationId: Number(r.conversation_id),
      customerId: r.customer_id ? Number(r.customer_id) : null,
      turnIndex: Number(r.turn_index),
      senderLanguage: r.sender_language,
      userMessage: r.user_message,
      actualPlan: this.safeParse(r.actual_plan_json),
      actualTools: this.safeParse(r.actual_tools_json),
      actualResponse: r.actual_response,
      toolResults: this.safeParse(r.tool_results_json),
      customerReaction: r.customer_reaction,
      rootCause: r.root_cause,
      riskTier: r.risk_tier,
      priorityScore: Number(r.priority_score),
      geminiProposedPlan: this.safeParse(r.gemini_proposed_plan_json),
      geminiProposedReply: r.gemini_proposed_reply,
      reviewerCorrectedIntent: r.reviewer_corrected_intent,
      reviewerCorrectedReply: r.reviewer_corrected_reply,
      reviewStatus: r.review_status,
      reviewNotes: r.review_notes,
      createdAt: r.created_at,
    }));
  }

  async reviewCase(publicId: string, review: ReviewCaseInput): Promise<boolean> {
    const res: any = await execute(
      `UPDATE ai_learning_cases
       SET review_status = ?,
           reviewed_by = ?,
           reviewed_at = NOW(),
           review_notes = ?,
           reviewer_corrected_intent = ?,
           reviewer_corrected_entities_json = ?,
           reviewer_corrected_tool = ?,
           reviewer_corrected_args_json = ?,
           reviewer_corrected_state_json = ?,
           reviewer_corrected_reply = ?,
           required_facts_json = ?,
           forbidden_facts_json = ?,
           updated_at = NOW()
       WHERE public_id = ?`,
      [
        review.status,
        review.reviewerId,
        review.notes || null,
        review.correctedIntent || null,
        review.correctedEntities ? JSON.stringify(review.correctedEntities) : null,
        review.correctedTool || null,
        review.correctedArgs ? JSON.stringify(review.correctedArgs) : null,
        review.correctedState ? JSON.stringify(review.correctedState) : null,
        review.correctedReply || null,
        review.requiredFacts ? JSON.stringify(review.requiredFacts) : null,
        review.forbiddenFacts ? JSON.stringify(review.forbiddenFacts) : null,
        publicId,
      ]
    );

    return (res?.affectedRows || 0) > 0;
  }

  private safeParse(data: any): any {
    if (!data) return null;
    if (typeof data === 'object') return data;
    try {
      return JSON.parse(data);
    } catch {
      return null;
    }
  }
}

export const caseBuilderService = new CaseBuilderService();
