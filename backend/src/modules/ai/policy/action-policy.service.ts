import { StructuredDecision } from '../planning/decision.schema.js';
import { AIConversationState } from '../state/ai-state.types.js';

export interface PolicyGateResult {
  allowed: boolean;
  violationCode?: string;
  violationMessage?: string;
  rejectionReason?: string;
}

export class ActionPolicyService {
  /**
   * Evaluates whether a proposed tool call / action is legally permitted by backend policy.
   */
  evaluatePolicy(
    decision: Partial<StructuredDecision> & { decision: any; tool?: { name: string; arguments?: Record<string, any> } | null },
    state: Partial<AIConversationState> | any,
    facts?: {
      hasActiveCart?: boolean;
      hasSelectedAddress?: boolean;
      awaitingConfirmation?: boolean;
      checkoutFingerprint?: string | null;
      isExplicitCartClearRequested?: boolean;
    }
  ): PolicyGateResult {
    const factsObj = facts || {};
    const tool = decision.tool;
    if (!tool || decision.decision !== 'CALL_TOOL') {
      return { allowed: true };
    }

    const toolName = tool.name;
    const args = tool.arguments || {};

    // 1. CLEAR_CART POLICY
    if (toolName === 'clear_cart') {
      const isPendingClearAction =
        state?.nextRequiredAction === 'CONFIRM_CART_CLEAR';
      const isExplicitConfirmation =
        args.confirmation === true || factsObj.isExplicitCartClearRequested;

      if (!isPendingClearAction && !isExplicitConfirmation) {
        return {
          allowed: false,
          violationCode: 'UNAUTHORIZED_CLEAR_CART',
          violationMessage: 'Cart clear requires explicit confirmation or an active pending clear action.',
          rejectionReason: 'Cart cannot be cleared without prior explicit confirmation.',
        };
      }
    }

    // 2. ORDER CREATION POLICY
    if (toolName === 'confirm_and_create_order') {
      // Must have active cart with items
      if (!factsObj.hasActiveCart) {
        return {
          allowed: false,
          violationCode: 'EMPTY_CART',
          violationMessage: 'Cannot create order with an empty cart.',
          rejectionReason: 'Cart is empty. Please add items before checking out.',
        };
      }

      // Must have selected address
      if (!factsObj.hasSelectedAddress && !state?.selectedAddress) {
        return {
          allowed: false,
          violationCode: 'MISSING_DELIVERY_ADDRESS',
          violationMessage: 'Order requires a selected and verified delivery address.',
          rejectionReason: 'Please specify a delivery address before confirming the order.',
        };
      }

      // Must be awaiting confirmation or have valid confirmation phrase
      const confPhrase = String(args.confirmation_phrase || '').trim().toLowerCase();
      const isExplicitConfirm =
        /^(confirm|akid|ta2kid|yes|eh|naam|نعم|تأكيد|ok)$/iu.test(confPhrase);

      if (!isExplicitConfirm) {
        return {
          allowed: false,
          violationCode: 'UNCONFIRMED_ORDER',
          violationMessage: 'Order creation requires explicit confirmation phrase ("confirm").',
          rejectionReason: 'Please review the summary and reply "confirm" to place the order.',
        };
      }
    }

    // 3. BATCH ORDER CONFIRMATION
    if (toolName === 'confirm_order_batch') {
      const selection = String(args.selection || '').toLowerCase();
      if (!['1', '2', 'both'].includes(selection)) {
        return {
          allowed: false,
          violationCode: 'INVALID_BATCH_SELECTION',
          violationMessage: 'Invalid batch order confirmation selection.',
          rejectionReason: 'Please reply "confirm 1", "confirm 2", or "confirm both".',
        };
      }
    }

    // 4. ADDRESS SELECTION
    if (toolName === 'select_delivery_address') {
      const label = args.address_label || args.phrase_or_label;
      if (!label || typeof label !== 'string' || !label.trim()) {
        return {
          allowed: false,
          violationCode: 'EMPTY_ADDRESS_LABEL',
          violationMessage: 'Address label cannot be empty.',
          rejectionReason: 'Please specify a valid address label.',
        };
      }
    }

    return { allowed: true };
  }
}

export const actionPolicyService = new ActionPolicyService();
