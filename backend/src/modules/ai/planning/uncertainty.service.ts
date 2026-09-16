import { StructuredDecision } from './decision.schema.js';
import { ConversationTask } from '../context/task-stack.service.js';

export interface UncertaintyEvaluation {
  compositeScore: number;
  status: 'CLEAR' | 'AMBIGUOUS' | 'UNCLEAR';
  requiresClarification: boolean;
  requiresHandoff: boolean;
  clarificationMessage?: string;
  reasons: string[];
}

export class UncertaintyService {
  /**
   * Evaluate composite uncertainty across intent, reference resolution,
   * entity completeness, grounding, and risk.
   */
  evaluateDecision(
    decision: StructuredDecision,
    activeTask: ConversationTask | null,
    attemptCount: number = 0,
    language: string = 'arabizi'
  ): UncertaintyEvaluation {
    const u = decision.uncertainty;
    const reasons: string[] = [];

    // Calculate weighted composite score
    // 35% intent, 25% reference resolution, 25% entity completeness, 15% grounding
    let composite =
      u.intent * 0.35 +
      u.reference_resolution * 0.25 +
      u.entity_completeness * 0.25 +
      u.grounding * 0.15;

    // Penalty for unresolved ambiguities
    if (decision.ambiguities && decision.ambiguities.length > 0) {
      composite -= 0.25 * Math.min(decision.ambiguities.length, 2);
      reasons.push(`Ambiguities present: ${decision.ambiguities.join(', ')}`);
    }

    // Penalty for missing entities
    if (decision.missing_entities && decision.missing_entities.length > 0) {
      composite -= 0.20 * Math.min(decision.missing_entities.length, 2);
      reasons.push(`Missing entities: ${decision.missing_entities.join(', ')}`);
    }

    // Higher risk actions (destructive or financial) require higher certainty
    if (decision.risk === 'FINANCIAL_IRREVERSIBLE' || decision.risk === 'DESTRUCTIVE_REVERSIBLE') {
      if (composite < 0.95) {
        composite *= 0.85; // Strict penalty for risky mutations
        reasons.push(`High risk action (${decision.risk}) demands higher threshold`);
      }
    }

    composite = Math.max(0, Math.min(1, Math.round(composite * 100) / 100));

    let status: 'CLEAR' | 'AMBIGUOUS' | 'UNCLEAR' = 'CLEAR';
    if (composite >= 0.90) {
      status = 'CLEAR';
    } else if (composite >= 0.55) {
      status = 'AMBIGUOUS';
    } else {
      status = 'UNCLEAR';
    }

    // Check loop prevention
    const effectiveAttempts = (activeTask?.clarificationAttempts || 0) + attemptCount;
    const requiresHandoff = effectiveAttempts >= 2; // On 3rd failure (attempt count = 2)

    let clarificationMessage: string | undefined;
    if (requiresHandoff) {
      clarificationMessage = this.composeHandoffMessage(language);
    } else if (status === 'AMBIGUOUS') {
      clarificationMessage = this.composeAmbiguityClarification(decision, language, effectiveAttempts);
    } else if (status === 'UNCLEAR') {
      clarificationMessage = this.composeUnclearClarification(language);
    }

    return {
      compositeScore: composite,
      status,
      requiresClarification: status !== 'CLEAR' || decision.decision === 'CLARIFY',
      requiresHandoff,
      clarificationMessage,
      reasons,
    };
  }

  private composeAmbiguityClarification(
    decision: StructuredDecision,
    language: string,
    attempt: number
  ): string {
    const understood = decision.understood_goal || 'fhemet 3layk';
    const missing = decision.missing_entities?.length
      ? decision.missing_entities.join(' aw ')
      : decision.ambiguities?.join(', ') || 'l talab';

    if (language === 'arabizi') {
      if (attempt === 1) {
        return `Fhemet ${understood}, bas na2es ${missing}. Shou btekhhtar?`;
      }
      return `Baddak t2akked: ${missing}? Rodd bel esm l wade7.`;
    }
    if (language === 'ar' || language === 'ar_lb') {
      if (attempt === 1) {
        return `فهمت طلبك، بس ناقص ${missing}. شو بتفضّل؟`;
      }
      return `بدك تأكد: ${missing}؟ ردّ بالاسم الواضح.`;
    }
    return `I understood your request, but I need ${missing}. Which would you like?`;
  }

  private composeUnclearClarification(language: string): string {
    if (language === 'arabizi') {
      return 'Ma fhemet 3layk. Baddak tshouf l menu, tzid item, tshouf l cart, aw tetba3 talab?';
    }
    if (language === 'ar' || language === 'ar_lb') {
      return 'ما فهمت عليك. بدك تشوف القائمة، تضيف صنف، تشوف السلة، أو تتبع طلبك؟';
    }
    return "I didn't quite understand. Would you like to view the menu, add an item, check your cart, or track an order?";
  }

  private composeHandoffMessage(language: string): string {
    if (language === 'arabizi') {
      return '3am shrouf fi so3oube befham l talab mazbout. Ra7 7awlak la 7ada men team l support la ykammel ma3ak halla2.';
    }
    if (language === 'ar' || language === 'ar_lb') {
      return 'عم لاقي صعوبة بفهم الطلب بدقة. رح حوّلك لحدا من فريق الدعم ليساعدك فوراً.';
    }
    return "I'm having trouble understanding accurately. I am connecting you with our human support team right now.";
  }
}

export const uncertaintyService = new UncertaintyService();
