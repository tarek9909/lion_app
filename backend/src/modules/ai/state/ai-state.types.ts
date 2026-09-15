import { redis } from '../../../database/redis.js';
import {
  ConversationStage,
  SupportedLanguage,
  ClarificationType,
  CanonicalIntent,
  isAllowedTransition,
} from '../contract/behavior.contract.js';
import { SearchResult } from '../../catalog/catalog.service.js';

export interface PresentedOptionSnapshot {
  index: number;
  productName: string;
  merchantName: string;
  priceUsd: number;
  deliveryFeeUsd: number;
  etaMinutes: number;
}

export interface CartItemSnapshot {
  productName: string;
  merchantName: string;
  quantity: number;
  unitPriceUsd: number;
  totalPriceUsd: number;
  variant?: string;
  notes?: string;
}

export interface CartSummarySnapshot {
  merchantName: string | null;
  itemsCount: number;
  items: CartItemSnapshot[];
  subtotalUsd: number;
  deliveryFeeUsd: number;
  totalUsd: number;
}

export interface SelectedAddressSnapshot {
  id: number;
  label: string;
  formatted: string;
  area?: string;
}

export interface PendingClarificationState {
  type: ClarificationType;
  candidates: string[];
  originalAction?: string;
  originalValue?: string;
  requestedValue?: string;
}

export interface PendingMerchantSwitchState {
  newMerchantId: number;
  newMerchantName: string;
  newBranchId?: number;
  proposedAtTurn?: number;
  pendingProduct: {
    merchantProductId?: number;
    productNameQuery?: string;
    quantity: number;
    notes?: string;
    variantName?: string;
  };
}

export interface ActiveOrderSummarySnapshot {
  orderId: number;
  orderNumber: string;
  merchantName: string;
  status: string;
  totalUsd: number;
  createdAt: string;
}

export interface AIConversationState {
  customerId: number;
  /** Incremented exactly once for each inbound customer message. */
  turnIndex: number;
  stage: ConversationStage;
  preferredLanguage: SupportedLanguage;
  lastPresentedOptions: SearchResult[];
  selectedMerchant: {
    id: number;
    name: string;
    branchId: number;
  } | null;
  activeBudget: {
    amount: number;
    currency: 'USD' | 'LBP';
  } | null;
  cartSummary: CartSummarySnapshot | null;
  selectedAddress: SelectedAddressSnapshot | null;
  awaitingConfirmation: boolean;
  checkoutFingerprint: string | null;
  pendingClarification: PendingClarificationState | null;
  pendingMerchantSwitch: PendingMerchantSwitchState | null;
  activeOrderSummary: ActiveOrderSummarySnapshot | null;
  stateVersion: number;
}

/**
 * Minimal, sanitized state snapshot exposed to Gemini on each turn.
 * Strips internal database IDs, internal pricing formulas, customer private phone, etc.
 */
export interface SanitizedStateSnapshot {
  stage: ConversationStage;
  language: SupportedLanguage;
  activeBudget: { amount: number; currency: string } | null;
  selectedMerchantName: string | null;
  lastPresentedOptions: PresentedOptionSnapshot[];
  cartSummary: {
    merchantName: string | null;
    itemsCount: number;
    items: {
      name: string;
      quantity: number;
      variant?: string;
      notes?: string;
      totalUsd: number;
    }[];
    subtotalUsd: number;
    deliveryFeeUsd: number;
    totalUsd: number;
  } | null;
  selectedAddressLabel: string | null;
  awaitingConfirmation: boolean;
  checkoutFingerprint?: string | null;
  pendingClarification: {
    type: ClarificationType;
    candidates: string[];
    requestedValue?: string;
  } | null;
  activeOrder: {
    orderNumber: string;
    status: string;
  } | null;
  stateVersion: number;
}

export function createInitialState(customerId: number, language: SupportedLanguage = 'arabizi'): AIConversationState {
  return {
    customerId,
    turnIndex: 0,
    stage: 'IDLE',
    preferredLanguage: language,
    lastPresentedOptions: [],
    selectedMerchant: null,
    activeBudget: null,
    cartSummary: null,
    selectedAddress: null,
    awaitingConfirmation: false,
    checkoutFingerprint: null,
    pendingClarification: null,
    pendingMerchantSwitch: null,
    activeOrderSummary: null,
    stateVersion: 1,
  };
}

export function sanitizeStateSnapshot(state: AIConversationState): SanitizedStateSnapshot {
  return {
    stage: state.stage,
    language: state.preferredLanguage,
    activeBudget: state.activeBudget,
    selectedMerchantName: state.selectedMerchant?.name || null,
    lastPresentedOptions: (state.lastPresentedOptions || []).map((opt, idx) => ({
      index: idx + 1,
      productName: opt.productName,
      merchantName: opt.merchantName,
      priceUsd: Number(opt.basePrice),
      deliveryFeeUsd: Number(opt.deliveryFee),
      etaMinutes: opt.estimatedMinutes,
    })),
    cartSummary: state.cartSummary
      ? {
          merchantName: state.cartSummary.merchantName,
          itemsCount: state.cartSummary.itemsCount,
          items: state.cartSummary.items.map((i) => ({
            name: i.productName,
            quantity: i.quantity,
            variant: i.variant,
            notes: i.notes,
            totalUsd: i.totalPriceUsd,
          })),
          subtotalUsd: state.cartSummary.subtotalUsd,
          deliveryFeeUsd: state.cartSummary.deliveryFeeUsd,
          totalUsd: state.cartSummary.totalUsd,
        }
      : null,
    selectedAddressLabel: state.selectedAddress?.label || null,
    awaitingConfirmation: state.awaitingConfirmation,
    checkoutFingerprint: state.checkoutFingerprint || null,
    pendingClarification: state.pendingClarification
      ? {
          type: state.pendingClarification.type,
          candidates: state.pendingClarification.candidates,
          requestedValue: state.pendingClarification.originalValue,
        }
      : null,
    activeOrder: state.activeOrderSummary
      ? {
          orderNumber: state.activeOrderSummary.orderNumber,
          status: state.activeOrderSummary.status,
        }
      : null,
    stateVersion: state.stateVersion,
  };
}

export async function loadConversationState(customerId: number): Promise<AIConversationState> {
  try {
    const raw = await redis.get(`ai:state:${customerId}`);
    if (raw) {
      const parsed = JSON.parse(raw);
      // Migrate legacy state if necessary
      if (!parsed.stage) parsed.stage = 'IDLE';
      if (!parsed.preferredLanguage) parsed.preferredLanguage = 'arabizi';
      if (!parsed.stateVersion) parsed.stateVersion = 1;
      if (!Number.isInteger(parsed.turnIndex) || parsed.turnIndex < 0) parsed.turnIndex = 0;
      if (parsed.selectedMerchantId && !parsed.selectedMerchant) {
        parsed.selectedMerchant = {
          id: parsed.selectedMerchantId,
          name: parsed.selectedMerchantName || '',
          branchId: parsed.selectedMerchantBranchId || 0,
        };
      }
      if (parsed.budgetLimit && !parsed.activeBudget) {
        parsed.activeBudget = { amount: parsed.budgetLimit, currency: 'USD' };
      }
      if (parsed.selectedAddressId && !parsed.selectedAddress) {
        parsed.selectedAddress = {
          id: parsed.selectedAddressId,
          label: parsed.selectedAddressLabel || 'Home',
          formatted: parsed.selectedAddressLabel || 'Home',
        };
      }
      return parsed;
    }
  } catch (err) {
    console.warn('[AI State] Error reading state from Redis:', err);
  }

  return createInitialState(customerId);
}

export async function saveConversationState(customerId: number, state: AIConversationState): Promise<void> {
  try {
    state.stateVersion = (state.stateVersion || 0) + 1;
    const payload = {
      ...state,
      selectedAddressId: state.selectedAddress?.id ?? null,
      selectedAddressLabel: state.selectedAddress?.label ?? null,
      selectedMerchantId: state.selectedMerchant?.id ?? null,
      selectedMerchantName: state.selectedMerchant?.name ?? null,
      selectedMerchantBranchId: state.selectedMerchant?.branchId ?? null,
    };
    await redis.set(`ai:state:${customerId}`, JSON.stringify(payload), 86400);
  } catch (err) {
    console.warn('[AI State] Error saving state to Redis:', err);
  }
}

export function transitionConversationStage(
  state: AIConversationState,
  nextStage: ConversationStage
): boolean {
  if (isAllowedTransition(state.stage, nextStage)) {
    state.stage = nextStage;
    return true;
  }
  console.warn(`[AI State] Rejected illegal transition from ${state.stage} to ${nextStage}`);
  return false;
}
