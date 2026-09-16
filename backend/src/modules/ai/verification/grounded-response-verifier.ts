import { sanitizeCustomerOutput } from '../customer-output.js';
import { isResponseInSenderLanguage, SenderLanguage } from '../sender-language.js';

export interface GroundedVerificationInput {
  responseText: string;
  targetLanguage: SenderLanguage;
  verifiedFacts: {
    productNames?: string[];
    merchantNames?: string[];
    prices?: (number | string)[];
    fees?: (number | string)[];
    totals?: (number | string)[];
    addressLabels?: string[];
    orderNumbers?: string[];
    orderStatuses?: string[];
  };
  toolExecutionSuccess?: boolean;
  toolName?: string;
  maxLength?: number;
}

export interface VerificationReport {
  passed: boolean;
  sanitizedText: string;
  violations: string[];
  requiresRepair: boolean;
}

export class GroundedResponseVerifier {
  private readonly defaultMaxLength = 2048;

  verify(input: GroundedVerificationInput): VerificationReport {
    const violations: string[] = [];
    let text = input.responseText || '';
    const maxLength = input.maxLength || this.defaultMaxLength;

    // 1. WhatsApp Plain-Text Boundary
    const sanitized = sanitizeCustomerOutput(text);

    // 2. Length check
    if (sanitized.length > maxLength) {
      violations.push(`Response length (${sanitized.length}) exceeds budget (${maxLength})`);
    }

    // 3. Language & Script Consistency
    if (input.targetLanguage && !isResponseInSenderLanguage(input.targetLanguage, sanitized)) {
      violations.push(`Response language does not match expected target: ${input.targetLanguage}`);
    }

    // 4. Mutation Success Claim Gate
    if (input.toolExecutionSuccess === false) {
      // Tool failed, response must NOT claim success
      const claimSuccess = /(?:تم تأكيد|successfully|order placed|added to cart|faddayt l cart|cleared your cart|cree avec succes)/iu.test(sanitized);
      if (claimSuccess) {
        violations.push(`Unsupported success claim after tool ${input.toolName || 'unknown'} failure`);
      }
    }

    // 5. Secret / Internal ID Leak Gate
    const leakPattern = /(?:bearer\s+[a-z0-9_\-\.]+|api_key|password|jwt|sk-[a-z0-9]+|system_prompt|database_url)/iu;
    if (leakPattern.test(sanitized)) {
      violations.push('Internal credential or secret detected in customer response');
    }

    // 6. Number of questions: At most one clear question
    const questionMarks = (sanitized.match(/\?|؟/g) || []).length;
    if (questionMarks > 2) {
      violations.push(`Too many questions in single turn (${questionMarks}). Only 1 actionable question allowed.`);
    }

    const passed = violations.length === 0;

    return {
      passed,
      sanitizedText: sanitized,
      violations,
      requiresRepair: !passed,
    };
  }
}

export const groundedResponseVerifier = new GroundedResponseVerifier();
