export type RootCauseCategory =
  | 'LANGUAGE_DETECTION'
  | 'CONTEXT_LOSS'
  | 'REFERENCE_RESOLUTION'
  | 'UNCLEAR_MESSAGE_HANDLING'
  | 'WRONG_INTENT'
  | 'MISSING_ENTITY'
  | 'WRONG_TOOL'
  | 'WRONG_TOOL_ARGUMENT'
  | 'CATALOG_RETRIEVAL'
  | 'BUSINESS_RULE'
  | 'MEMORY_ERROR'
  | 'RESPONSE_LANGUAGE'
  | 'RESPONSE_TONE'
  | 'UNSUPPORTED_CLAIM'
  | 'TOOL_OR_PROVIDER_FAILURE'
  | 'LATENCY_OR_DUPLICATE'
  | 'HUMAN_REVIEW_REQUIRED';

export interface RootCauseClassification {
  primaryCause: RootCauseCategory;
  contributingCauses: RootCauseCategory[];
  confidence: number;
  explanation: string;
}

export class RootCauseClassifierService {
  classifyFailure(turnData: {
    userMessage: string;
    assistantResponse: string;
    detectedIntent?: string;
    expectedIntent?: string;
    customerReaction?: string;
    toolExecutionSuccess?: boolean;
    hasContextLoss?: boolean;
    hasUnsupportedClaim?: boolean;
    hasWrongLanguage?: boolean;
  }): RootCauseClassification {
    const contributing: RootCauseCategory[] = [];

    // 1. Unsupported operational claim
    if (turnData.hasUnsupportedClaim) {
      return {
        primaryCause: 'UNSUPPORTED_CLAIM',
        contributingCauses: contributing,
        confidence: 0.95,
        explanation: 'Assistant made an operational claim not backed by tool execution facts.',
      };
    }

    // 2. Context loss
    if (turnData.hasContextLoss || turnData.customerReaction === 'REPEATED_QUESTION') {
      return {
        primaryCause: 'CONTEXT_LOSS',
        contributingCauses: contributing,
        confidence: 0.90,
        explanation: 'Active task or pending referent was dropped or overwritten.',
      };
    }

    // 3. Wrong Language
    if (turnData.hasWrongLanguage) {
      return {
        primaryCause: 'RESPONSE_LANGUAGE',
        contributingCauses: contributing,
        confidence: 0.95,
        explanation: 'Assistant responded in incorrect language or script.',
      };
    }

    // 4. Reference Resolution (e.g. "yes", "number 2", "that one" misunderstood)
    const shortRef = /^(yes|no|both|the second one|that one|eh|la|na3am)$/iu.test(turnData.userMessage.trim());
    if (shortRef && turnData.customerReaction === 'CORRECTED_ASSISTANT') {
      return {
        primaryCause: 'REFERENCE_RESOLUTION',
        contributingCauses: ['CONTEXT_LOSS'],
        confidence: 0.88,
        explanation: 'Short contextual follow-up failed to bind to active task.',
      };
    }

    // 5. Tool / Provider failure
    if (turnData.toolExecutionSuccess === false) {
      return {
        primaryCause: 'TOOL_OR_PROVIDER_FAILURE',
        contributingCauses: contributing,
        confidence: 0.92,
        explanation: 'Controlled backend tool encountered an execution or validation error.',
      };
    }

    // 6. Wrong Intent
    if (turnData.expectedIntent && turnData.detectedIntent && turnData.expectedIntent !== turnData.detectedIntent) {
      return {
        primaryCause: 'WRONG_INTENT',
        contributingCauses: contributing,
        confidence: 0.85,
        explanation: `Model detected intent '${turnData.detectedIntent}' but turn expected '${turnData.expectedIntent}'.`,
      };
    }

    // Default to human review
    return {
      primaryCause: 'HUMAN_REVIEW_REQUIRED',
      contributingCauses: contributing,
      confidence: 0.70,
      explanation: 'Uncertain or multi-factor conversational anomaly flagged for operator diagnosis.',
    };
  }
}

export const rootCauseClassifierService = new RootCauseClassifierService();
