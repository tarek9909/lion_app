import { SearchResult } from '../catalog/catalog.service.js';

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
