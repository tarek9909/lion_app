/**
 * Lion Delivery AI Behavior Contract
 * Version: 1.0.0
 *
 * Authoritative, versioned, machine-readable specification shared by
 * runtime code, server-side tools, tests, evaluation, and datasets.
 */

export const BEHAVIOR_CONTRACT_VERSION = '1.0.0';

// -----------------------------------------------------------------------------
// 1. CANONICAL INTENT TAXONOMY
// -----------------------------------------------------------------------------
export const CANONICAL_INTENTS = [
  'GREETING',
  'SEARCH_PRODUCTS',
  'COMPARE_RESULTS',
  'COMPARE_BASKET',
  'SELECT_RESULT',
  'VIEW_CART',
  'ADD_TO_CART',
  'REMOVE_FROM_CART',
  'CLEAR_CART',
  'UPDATE_QUANTITY',
  'UPDATE_VARIANT',
  'ADD_ITEM_NOTE',
  'SELECT_ADDRESS',
  'CHECKOUT_PREVIEW',
  'CONFIRM_ORDER',
  'ORDER_STATUS',
  'CONTACT_SUPPORT',
  'UNKNOWN',
] as const;

export type CanonicalIntent = (typeof CANONICAL_INTENTS)[number];

// Legacy Intent Compatibility Adapter
export type LegacyIntent =
  | 'GREETING'
  | 'GENERAL_GREETING'
  | 'SEARCH_RESULTS'
  | 'BUDGET_SEARCH'
  | 'COMPARE_CURRENT_OPTIONS'
  | 'SEARCH_CHEAPER'
  | 'SEARCH_DESSERTS'
  | 'BASKET_COMPARISON'
  | 'IMAGE_SEARCH'
  | 'SELECT_RESULT'
  | 'VIEW_CART'
  | 'EMPTY_CART'
  | 'ADD_TO_CART'
  | 'REMOVE_ITEM'
  | 'CLEAR_CART'
  | 'UPDATE_QUANTITY'
  | 'UPDATE_VARIANT'
  | 'PRODUCT_MODIFICATION'
  | 'CLARIFICATION_REQUIRED'
  | 'CLARIFICATION_RESOLVED'
  | 'ADDRESS_SELECTED'
  | 'ADDRESS_REQUIRED'
  | 'CHECKOUT_PREVIEW'
  | 'ORDER_CONFIRMED'
  | 'ORDER_STATUS'
  | 'PRICE_CHECK'
  | 'SUPPORT_REQUEST'
  | 'HUMAN_HANDOFF'
  | 'UNKNOWN';

const LEGACY_TO_CANONICAL_MAP: Record<LegacyIntent, CanonicalIntent> = {
  GREETING: 'GREETING',
  GENERAL_GREETING: 'GREETING',
  SEARCH_RESULTS: 'SEARCH_PRODUCTS',
  BUDGET_SEARCH: 'SEARCH_PRODUCTS',
  COMPARE_CURRENT_OPTIONS: 'COMPARE_RESULTS',
  SEARCH_CHEAPER: 'SEARCH_PRODUCTS',
  SEARCH_DESSERTS: 'SEARCH_PRODUCTS',
  BASKET_COMPARISON: 'COMPARE_BASKET',
  IMAGE_SEARCH: 'SEARCH_PRODUCTS',
  SELECT_RESULT: 'SELECT_RESULT',
  VIEW_CART: 'VIEW_CART',
  EMPTY_CART: 'VIEW_CART',
  ADD_TO_CART: 'ADD_TO_CART',
  REMOVE_ITEM: 'REMOVE_FROM_CART',
  CLEAR_CART: 'CLEAR_CART',
  UPDATE_QUANTITY: 'UPDATE_QUANTITY',
  UPDATE_VARIANT: 'UPDATE_VARIANT',
  PRODUCT_MODIFICATION: 'ADD_ITEM_NOTE',
  CLARIFICATION_REQUIRED: 'UNKNOWN',
  CLARIFICATION_RESOLVED: 'UPDATE_VARIANT',
  ADDRESS_SELECTED: 'SELECT_ADDRESS',
  ADDRESS_REQUIRED: 'SELECT_ADDRESS',
  CHECKOUT_PREVIEW: 'CHECKOUT_PREVIEW',
  ORDER_CONFIRMED: 'CONFIRM_ORDER',
  ORDER_STATUS: 'ORDER_STATUS',
  PRICE_CHECK: 'SEARCH_PRODUCTS',
  SUPPORT_REQUEST: 'CONTACT_SUPPORT',
  HUMAN_HANDOFF: 'CONTACT_SUPPORT',
  UNKNOWN: 'UNKNOWN',
};

export function toCanonicalIntent(intent: string): CanonicalIntent {
  if (CANONICAL_INTENTS.includes(intent as CanonicalIntent)) {
    return intent as CanonicalIntent;
  }
  return LEGACY_TO_CANONICAL_MAP[intent as LegacyIntent] || 'UNKNOWN';
}

export function toLegacyIntent(canonical: CanonicalIntent): LegacyIntent {
  switch (canonical) {
    case 'GREETING':
      return 'GREETING';
    case 'SEARCH_PRODUCTS':
      return 'SEARCH_RESULTS';
    case 'COMPARE_RESULTS':
      return 'COMPARE_CURRENT_OPTIONS';
    case 'COMPARE_BASKET':
      return 'BASKET_COMPARISON';
    case 'SELECT_RESULT':
      return 'SELECT_RESULT';
    case 'VIEW_CART':
      return 'VIEW_CART';
    case 'ADD_TO_CART':
      return 'ADD_TO_CART';
    case 'REMOVE_FROM_CART':
      return 'REMOVE_ITEM';
    case 'CLEAR_CART':
      return 'CLEAR_CART';
    case 'UPDATE_QUANTITY':
      return 'UPDATE_QUANTITY';
    case 'UPDATE_VARIANT':
      return 'UPDATE_VARIANT';
    case 'ADD_ITEM_NOTE':
      return 'PRODUCT_MODIFICATION';
    case 'SELECT_ADDRESS':
      return 'ADDRESS_SELECTED';
    case 'CHECKOUT_PREVIEW':
      return 'CHECKOUT_PREVIEW';
    case 'CONFIRM_ORDER':
      return 'ORDER_CONFIRMED';
    case 'ORDER_STATUS':
      return 'ORDER_STATUS';
    case 'CONTACT_SUPPORT':
      return 'SUPPORT_REQUEST';
    case 'CLARIFICATION_REQUIRED' as any:
      return 'CLARIFICATION_REQUIRED' as any;
    case 'UNKNOWN':
    default:
      return 'UNKNOWN';
  }
}

// -----------------------------------------------------------------------------
// 2. SUPPORTED LANGUAGES
// -----------------------------------------------------------------------------
export const SUPPORTED_LANGUAGES = [
  'en',       // English
  'ar',       // Standard Arabic
  'ar_lb',    // Lebanese Arabic script
  'arabizi',  // Lebanese Arabizi (Latin script with numerals 2, 3, 7, etc.)
  'mixed',    // Code-switched / multilingual
] as const;

export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

// -----------------------------------------------------------------------------
// 3. CONVERSATION STAGES
// -----------------------------------------------------------------------------
export const CONVERSATION_STAGES = [
  'IDLE',
  'SEARCHING',
  'SELECTING_OPTION',
  'EDITING_CART',
  'AWAITING_CLARIFICATION',
  'AWAITING_MERCHANT_SWITCH',
  'SELECTING_ADDRESS',
  'AWAITING_CONFIRMATION',
  'ORDER_PLACED',
  'TRACKING_ORDER',
  'HUMAN_SUPPORT',
] as const;

export type ConversationStage = (typeof CONVERSATION_STAGES)[number];

// -----------------------------------------------------------------------------
// 4. CLARIFICATION TYPES
// -----------------------------------------------------------------------------
export const CLARIFICATION_TYPES = [
  'CART_ITEM_TARGET',            // Which item to modify/update (e.g. coke vs chicken meal)
  'VARIANT_OPTION',              // Which size/flavor/variant
  'QUANTITY_TARGET',             // Which item quantity
  'ADDRESS_SELECTION',           // Which delivery address
  'IMAGE_DISAMBIGUATION',        // Disambiguate between multiple product candidates
  'MERCHANT_SWITCH_CONFIRMATION',// Confirm clearing existing cart from merchant A to add from merchant B
] as const;

export type ClarificationType = (typeof CLARIFICATION_TYPES)[number];

// -----------------------------------------------------------------------------
// 5. TOOLS AND MUTABILITY CLASSIFICATION
// -----------------------------------------------------------------------------
export const READ_ONLY_TOOLS = [
  'search_catalog',
  'compare_supermarket_basket',
  'get_active_cart',
  'list_saved_addresses',
  'get_customer_addresses',
  'get_order_status',
  'request_human_support',
  'switch_merchant_reject',
] as const;

export const MUTATING_TOOLS = [
  'add_to_cart',
  'update_cart_quantity',
  'update_cart_variant',
  'update_cart_notes',
  'remove_cart_item',
  'clear_cart',
  'select_delivery_address',
  'confirm_and_create_order',
  'switch_merchant_confirm',
] as const;

export type ReadOnlyTool = (typeof READ_ONLY_TOOLS)[number];
export type MutatingTool = (typeof MUTATING_TOOLS)[number];
export type ControlledTool = ReadOnlyTool | MutatingTool;

export function isMutatingTool(toolName: string): boolean {
  return (MUTATING_TOOLS as readonly string[]).includes(toolName as any);
}

export const TOOL_INTENT_MAP: Record<ControlledTool, CanonicalIntent> = {
  search_catalog: 'SEARCH_PRODUCTS',
  compare_supermarket_basket: 'COMPARE_BASKET',
  get_active_cart: 'VIEW_CART',
  add_to_cart: 'ADD_TO_CART',
  update_cart_quantity: 'UPDATE_QUANTITY',
  update_cart_variant: 'UPDATE_VARIANT',
  update_cart_notes: 'ADD_ITEM_NOTE',
  remove_cart_item: 'REMOVE_FROM_CART',
  clear_cart: 'CLEAR_CART',
  list_saved_addresses: 'SELECT_ADDRESS',
  get_customer_addresses: 'SELECT_ADDRESS',
  select_delivery_address: 'SELECT_ADDRESS',
  confirm_and_create_order: 'CONFIRM_ORDER',
  get_order_status: 'ORDER_STATUS',
  request_human_support: 'CONTACT_SUPPORT',
  switch_merchant_confirm: 'ADD_TO_CART',
  switch_merchant_reject: 'VIEW_CART',
};

// -----------------------------------------------------------------------------
// 6. STATE TRANSITION RULES
// -----------------------------------------------------------------------------
export interface StateTransitionRule {
  from: ConversationStage;
  allowedTransitions: ConversationStage[];
  requiredPrerequisites?: Record<string, any>;
}

export const STATE_TRANSITIONS: Record<ConversationStage, ConversationStage[]> = {
  IDLE: ['SEARCHING', 'SELECTING_OPTION', 'EDITING_CART', 'SELECTING_ADDRESS', 'TRACKING_ORDER', 'HUMAN_SUPPORT'],
  SEARCHING: ['IDLE', 'SELECTING_OPTION', 'EDITING_CART', 'AWAITING_CLARIFICATION', 'TRACKING_ORDER', 'HUMAN_SUPPORT'],
  SELECTING_OPTION: ['SEARCHING', 'EDITING_CART', 'AWAITING_MERCHANT_SWITCH', 'AWAITING_CLARIFICATION', 'SELECTING_ADDRESS', 'AWAITING_CONFIRMATION', 'HUMAN_SUPPORT'],
  EDITING_CART: ['SEARCHING', 'SELECTING_OPTION', 'EDITING_CART', 'AWAITING_CLARIFICATION', 'AWAITING_MERCHANT_SWITCH', 'SELECTING_ADDRESS', 'AWAITING_CONFIRMATION', 'TRACKING_ORDER', 'IDLE', 'HUMAN_SUPPORT'],
  AWAITING_CLARIFICATION: ['EDITING_CART', 'SELECTING_ADDRESS', 'AWAITING_CONFIRMATION', 'SEARCHING', 'HUMAN_SUPPORT'],
  AWAITING_MERCHANT_SWITCH: ['EDITING_CART', 'IDLE', 'SEARCHING', 'HUMAN_SUPPORT'],
  SELECTING_ADDRESS: ['EDITING_CART', 'AWAITING_CONFIRMATION', 'SEARCHING', 'HUMAN_SUPPORT'],
  AWAITING_CONFIRMATION: ['ORDER_PLACED', 'SELECTING_ADDRESS', 'EDITING_CART', 'SEARCHING', 'IDLE', 'TRACKING_ORDER', 'HUMAN_SUPPORT'],
  ORDER_PLACED: ['TRACKING_ORDER', 'IDLE', 'SEARCHING', 'HUMAN_SUPPORT'],
  TRACKING_ORDER: ['IDLE', 'SEARCHING', 'EDITING_CART', 'TRACKING_ORDER', 'HUMAN_SUPPORT'],
  HUMAN_SUPPORT: ['IDLE', 'SEARCHING', 'EDITING_CART', 'HUMAN_SUPPORT'],
};

export function isAllowedTransition(from: ConversationStage, to: ConversationStage): boolean {
  if (from === to) return true;
  const allowed = STATE_TRANSITIONS[from];
  return allowed ? allowed.includes(to) : false;
}

// -----------------------------------------------------------------------------
// 7. CRITICAL SAFETY AND FACT GROUNDING INVARIANTS
// -----------------------------------------------------------------------------
export const SAFETY_INVARIANTS = {
  ORDER_CONFIRMATION: {
    requiresExplicitPhrase: true,
    requiresSelectedAddress: true,
    requiresFinalSummaryPresented: true,
    forbiddenIfNegated: true,
    forbiddenIfHistorical: true,
    forbiddenIfCartEmpty: true,
  },
  CART_MUTATIONS: {
    maxConflictingMutationsPerTurn: 1,
    requiresExplicitClearLanguage: true,
    blocksSilentMerchantSwitch: true,
    blocksAmbiguousTargetUpdate: true,
    disallowsNegativeQuantity: true,
    disallowsDecimalQuantity: true,
    maxQuantityPerItem: 99,
  },
  FACT_GROUNDING: {
    disallowsInventedPrices: true,
    disallowsInventedAvailability: true,
    disallowsInventedAddresses: true,
    disallowsInventedOrderNumbers: true,
    disallowsInventedDeliveryFees: true,
    requiresSameLanguageResponse: true,
    hidesInternalDbIds: true,
    hidesInternalPromptsAndSecrets: true,
  },
} as const;

// -----------------------------------------------------------------------------
// 8. MACHINE READABLE SPECIFICATION EXPORT
// -----------------------------------------------------------------------------
export function getBehaviorContractSchema() {
  return {
    version: BEHAVIOR_CONTRACT_VERSION,
    canonicalIntents: CANONICAL_INTENTS,
    supportedLanguages: SUPPORTED_LANGUAGES,
    conversationStages: CONVERSATION_STAGES,
    clarificationTypes: CLARIFICATION_TYPES,
    readOnlyTools: READ_ONLY_TOOLS,
    mutatingTools: MUTATING_TOOLS,
    toolIntentMap: TOOL_INTENT_MAP,
    stateTransitions: STATE_TRANSITIONS,
    safetyInvariants: SAFETY_INVARIANTS,
  };
}
