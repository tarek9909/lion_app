import { createHash } from 'node:crypto';
import { ToolArgumentSchemas } from '../contract/tool-schemas.js';
import { isExplicitConfirmation, isHistoricalOrQuestionConfirmation, isNegatedConfirmation } from '../checkout-safety.js';
import { AIConversationState, CartSummarySnapshot, createInitialState } from '../state/ai-state.types.js';
import { SearchResult } from '../../catalog/catalog.service.js';

export interface EvaluatorToolExecution {
  success: boolean;
  result: any;
  error?: string;
  errorCode?: string;
  stateChanged: boolean;
  orderCreated?: { id: number; order_number: string; status: string; total: number };
}

export interface EvaluatorSandbox {
  state: AIConversationState;
  ordersCreated: number;
  nextOrderId: number;
}

function fixtureOptions(query: string): SearchResult[] {
  const lower = String(query || '').toLowerCase();
  if (!/(crispy|chicken|burger|coke|cola|7elo|sweet|dessert|milk|bread|lays|grocery)/.test(lower)) return [];

  const options: SearchResult[] = [
    {
      merchantProductId: 101,
      productId: 1,
      merchantId: 1,
      merchantBranchId: 11,
      merchantName: 'Chicken House',
      merchantType: 'RESTAURANT',
      merchantRating: 4.8,
      productName: 'Crispy Chicken Meal',
      description: 'Crispy chicken meal',
      basePrice: 8.5,
      deliveryFee: 1.5,
      estimatedMinutes: 30,
      isAvailable: true,
      score: 100,
    },
    {
      merchantProductId: 102,
      productId: 2,
      merchantId: 2,
      merchantBranchId: 22,
      merchantName: 'Snack Abou Afif',
      merchantType: 'RESTAURANT',
      merchantRating: 4.5,
      productName: 'Crispy Strips Combo',
      description: 'Crispy chicken strips',
      basePrice: 9,
      deliveryFee: 1,
      estimatedMinutes: 28,
      isAvailable: true,
      score: 95,
    },
    {
      merchantProductId: 103,
      productId: 3,
      merchantId: 3,
      merchantBranchId: 33,
      merchantName: 'Fresh Market',
      merchantType: 'SUPERMARKET',
      merchantRating: 4.4,
      productName: 'Coke Zero',
      description: 'Coke Zero can',
      basePrice: 1.25,
      deliveryFee: 1.5,
      estimatedMinutes: 35,
      isAvailable: true,
      score: 90,
    },
  ];

  if (/(coke|cola)/.test(lower)) return [options[2]];
  if (/(burger)/.test(lower)) return [options[1]];
  return options.slice(0, 2);
}

function makeCart(raw: any): CartSummarySnapshot {
  const rawItems = Array.isArray(raw?.items) ? raw.items : [];
  const items = rawItems.map((item: any, index: number) => {
    const name = item.productName || item.product_name || (index === 0 ? 'Crispy Chicken Meal' : 'Coke Zero');
    const quantity = Number(item.quantity || 1);
    const unitPriceUsd = Number(item.unitPriceUsd ?? item.unit_price ?? (name.toLowerCase().includes('coke') ? 1.25 : 8.5));
    return {
      productName: name,
      merchantName: item.merchantName || 'Chicken House',
      quantity,
      unitPriceUsd,
      totalPriceUsd: Number(item.totalPriceUsd ?? item.line_total ?? unitPriceUsd * quantity),
      variant: item.variant,
      notes: item.notes || item.customer_notes,
    };
  });
  const itemsCount = Number(raw?.itemsCount ?? items.reduce((sum: number, item: any) => sum + item.quantity, 0));
  const subtotalUsd = Number(raw?.subtotalUsd ?? raw?.subtotal ?? items.reduce((sum: number, item: any) => sum + item.totalPriceUsd, 0));
  const deliveryFeeUsd = Number(raw?.deliveryFeeUsd ?? raw?.deliveryFee ?? 1.5);
  return {
    merchantName: raw?.merchantName || 'Chicken House',
    itemsCount,
    items,
    subtotalUsd,
    deliveryFeeUsd,
    totalUsd: Number(raw?.totalUsd ?? raw?.total ?? subtotalUsd + deliveryFeeUsd),
  };
}

export function createEvaluatorSandbox(record: any): EvaluatorSandbox {
  const source = record.state_before || {};
  const state = createInitialState(900000 + Number(record.turn_index || 1));
  state.stage = source.stage || 'IDLE';
  state.turnIndex = Number(source.turnIndex || record.turn_index || 0);
  state.cartSummary = makeCart(source.cartSummary || source.cart || null);
  state.awaitingConfirmation = Boolean(source.awaitingConfirmation ?? source.awaiting_confirmation);
  state.selectedAddress = source.selectedAddress || (source.selected_address ? {
    id: 1,
    label: source.selected_address,
    formatted: source.selected_address,
  } : null);
  state.checkoutFingerprint = source.checkoutFingerprint || source.checkout_fingerprint || null;
  state.activeBudget = source.activeBudget || null;
  state.pendingClarification = source.pendingClarification || null;
  state.pendingMerchantSwitch = source.pendingMerchantSwitch || null;
  state.lastPresentedOptions = (source.lastPresentedOptions || []).map((item: any, index: number) => ({
    ...fixtureOptions(item.productName || 'crispy')[0],
    ...item,
    merchantProductId: item.merchantProductId || 101 + index,
    productName: item.productName || item.product_name || 'Crispy Chicken Meal',
  }));

  // mt_007 intentionally carries a compact state snapshot. The sandbox
  // supplies a deterministic saved address and checkout revision so the live
  // model is evaluated against the same real state-machine prerequisites.
  if (state.stage === 'AWAITING_CONFIRMATION' && state.awaitingConfirmation) {
    state.selectedAddress ||= { id: 1, label: 'Home', formatted: 'Home' };
    state.checkoutFingerprint ||= createHash('sha256').update('sandbox-checkout').digest('hex');
    if (state.cartSummary.itemsCount === 0) {
      state.cartSummary = makeCart({
        items: [
          { productName: 'Crispy Chicken Meal', quantity: 2, unitPriceUsd: 8.5 },
          { productName: 'Coke Zero', quantity: 1, unitPriceUsd: 1.25, variant: 'Large' },
        ],
      });
    }
  }

  return { state, ordersCreated: 0, nextOrderId: 5000 };
}

function cartForState(state: AIConversationState): CartSummarySnapshot {
  if (state.cartSummary && state.cartSummary.itemsCount > 0) return state.cartSummary;
  return makeCart({ items: [] });
}

function setCart(state: AIConversationState, cart: CartSummarySnapshot): void {
  state.cartSummary = cart;
}

export function executeEvaluatorTool(
  sandbox: EvaluatorSandbox,
  toolName: string,
  rawArgs: Record<string, any>,
  customerMessage: string,
  mutationCount: number
): EvaluatorToolExecution {
  const state = sandbox.state;
  const schema = (ToolArgumentSchemas as any)[toolName];
  if (!schema) return { success: false, result: { success: false, error: 'TOOL_NOT_FOUND' }, errorCode: 'TOOL_NOT_FOUND', stateChanged: false };

  const args = { ...(rawArgs || {}) };
  if ((toolName === 'confirm_and_create_order' || toolName === 'switch_merchant_confirm') && !args.confirmation_phrase) {
    args.confirmation_phrase = customerMessage;
  }
  const parsed = schema.safeParse(args);
  if (!parsed.success) {
    return { success: false, result: { success: false, error: parsed.error.message }, error: parsed.error.message, errorCode: 'INVALID_TOOL_ARGUMENTS', stateChanged: false };
  }
  const validated = parsed.data as any;
  if (isMutating(toolName) && mutationCount >= 1) {
    return { success: false, result: { success: false, error: 'MUTATION_LIMIT_EXCEEDED' }, errorCode: 'MUTATION_LIMIT_EXCEEDED', stateChanged: false };
  }

  switch (toolName) {
    case 'search_catalog': {
      const results = fixtureOptions(validated.query);
      state.lastPresentedOptions = results;
      state.stage = 'SELECTING_OPTION';
      return { success: true, result: { count: results.length, results }, stateChanged: true };
    }
    case 'compare_supermarket_basket':
      state.stage = 'SELECTING_OPTION';
      return { success: true, result: [{ merchantId: 3, merchantName: 'Fresh Market', isComplete: true, completeItemsCount: validated.items.length, totalRequestedCount: validated.items.length, itemsTotal: 10, deliveryFee: 1.5, finalTotal: 11.5, matchedItems: validated.items, missingItems: [] }], stateChanged: true };
    case 'get_active_cart':
      return { success: true, result: cartForState(state), stateChanged: false };
    case 'add_to_cart': {
      const target = validated.option_index
        ? state.lastPresentedOptions[validated.option_index - 1]
        : validated.product_name_query
          ? fixtureOptions(validated.product_name_query)[0]
          : state.lastPresentedOptions.find((item) => item.merchantProductId === validated.merchant_product_id);
      if (!target) return { success: false, result: { success: false, error: 'PRODUCT_NOT_FOUND' }, errorCode: 'PRODUCT_NOT_FOUND', stateChanged: false };
      const existing = cartForState(state);
      const item = { productName: target.productName, merchantName: target.merchantName, quantity: validated.quantity || 1, unitPriceUsd: target.basePrice, totalPriceUsd: target.basePrice * (validated.quantity || 1), notes: validated.customer_notes, variant: validated.variant_name };
      setCart(state, makeCart({ merchantName: target.merchantName, items: [...existing.items, item] }));
      state.stage = 'EDITING_CART';
      return { success: true, result: { action: 'ADDED', product: target.productName, cart: state.cartSummary }, stateChanged: true };
    }
    case 'update_cart_quantity': {
      const cart = cartForState(state);
      const item = cart.items.find((candidate) => candidate.productName.toLowerCase().includes(validated.target_item.toLowerCase()));
      if (!item) return { success: false, result: { success: false, error: 'CART_ITEM_NOT_FOUND' }, errorCode: 'CART_ITEM_NOT_FOUND', stateChanged: false };
      item.quantity = validated.new_quantity;
      item.totalPriceUsd = item.quantity * item.unitPriceUsd;
      setCart(state, makeCart({ merchantName: cart.merchantName, items: cart.items }));
      state.stage = 'EDITING_CART';
      return { success: true, result: { action: 'QUANTITY_UPDATED', cart: state.cartSummary }, stateChanged: true };
    }
    case 'update_cart_variant': {
      const cart = cartForState(state);
      const item = cart.items.find((candidate) => candidate.productName.toLowerCase().includes(validated.target_item.toLowerCase()));
      if (!item) return { success: false, result: { success: false, error: 'CART_ITEM_NOT_FOUND' }, errorCode: 'CART_ITEM_NOT_FOUND', stateChanged: false };
      item.variant = validated.variant_name;
      setCart(state, makeCart({ merchantName: cart.merchantName, items: cart.items }));
      state.stage = 'EDITING_CART';
      return { success: true, result: { action: 'VARIANT_UPDATED', cart: state.cartSummary }, stateChanged: true };
    }
    case 'update_cart_notes': {
      const cart = cartForState(state);
      const item = cart.items.find((candidate) => candidate.productName.toLowerCase().includes(validated.target_item.toLowerCase()));
      if (!item) return { success: false, result: { success: false, error: 'CART_ITEM_NOT_FOUND' }, errorCode: 'CART_ITEM_NOT_FOUND', stateChanged: false };
      item.notes = validated.notes;
      setCart(state, makeCart({ merchantName: cart.merchantName, items: cart.items }));
      return { success: true, result: { action: 'NOTES_UPDATED', cart: state.cartSummary }, stateChanged: true };
    }
    case 'remove_cart_item': {
      const cart = cartForState(state);
      const index = cart.items.findIndex((candidate) => candidate.productName.toLowerCase().includes(validated.target_item.toLowerCase()));
      if (index < 0) return { success: false, result: { success: false, error: 'CART_ITEM_NOT_FOUND' }, errorCode: 'CART_ITEM_NOT_FOUND', stateChanged: false };
      cart.items.splice(index, 1);
      setCart(state, makeCart({ merchantName: cart.merchantName, items: cart.items }));
      return { success: true, result: { action: 'ITEM_REMOVED', cart: state.cartSummary }, stateChanged: true };
    }
    case 'clear_cart':
      if (validated.confirmation !== true) return { success: false, result: { success: false, error: 'EXPLICIT_CART_CLEAR_CONFIRMATION_REQUIRED' }, errorCode: 'EXPLICIT_CART_CLEAR_CONFIRMATION_REQUIRED', stateChanged: false };
      setCart(state, makeCart({ items: [] }));
      state.selectedMerchant = null;
      state.stage = 'IDLE';
      return { success: true, result: { action: 'CART_CLEARED' }, stateChanged: true };
    case 'list_saved_addresses':
    case 'get_customer_addresses':
      return { success: true, result: { addresses: [{ label: 'Home', formatted_address: 'Home, Saida' }, { label: 'Work', formatted_address: 'Saida Central' }] }, stateChanged: false };
    case 'select_delivery_address':
      if (!/home|bet|work|office/i.test(validated.address_label)) return { success: false, result: { success: false, error: 'ADDRESS_NOT_FOUND' }, errorCode: 'ADDRESS_NOT_FOUND', stateChanged: false };
      state.selectedAddress = { id: /work|office/i.test(validated.address_label) ? 2 : 1, label: /work|office/i.test(validated.address_label) ? 'Work' : 'Home', formatted: validated.address_label };
      state.awaitingConfirmation = true;
      state.stage = 'AWAITING_CONFIRMATION';
      state.checkoutFingerprint = createHash('sha256').update(JSON.stringify(state.cartSummary)).digest('hex');
      return { success: true, result: { selected_address: state.selectedAddress.label, ready_for_confirmation: true }, stateChanged: true };
    case 'confirm_and_create_order': {
      const phrase = validated.confirmation_phrase || customerMessage;
      if (!isExplicitConfirmation(phrase) || isNegatedConfirmation(phrase) || isHistoricalOrQuestionConfirmation(phrase)) return { success: false, result: { success: false, error: 'EXPLICIT_CONFIRMATION_REQUIRED' }, errorCode: 'EXPLICIT_CONFIRMATION_REQUIRED', stateChanged: false };
      if (sandbox.ordersCreated > 0) return { success: true, result: { action: 'IDEMPOTENT_CONFIRMATION', order_id: sandbox.nextOrderId - 1 }, stateChanged: false };
      if (state.stage !== 'AWAITING_CONFIRMATION' || !state.awaitingConfirmation || !state.selectedAddress || !state.checkoutFingerprint || cartForState(state).itemsCount === 0) return { success: false, result: { success: false, error: 'FINAL_SUMMARY_CONFIRMATION_REQUIRED' }, errorCode: 'FINAL_SUMMARY_CONFIRMATION_REQUIRED', stateChanged: false };
      const order = { id: sandbox.nextOrderId++, order_number: 'ORD-SANDBOX-001', status: 'CONFIRMED', total: cartForState(state).totalUsd };
      sandbox.ordersCreated++;
      state.activeOrderSummary = { orderId: order.id, orderNumber: order.order_number, status: order.status, totalUsd: order.total, merchantName: cartForState(state).merchantName || '', createdAt: new Date(0).toISOString() };
      state.stage = 'ORDER_PLACED';
      state.awaitingConfirmation = false;
      return { success: true, result: { action: 'ORDER_CONFIRMED', order_id: order.id, order_number: order.order_number, status: order.status, total: `$${order.total.toFixed(2)}` }, stateChanged: true, orderCreated: order };
    }
    case 'get_order_status':
      return { success: true, result: state.activeOrderSummary || { status: 'NO_ACTIVE_ORDER' }, stateChanged: false };
    case 'request_human_support':
      state.stage = 'HUMAN_SUPPORT';
      return { success: true, result: { action: 'HUMAN_SUPPORT_REQUESTED' }, stateChanged: true };
    case 'switch_merchant_confirm':
      if (!validated.confirm_switch || !isExplicitConfirmation(validated.confirmation_phrase || customerMessage)) return { success: false, result: { success: false, error: 'EXPLICIT_SWITCH_CONFIRMATION_REQUIRED' }, errorCode: 'EXPLICIT_SWITCH_CONFIRMATION_REQUIRED', stateChanged: false };
      state.pendingMerchantSwitch = null;
      state.selectedMerchant = { id: 2, name: 'Snack Abou Afif', branchId: 22 };
      setCart(state, makeCart({ merchantName: 'Snack Abou Afif', items: [] }));
      state.stage = 'EDITING_CART';
      return { success: true, result: { action: 'MERCHANT_SWITCHED' }, stateChanged: true };
    case 'switch_merchant_reject':
      state.pendingMerchantSwitch = null;
      state.stage = 'EDITING_CART';
      return { success: true, result: { action: 'MERCHANT_SWITCH_REJECTED' }, stateChanged: true };
    default:
      return { success: false, result: { success: false, error: 'UNSUPPORTED_TOOL' }, errorCode: 'UNSUPPORTED_TOOL', stateChanged: false };
  }
}

function isMutating(toolName: string): boolean {
  return ['add_to_cart', 'update_cart_quantity', 'update_cart_variant', 'update_cart_notes', 'remove_cart_item', 'clear_cart', 'select_delivery_address', 'confirm_and_create_order', 'switch_merchant_confirm'].includes(toolName);
}
