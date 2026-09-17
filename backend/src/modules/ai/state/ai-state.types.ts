import { redis } from '../../../database/redis.js';
import { execute, query } from '../../../database/db.js';
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
  /** Durable conversation primary key. Customer state must not span conversations. */
  conversationId?: number | null;
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
  /** One explicit continuation action that owns a short follow-up. */
  nextRequiredAction?: string | null;
  lastAssistantQuestion?: string | null;
  expectedEntity?: string | null;
  pendingProductCategory?: string | null;
  pendingProductMerchantBranchId?: number | null;
  /** Safe address state only. Raw address detail is persisted in the draft table. */
  addressDraft?: {
    id?: number | null;
    status: 'draft' | 'ambiguous' | 'unvalidated' | 'serviceable' | 'unserviceable' | 'saved';
    area?: string | null;
    summary?: string | null;
    saveConsent?: 'pending' | 'accepted' | 'declined' | null;
  } | null;
  pendingOrderBatchId?: number | null;
  historySummary?: string | null;
  lastProcessedMessageId?: number | null;
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
  nextRequiredAction?: string | null;
  lastAssistantQuestion?: string | null;
  expectedEntity?: string | null;
  pendingProductCategory?: string | null;
  addressDraft?: { status: string; area?: string | null; summary?: string | null } | null;
  pendingOrderBatchId?: number | null;
  historySummary?: string | null;
  turnIndex?: number;
  stateVersion: number;
}

export function createInitialState(customerId: number, language: SupportedLanguage = 'arabizi', conversationId: number | null = null): AIConversationState {
  return {
    customerId,
    conversationId,
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
    nextRequiredAction: null,
    lastAssistantQuestion: null,
    expectedEntity: null,
    pendingProductCategory: null,
    pendingProductMerchantBranchId: null,
    addressDraft: null,
    pendingOrderBatchId: null,
    historySummary: null,
    lastProcessedMessageId: null,
    stateVersion: 0,
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
    nextRequiredAction: state.nextRequiredAction || null,
    lastAssistantQuestion: state.lastAssistantQuestion || null,
    expectedEntity: state.expectedEntity || null,
    pendingProductCategory: state.pendingProductCategory || null,
    addressDraft: state.addressDraft
      ? { status: state.addressDraft.status, area: state.addressDraft.area || null, summary: state.addressDraft.summary || null }
      : null,
    pendingOrderBatchId: state.pendingOrderBatchId || null,
    historySummary: state.historySummary || null,
    turnIndex: state.turnIndex,
    stateVersion: state.stateVersion,
  };
}

export async function loadConversationState(customerId: number, conversationId?: number | null): Promise<AIConversationState> {
  if (conversationId) {
    try {
      const rows = await query<any[]>(
        `SELECT state_json, version_no FROM conversation_state WHERE conversation_id = ? LIMIT 1`,
        [conversationId],
      );
      if (rows.length > 0 && rows[0].state_json) {
        const raw = typeof rows[0].state_json === 'string' ? rows[0].state_json : JSON.stringify(rows[0].state_json);
        const parsed = JSON.parse(raw) as AIConversationState;
        parsed.customerId = customerId;
        parsed.conversationId = conversationId;
        parsed.stateVersion = Number(rows[0].version_no || parsed.stateVersion || 1);
        return normalizeLoadedState(parsed, customerId, conversationId);
      }
      if (rows.length > 0) {
        // Inbound persistence creates the durable state row before the first
        // AI turn. That row has no JSON snapshot yet, but its version is
        // still authoritative for the first compare-and-swap update.
        const initial = createInitialState(customerId, 'arabizi', conversationId);
        initial.stateVersion = Number(rows[0].version_no || 1);
        return initial;
      }
    } catch (err) {
      console.warn('[AI State] Error reading durable conversation state:', err);
    }
  }
  try {
    const raw = await redis.get(`ai:state:${conversationId || customerId}`);
    if (raw) {
      const parsed = JSON.parse(raw);
      return normalizeLoadedState(parsed, customerId, conversationId || null);
    }
  } catch (err) {
    console.warn('[AI State] Error reading state from Redis:', err);
  }

  return createInitialState(customerId, 'arabizi', conversationId || null);
}

function normalizeLoadedState(parsed: any, customerId: number, conversationId: number | null): AIConversationState {
  if (!parsed.stage) parsed.stage = 'IDLE';
  if (!parsed.preferredLanguage) parsed.preferredLanguage = 'arabizi';
  if (!parsed.stateVersion) parsed.stateVersion = 1;
  if (!Number.isInteger(parsed.turnIndex) || parsed.turnIndex < 0) parsed.turnIndex = 0;
  if (parsed.selectedMerchantId && !parsed.selectedMerchant) {
    parsed.selectedMerchant = { id: parsed.selectedMerchantId, name: parsed.selectedMerchantName || '', branchId: parsed.selectedMerchantBranchId || 0 };
  }
  if (parsed.budgetLimit && !parsed.activeBudget) parsed.activeBudget = { amount: parsed.budgetLimit, currency: 'USD' };
  if (parsed.selectedAddressId && !parsed.selectedAddress) {
    parsed.selectedAddress = { id: parsed.selectedAddressId, label: parsed.selectedAddressLabel || 'Home', formatted: parsed.selectedAddressLabel || 'Home' };
  }
  parsed.customerId = customerId;
  parsed.conversationId = conversationId;
  return parsed as AIConversationState;
}

export class StateVersionConflictError extends Error {
  constructor(public conversationId: number, public expectedVersion: number) {
    super(`State version conflict for conversation ${conversationId}: expected version ${expectedVersion}`);
    this.name = 'StateVersionConflictError';
  }
}

export async function saveConversationState(
  customerId: number,
  state: AIConversationState,
  conversationId?: number | null,
  options?: { expectedVersion?: number; enforceCas?: boolean }
): Promise<void> {
  const targetConversationId = conversationId || state.conversationId || null;
  const previousVersion = options?.expectedVersion ?? state.stateVersion ?? 0;

  const payload = {
    ...state,
    // Keep state JSON bounded and free of untrusted catalog blobs while
    // retaining every field needed to resolve numbered follow-up answers.
    lastPresentedOptions: (state.lastPresentedOptions || []).slice(0, 20).map((option: any) => ({
      merchantProductId: Number(option.merchantProductId),
      productId: Number(option.productId),
      merchantId: Number(option.merchantId),
      merchantBranchId: Number(option.merchantBranchId),
      merchantName: String(option.merchantName || '').slice(0, 120),
      merchantType: String(option.merchantType || '').slice(0, 40),
      merchantRating: Number(option.merchantRating || 0),
      productName: String(option.productName || '').slice(0, 160),
      description: String(option.description || '').slice(0, 300),
      basePrice: Number(option.basePrice || 0),
      deliveryFee: Number(option.deliveryFee || 0),
      estimatedMinutes: Number(option.estimatedMinutes || 0),
      isAvailable: option.isAvailable !== false,
      score: Number(option.score || 0),
    })),
    historySummary: state.historySummary ? String(state.historySummary).slice(-4000) : null,
    lastAssistantQuestion: state.lastAssistantQuestion ? String(state.lastAssistantQuestion).slice(0, 4096) : null,
    selectedAddressId: state.selectedAddress?.id ?? null,
    selectedAddressLabel: state.selectedAddress?.label ?? null,
    selectedMerchantId: state.selectedMerchant?.id ?? null,
    selectedMerchantName: state.selectedMerchant?.name ?? null,
    selectedMerchantBranchId: state.selectedMerchant?.branchId ?? null,
  };

  if (targetConversationId) {
    const existing = await query<any[]>(
      `SELECT version_no FROM conversation_state WHERE conversation_id = ? LIMIT 1`,
      [targetConversationId]
    );

    if (existing.length === 0) {
      // First state insertion
      const newVersion = previousVersion > 0 ? previousVersion : 1;
      state.stateVersion = newVersion;
      payload.stateVersion = newVersion;

      try {
        await execute(
          `INSERT INTO conversation_state
            (conversation_id, current_state, last_presented_options, pending_question, state_json, version_no)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [
            targetConversationId,
            state.stage,
            JSON.stringify(sanitizeStateSnapshot(state).lastPresentedOptions),
            payload.lastAssistantQuestion || null,
            JSON.stringify(payload),
            newVersion,
          ]
        );
      } catch (err: any) {
        // Another worker may have inserted the first state between our read
        // and insert. Re-run through the optimistic update path rather than
        // dropping the turn or writing a stale snapshot.
        if (err?.code !== 'ER_DUP_ENTRY' && Number(err?.errno) !== 1062) throw err;
        const raced = await query<any[]>(`SELECT version_no FROM conversation_state WHERE conversation_id = ? LIMIT 1`, [targetConversationId]);
        const racedVersion = Number(raced[0]?.version_no || 1);
        return saveConversationState(customerId, state, targetConversationId, {
          expectedVersion: racedVersion,
          enforceCas: options?.enforceCas,
        });
      }
    } else {
      const currentDbVersion = Number(existing[0].version_no || 1);
      const shouldEnforceCas = options?.enforceCas ?? (options?.expectedVersion !== undefined);

      if (shouldEnforceCas && currentDbVersion !== previousVersion) {
        throw new StateVersionConflictError(targetConversationId, previousVersion);
      }

      const effectivePrevVersion = shouldEnforceCas ? previousVersion : currentDbVersion;
      const newVersion = effectivePrevVersion + 1;
      state.stateVersion = newVersion;
      payload.stateVersion = newVersion;

      const res: any = await execute(
        `UPDATE conversation_state
         SET current_state = ?,
             last_presented_options = ?,
             pending_question = ?,
             state_json = ?,
             version_no = ?
         WHERE conversation_id = ? ${shouldEnforceCas ? 'AND version_no = ?' : ''}`,
        shouldEnforceCas
          ? [
              state.stage,
              JSON.stringify(sanitizeStateSnapshot(state).lastPresentedOptions),
              payload.lastAssistantQuestion || null,
              JSON.stringify(payload),
              newVersion,
              targetConversationId,
              previousVersion,
            ]
          : [
              state.stage,
              JSON.stringify(sanitizeStateSnapshot(state).lastPresentedOptions),
              payload.lastAssistantQuestion || null,
              JSON.stringify(payload),
              newVersion,
              targetConversationId,
            ]
      );

      if (shouldEnforceCas && res && res.affectedRows === 0) {
        throw new StateVersionConflictError(targetConversationId, previousVersion);
      }
    }
  }

  await redis.set(`ai:state:${targetConversationId || customerId}`, JSON.stringify(payload), 86400);
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
