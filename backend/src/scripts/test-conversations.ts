import { resetDemo } from './reset-demo.js';
import { aiService } from '../modules/ai/ai.service.js';
import { aiToolsExecutor } from '../modules/ai/tools/ai-tools.executor.js';
import { customerService } from '../modules/customers/customer.service.js';
import { cartService } from '../modules/carts/cart.service.js';
import { orderService } from '../modules/orders/order.service.js';
import { createInitialState, saveConversationState } from '../modules/ai/state/ai-state.types.js';
import { persistInboundMessage } from '../modules/conversations/conversation.persistence.js';
import { query } from '../database/db.js';
import { config } from '../config/env.js';
import { geminiService } from '../modules/ai/gemini.service.js';
import { shadowCanaryRouter } from '../modules/ai/routing/shadow-canary.service.js';
import { hasForbiddenCustomerPresentation, sanitizeCustomerOutput } from '../modules/ai/customer-output.js';

const PHONE = '96170999111';
function assert(value: boolean, label: string): void { if (!value) throw new Error(label); console.log(`  PASS ${label}`); }

async function conversation(text: string) {
  return persistInboundMessage(PHONE, text, { providerMessageId: `p0-${Date.now()}-${Math.random()}` });
}

export async function runConversationTestPack(): Promise<boolean> {
  console.log('Starting Gemini customer P0/P1 acceptance suite...');
  const previousKey = config.ai.geminiApiKey;
  const previousProvider = config.ai.provider;
  const previousRouterConfig = shadowCanaryRouter.getConfig();
  const origNodeEnv = process.env.NODE_ENV;
  const origConfigNodeEnv = config.nodeEnv;
  process.env.NODE_ENV = 'test';
  config.nodeEnv = 'test';
  config.ai.geminiApiKey = 'acceptance_fixture_key';
  config.ai.provider = 'gemini';
  shadowCanaryRouter.configure({ stableProvider: 'gemini', routingMode: 'STABLE_ONLY', canaryPercentage: 0 });
  await resetDemo();
  geminiService.setFetchFn(async (_url, init) => {
    const payload = JSON.parse(String(init?.body || '{}'));
    const lastContent = payload.contents?.[payload.contents.length - 1];
    const functionResponse = lastContent?.parts?.find((part: any) => part.functionResponse)?.functionResponse;
    if (functionResponse) {
      const textByTool: Record<string, string> = {
        rename_delivery_address: 'Tamam, sammayt l 3enwen Home. Rodd confirm iza badak t2akked l talab.',
        list_category_options: 'Mawjoud 3end Chicken House hal mashroubet:\n- Regular Coca-Cola: $1.50\n- Coke Zero: $1.50\n\nAyya wahad bte7eb tzid 3al cart?',
        create_multi_order_plan: 'Fini e3mel talabayn mfassalin. Baddak yrou7o la nafs l 3enwen? Ba3d l molakhas l nehe2e, rodd confirm both.',
      };
      return new Response(JSON.stringify({ candidates: [{ content: { role: 'model', parts: [{ text: textByTool[functionResponse.name] || 'Tamam.' }] } }] }), { status: 200 });
    }
    const userText = [...(payload.contents || [])].reverse()
      .flatMap((content: any) => content.role === 'user' ? content.parts || [] : [])
      .map((part: any) => part.text || '')
      .find((value: string) => value);
    const functionCall = userText.includes('Ghayyer esm')
      ? { name: 'rename_delivery_address', args: { address_label: 'Home' } }
      : userText.includes('Bde eshrab')
        ? { name: 'list_category_options', args: { category: 'beverage', scope: 'current_cart_merchant' } }
        : userText.includes('Fene etlub ltnen')
          ? { name: 'create_multi_order_plan', args: { selection_source: 'last_presented_options', selected_option_indexes: [1, 2] } }
          : null;
    return new Response(JSON.stringify({ candidates: [{ content: { role: 'model', parts: functionCall ? [{ functionCall }] : [{ text: 'I did not understand that. Please tell me what you would like to order.' }] } }] }), { status: 200 });
  });
  try {
    const first = await conversation('J');
    const unclear = await aiService.processCustomerMessage(PHONE, 'J', 'text', { conversationId: first.conversationId });
    assert(unclear.intent === 'CLARIFICATION_REQUIRED' && !hasForbiddenCustomerPresentation(unclear.replyText), 'unclear input is plain-text clarification without mutation');

    const repairedEncoding = sanitizeCustomerOutput('Iâ€™m ready. ØªÙ… Ø§Ù„ØªØ£ÙƒÙŠØ¯.');
    assert(repairedEncoding === 'I’m ready. تم التأكيد.', 'customer output repairs legacy text encoding before WhatsApp delivery');

    const customer = await customerService.findByPhone(PHONE);
    const greetingState = createInitialState(customer!.id, 'en', first.conversationId);
    greetingState.stage = 'SELECTING_ADDRESS'; greetingState.nextRequiredAction = 'SELECT_ADDRESS';
    greetingState.lastAssistantQuestion = 'Please send your delivery address.'; greetingState.expectedEntity = 'delivery_address';
    await saveConversationState(customer!.id, greetingState, first.conversationId);
    const greeting = await aiService.processCustomerMessage(PHONE, 'Hello', 'text', { conversationId: first.conversationId });
    assert(/delivery address/i.test(greeting.replyText) && !/welcome/i.test(greeting.replyText), 'greeting retains active task');

    const cart = await cartService.getOrCreateActiveCart(customer!.id);
    const products = await query<any[]>(`SELECT mp.id, mb.merchant_id FROM merchant_products mp JOIN products p ON p.id=mp.product_id JOIN merchant_branches mb ON mb.id=mp.merchant_branch_id WHERE p.canonical_name LIKE '%Crispy%' LIMIT 1`);
    await cartService.addItem(cart.id, Number(products[0].id), 1);
    greetingState.stage = 'SELECTING_ADDRESS'; await saveConversationState(customer!.id, greetingState, first.conversationId);
    const address = await aiService.processCustomerMessage(PHONE, 'Saida, Abra, near the municipal building, floor 2', 'text', { conversationId: first.conversationId });
    assert(String(address.intent) === 'CAPTURE_DELIVERY_ADDRESS' && !/catalog/i.test(address.replyText), 'detailed address reaches address draft flow rather than catalog search');

    const renamedAddress = await aiService.processCustomerMessage(PHONE, 'Ghayyer esm l3enwen, khalle esmu Home', 'text', { conversationId: first.conversationId });
    const homeRows = await query<any[]>(`SELECT label, formatted_address FROM customer_addresses WHERE customer_id = ? AND label = 'Home' ORDER BY id DESC LIMIT 1`, [customer!.id]);
    assert(
      renamedAddress.intent === 'ADDRESS_SELECTED' && homeRows.length === 1 &&
      /Saida, Abra, near the municipal building, floor 2/i.test(String(homeRows[0].formatted_address)),
      'customer can name a captured full delivery address Home without losing its directions',
    );

    const missingHomeState = createInitialState(customer!.id, 'en', first.conversationId); missingHomeState.stage = 'SELECTING_ADDRESS';
    const missingWork = await aiToolsExecutor.executeTool('select_delivery_address', { address_label: 'Work' }, customer!.id, missingHomeState, 0, undefined, 'Work');
    assert(missingWork.errorCode === 'ADDRESS_NOT_FOUND', 'missing saved address never defaults to another address');

    const trackingState = createInitialState(customer!.id, 'en', first.conversationId);
    await saveConversationState(customer!.id, trackingState, first.conversationId);
    const noOrder = await aiService.processCustomerMessage(PHONE, 'Where is my order?', 'text', { conversationId: first.conversationId });
    assert(noOrder.intent === 'ORDER_STATUS' && /do not have an active order/i.test(noOrder.replyText) && !/catalog/i.test(noOrder.replyText), `order tracking reports no active order without catalog miss: ${noOrder.replyText}`);

    const contextCart = await cartService.getOrCreateActiveCart(customer!.id);
    await cartService.clearCart(contextCart.id);
    await cartService.addItem(contextCart.id, Number(products[0].id), 1);
    const arabiziContextState = createInitialState(customer!.id, 'arabizi', first.conversationId);
    arabiziContextState.stage = 'EDITING_CART';
    await saveConversationState(customer!.id, arabiziContextState, first.conversationId);
    const directClear = await aiService.processCustomerMessage(PHONE, 'Fadde l cart', 'text', { conversationId: first.conversationId });
    const clearedCart = await cartService.getActiveCartReadOnly(customer!.id);
    assert(directClear.intent === 'CLEAR_CART' && /^Tamam, faddayt l cart/i.test(directClear.replyText) && clearedCart?.items.length === 0, 'Arabizi clear-cart request clears the cart and replies in Arabizi');

    await cartService.addItem(contextCart.id, Number(products[0].id), 1);
    await saveConversationState(customer!.id, arabiziContextState, first.conversationId);
    const newCart = await aiService.processCustomerMessage(PHONE, 'New cart', 'text', { conversationId: first.conversationId });
    const confirmedClear = await aiService.processCustomerMessage(PHONE, 'Yes', 'text', { conversationId: first.conversationId });
    const clearedAfterYes = await cartService.getActiveCartReadOnly(customer!.id);
    assert(
      /^Fi 3andak aghrad bel cart/i.test(newCart.replyText) && /^Tamam, faddayt l cart/i.test(confirmedClear.replyText) && clearedAfterYes?.items.length === 0,
      `new-cart confirmation retains Arabizi context and accepts yes (prompt=${newCart.replyText}; confirmation=${confirmedClear.replyText}; remaining=${clearedAfterYes?.items.length})`,
    );

    const productState = createInitialState(customer!.id, 'arabizi', first.conversationId); productState.pendingProductCategory = 'beverage';
    const drink = await aiToolsExecutor.executeTool('resolve_product_name', { product_name: 'Kinza', category: 'beverage' }, customer!.id, productState, 0);
    assert(drink.success && drink.result.requested_name === 'Kinza' && drink.result.matched_product == null, 'drink resolution preserves request without Coke substitution');

    await cartService.addItem(contextCart.id, Number(products[0].id), 1);
    const burgerRows = await query<any[]>(`SELECT mp.id, mb.merchant_id FROM merchant_products mp JOIN merchant_branches mb ON mb.id=mp.merchant_branch_id JOIN merchants m ON m.id=mb.merchant_id WHERE m.name = 'Burger Spot' LIMIT 1`);

    const drinkPhone = '96170999113';
    const drinkInbound = await persistInboundMessage(drinkPhone, 'Bde eshrab she m3a', { providerMessageId: `drink-${Date.now()}` });
    const drinkCustomer = await customerService.findByPhone(drinkPhone);
    const drinkCart = await cartService.getOrCreateActiveCart(drinkCustomer!.id);
    await cartService.addItem(drinkCart.id, Number(products[0].id), 1);
    const drinkState = createInitialState(drinkCustomer!.id, 'arabizi', drinkInbound.conversationId);
    drinkState.stage = 'EDITING_CART';
    await saveConversationState(drinkCustomer!.id, drinkState, drinkInbound.conversationId);
    const drinkReply = await aiService.processCustomerMessage(drinkPhone, 'Bde eshrab she m3a', 'text', { conversationId: drinkInbound.conversationId });
    assert(
      /Mawjoud 3end Chicken House hal mashroubet/i.test(drinkReply.replyText) && /Coke Zero/i.test(drinkReply.replyText),
      'Arabizi drink request shows verified drinks from the active merchant instead of a catalog miss',
    );

    const bothPhone = '96170999112';
    const bothInbound = await persistInboundMessage(bothPhone, 'Fene etlub ltnen?', { providerMessageId: `both-${Date.now()}` });
    const bothCustomer = await customerService.findByPhone(bothPhone);
    const bothState = createInitialState(bothCustomer!.id, 'arabizi', bothInbound.conversationId);
    bothState.lastPresentedOptions = [
      { merchantProductId: Number(products[0].id), merchantId: Number(products[0].merchant_id) },
      { merchantProductId: Number(burgerRows[0].id), merchantId: Number(burgerRows[0].merchant_id) },
    ] as any;
    await saveConversationState(bothCustomer!.id, bothState, bothInbound.conversationId);
    const bothReply = await aiService.processCustomerMessage(bothPhone, 'Fene etlub ltnen?', 'text', { conversationId: bothInbound.conversationId });
    const bothBatches = await query<any[]>(`SELECT id FROM order_batches WHERE customer_id = ?`, [bothCustomer!.id]);
    assert(
      bothReply.responseCategory === 'MULTI_ORDER_PLAN' && /talabayn mfassalin/i.test(bothReply.replyText) && bothBatches.length === 1,
      'explicit Arabizi request to order both presented merchants creates a safe order batch instead of failing',
    );

    const batchState = createInitialState(customer!.id, 'en', first.conversationId);
    const batchPlan = await aiToolsExecutor.executeTool('create_multi_order_plan', { items: [{ merchant_product_id: Number(burgerRows[0].id), quantity: 1 }] }, customer!.id, batchState, 0, undefined, 'order from both places');
    assert(batchPlan.success && batchPlan.result.children.length === 2, 'two merchants create two independent reviewable batch children');
    const addressSet = await aiToolsExecutor.executeTool('set_batch_delivery_address', { address_label: 'Home' }, customer!.id, batchState, 0, undefined, 'same address');
    const batchConfirm = await aiToolsExecutor.executeTool('confirm_order_batch', { confirmation_phrase: 'confirm both', selection: 'both' }, customer!.id, batchState, 0, undefined, 'confirm both');
    assert(addressSet.success && batchConfirm.success && batchConfirm.result.children.every((child: any) => child.status === 'PLACED'), 'batch requires address and explicit confirm both before placing separate orders');

    const arabiziPickup = (orderService as any).orderStatusNotification('PICKED_UP', {
      order_number: 'ORD-TEST-1', merchant_name: 'Chicken House', driver_name: 'Ahmad', driver_code: 'D-101', address_label: 'Home',
    }, 'arabizi');
    const arabicDelivered = (orderService as any).orderStatusNotification('DELIVERED', {
      order_number: 'ORD-TEST-1', merchant_name: 'Chicken House', address_label: 'Home',
    }, 'ar');
    assert(
      /Talabak ORD-TEST-1/.test(arabiziPickup) && /Home/.test(arabiziPickup) && !hasForbiddenCustomerPresentation(arabiziPickup) &&
      /وصل طلبك ORD-TEST-1/.test(arabicDelivered) && !hasForbiddenCustomerPresentation(arabicDelivered),
      'delivery updates preserve the saved label, customer language, and plain-text contract',
    );
    return true;
  } catch (error) { console.error(error); return false; }
  finally {
    geminiService.resetFetchFn();
    config.ai.geminiApiKey = previousKey;
    config.ai.provider = previousProvider;
    shadowCanaryRouter.configure(previousRouterConfig);
    process.env.NODE_ENV = origNodeEnv;
    config.nodeEnv = origConfigNodeEnv;
  }
}

if (process.argv[1]?.endsWith('test-conversations.ts')) runConversationTestPack().then(ok => process.exit(ok ? 0 : 1));
