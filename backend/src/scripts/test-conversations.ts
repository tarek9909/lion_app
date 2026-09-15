import { resetDemo } from './reset-demo.js';
import { aiService } from '../modules/ai/ai.service.js';
import { aiToolsExecutor } from '../modules/ai/tools/ai-tools.executor.js';
import { customerService } from '../modules/customers/customer.service.js';
import { cartService } from '../modules/carts/cart.service.js';
import { createInitialState, saveConversationState } from '../modules/ai/state/ai-state.types.js';
import { persistInboundMessage } from '../modules/conversations/conversation.persistence.js';
import { query } from '../database/db.js';
import { config } from '../config/env.js';
import { geminiService } from '../modules/ai/gemini.service.js';
import { shadowCanaryRouter } from '../modules/ai/routing/shadow-canary.service.js';
import { hasForbiddenCustomerPresentation } from '../modules/ai/customer-output.js';

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
  geminiService.setFetchFn(async () => new Response(JSON.stringify({ candidates: [{ content: { role: 'model', parts: [{ text: 'I did not understand that. Please tell me what you would like to order.' }] } }] }), { status: 200 }));
  try {
    const first = await conversation('J');
    const unclear = await aiService.processCustomerMessage(PHONE, 'J', 'text', { conversationId: first.conversationId });
    assert(unclear.intent === 'CLARIFICATION_REQUIRED' && !hasForbiddenCustomerPresentation(unclear.replyText), 'unclear input is plain-text clarification without mutation');

    const customer = await customerService.findByPhone(PHONE);
    const greetingState = createInitialState(customer!.id, 'en', first.conversationId);
    greetingState.stage = 'SELECTING_ADDRESS'; greetingState.nextRequiredAction = 'SELECT_ADDRESS';
    greetingState.lastAssistantQuestion = 'Please send your delivery address.'; greetingState.expectedEntity = 'delivery_address';
    await saveConversationState(customer!.id, greetingState, first.conversationId);
    const greeting = await aiService.processCustomerMessage(PHONE, 'Hello', 'text', { conversationId: first.conversationId });
    assert(/delivery address/i.test(greeting.replyText) && !/welcome/i.test(greeting.replyText), 'greeting retains active task');

    const cart = await cartService.getOrCreateActiveCart(customer!.id);
    const products = await query<any[]>(`SELECT mp.id FROM merchant_products mp JOIN products p ON p.id=mp.product_id WHERE p.canonical_name LIKE '%Crispy%' LIMIT 1`);
    await cartService.addItem(cart.id, Number(products[0].id), 1);
    greetingState.stage = 'SELECTING_ADDRESS'; await saveConversationState(customer!.id, greetingState, first.conversationId);
    const address = await aiService.processCustomerMessage(PHONE, 'Saida, Abra, near the municipal building, floor 2', 'text', { conversationId: first.conversationId });
    assert(String(address.intent) === 'CAPTURE_DELIVERY_ADDRESS' && !/catalog/i.test(address.replyText), 'detailed address reaches address draft flow rather than catalog search');

    const missingHomeState = createInitialState(customer!.id, 'en', first.conversationId); missingHomeState.stage = 'SELECTING_ADDRESS';
    const home = await aiToolsExecutor.executeTool('select_delivery_address', { address_label: 'Home' }, customer!.id, missingHomeState, 0, undefined, 'Home');
    assert(home.errorCode === 'ADDRESS_NOT_FOUND', 'missing Home never defaults to another address');

    const trackingState = createInitialState(customer!.id, 'en', first.conversationId);
    await saveConversationState(customer!.id, trackingState, first.conversationId);
    const noOrder = await aiService.processCustomerMessage(PHONE, 'Where is my order?', 'text', { conversationId: first.conversationId });
    assert(noOrder.intent === 'ORDER_STATUS' && /do not have an active order/i.test(noOrder.replyText) && !/catalog/i.test(noOrder.replyText), `order tracking reports no active order without catalog miss: ${noOrder.replyText}`);

    const productState = createInitialState(customer!.id, 'arabizi', first.conversationId); productState.pendingProductCategory = 'beverage';
    const drink = await aiToolsExecutor.executeTool('resolve_product_name', { product_name: 'Kinza', category: 'beverage' }, customer!.id, productState, 0);
    assert(drink.success && drink.result.requested_name === 'Kinza' && drink.result.matched_product == null, 'drink resolution preserves request without Coke substitution');

    const burgerRows = await query<any[]>(`SELECT mp.id FROM merchant_products mp JOIN merchant_branches mb ON mb.id=mp.merchant_branch_id JOIN merchants m ON m.id=mb.merchant_id WHERE m.name = 'Burger Spot' LIMIT 1`);
    const batchState = createInitialState(customer!.id, 'en', first.conversationId);
    const batchPlan = await aiToolsExecutor.executeTool('create_multi_order_plan', { items: [{ merchant_product_id: Number(burgerRows[0].id), quantity: 1 }] }, customer!.id, batchState, 0, undefined, 'order from both places');
    assert(batchPlan.success && batchPlan.result.children.length === 2, 'two merchants create two independent reviewable batch children');
    const addressSet = await aiToolsExecutor.executeTool('set_batch_delivery_address', { address_label: 'Delivery address' }, customer!.id, batchState, 0, undefined, 'same address');
    const batchConfirm = await aiToolsExecutor.executeTool('confirm_order_batch', { confirmation_phrase: 'confirm both', selection: 'both' }, customer!.id, batchState, 0, undefined, 'confirm both');
    assert(addressSet.success && batchConfirm.success && batchConfirm.result.children.every((child: any) => child.status === 'PLACED'), 'batch requires address and explicit confirm both before placing separate orders');
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
