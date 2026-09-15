import { SearchResult } from '../catalog/catalog.service.js';
import { ConversationStage } from './contract/behavior.contract.js';
import { SupportedLanguage } from './contract/behavior.contract.js';

export interface AIContextState {
  customerId: number;
  lastPresentedOptions: SearchResult[];
  selectedMerchantId: number | null;
  selectedMerchantBranchId: number | null;
  selectedMerchantName: string | null;
  budgetLimit: number | null;
  pendingClarification: 'SIZE_TARGET_DISAMBIGUATION' | 'QUANTITY_TARGET_DISAMBIGUATION' | 'ADDRESS_DISAMBIGUATION' | null;
  pendingClarificationData?: any;
  selectedAddressId: number | null;
  selectedAddressLabel: string | null;
  awaitingConfirmation: boolean;
  activeOrderId: number | null;
  /** Persisted inbound-customer-message counter used for turn isolation. */
  turnIndex: number;
  stage: ConversationStage;
  checkoutFingerprint: string | null;
  pendingMerchantSwitch?: any;
  activeOrderSummary?: any;
  cartSummary?: any;
  selectedAddress?: any;
  /** Language detected from the latest sender message. */
  preferredLanguage?: SupportedLanguage;
}

export type ValidatedIntent =
  | 'GREETING'
  | 'SEARCH_RESULTS'
  | 'BUDGET_SEARCH'
  | 'COMPARE_CURRENT_OPTIONS'
  | 'SEARCH_CHEAPER'
  | 'SEARCH_DESSERTS'
  | 'BASKET_COMPARISON'
  | 'IMAGE_SEARCH'
  | 'ADD_TO_CART'
  | 'UPDATE_QUANTITY'
  | 'UPDATE_VARIANT'
  | 'PRODUCT_MODIFICATION'
  | 'REMOVE_ITEM'
  | 'CLEAR_CART'
  | 'VIEW_CART'
  | 'CLARIFICATION_REQUIRED'
  | 'CLARIFICATION_RESOLVED'
  | 'ADDRESS_SELECTED'
  | 'ADDRESS_REQUIRED'
  | 'ORDER_CONFIRMED'
  | 'ORDER_STATUS'
  | 'PRICE_CHECK'
  | 'SUPPORT_REQUEST'
  | 'EMPTY_CART'
  | 'GENERAL_GREETING';

export interface AIProcessResult {
  replyText: string;
  intent: ValidatedIntent;
  confidence: number;
  actionTaken?: string;
  cartSummary?: any;
  orderCreated?: any;
}
