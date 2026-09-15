import { query } from '../database/db.js';
import { redis } from '../database/redis.js';
import { config } from '../config/env.js';
import { geminiService } from '../modules/ai/gemini.service.js';
import { aiToolsExecutor } from '../modules/ai/tools/ai-tools.executor.js';
import { shadowCanaryRouter } from '../modules/ai/routing/shadow-canary.service.js';
import { customerService } from '../modules/customers/customer.service.js';
import { cartService } from '../modules/carts/cart.service.js';
import { AIProcessResult } from '../modules/ai/ai.types.js';

function assert(condition: boolean, message: string, extra?: any) {
  if (!condition) {
    console.error(`❌ Assertion failed: ${message}`, extra !== undefined ? extra : '');
    process.exit(1);
  }
  console.log(`  ✅ ${message} [PASS]`);
}

async function getTableRowCount(table: string): Promise<number> {
  const rows: any = await query(`SELECT COUNT(*) as count FROM \`${table}\``);
  return Number(rows[0].count);
}

async function runShadowImmutabilityTests() {
  console.log('\n🧪 Starting Area B: Shadow Mode Zero-Mutation Boundary Regression Tests...');

  // --- PART 1: Unregistered Customer Phone in Shadow Mode ---
  console.log('\n--- Part 1: Verify Zero Customer Creation for New Numbers in Shadow Mode ---');
  geminiService.setFetchFn(async () => {
    return new Response(
      JSON.stringify({
        candidates: [
          {
            content: {
              parts: [{ text: 'Welcome to Lion Delivery! What would you like to order?' }],
            },
          },
        ],
        usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 20 },
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  });

  const initialCustomersCount = await getTableRowCount('customers');
  const unregPhone = `+96179${Math.floor(100000 + Math.random() * 900000)}`;

  // Process message in shadow mode with unreg phone
  const shadowUnregResult = await geminiService.processCustomerMessage(
    unregPhone,
    'Hello I want to see your menu',
    'text',
    { shadowMode: true, requestId: `req-shadow-unreg-${Date.now()}` }
  );

  assert(shadowUnregResult.shadowExecution === true, 'Shadow flag returned true for unregistered customer message');

  const afterUnregCustomersCount = await getTableRowCount('customers');
  assert(
    afterUnregCustomersCount === initialCustomersCount,
    `Customer count remained strictly unchanged (${initialCustomersCount}) in shadow mode`
  );

  const [unregCheck]: any = await query(`SELECT id FROM customers WHERE whatsapp_number = ?`, [unregPhone]);
  assert(unregCheck === undefined, 'No customer row created for unregistered number in shadow mode');

  geminiService.resetFetchFn();

  // --- PART 2: Zero Database & Redis Mutations for Mutating Tool Calls in Shadow Mode ---
  console.log('\n--- Part 2: Verify Strict Immutability of Carts, Orders, and Redis During Shadow Tool Calls ---');
  // Use or create a known customer for baseline
  const testPhone = '+96170999111';
  const customer = await customerService.findOrCreateByPhone(testPhone);
  const cart = await cartService.getOrCreateActiveCart(customer.id);

  // Take baseline snapshot of all critical tables
  const baseline = {
    customersCount: await getTableRowCount('customers'),
    cartsCount: await getTableRowCount('carts'),
    cartItemsCount: await getTableRowCount('cart_items'),
    ordersCount: await getTableRowCount('orders'),
    orderItemsCount: await getTableRowCount('order_items'),
  };

  const baselineCartRows: any = await query(`SELECT * FROM cart_items WHERE cart_id = ? ORDER BY id ASC`, [cart.id]);
  const baselineRedisState = await redis.get(`ai:state:${customer.id}`);
  const baselineRedisHistory = await redis.get(`ai:history:${customer.id}`);

  // 1. Shadow add_to_cart
  const state: any = {
    customerId: customer.id,
    stage: 'SEARCHING',
    lastPresentedOptions: [
      {
        merchantProductId: 1,
        productName: 'Classic Burger',
        price: 8.5,
        merchantId: 1,
        merchantName: 'Burger House',
        merchantBranchId: 1,
      },
    ],
  };

  const addResult = await aiToolsExecutor.executeTool(
    'add_to_cart',
    { option_index: 1, quantity: 2 },
    customer.id,
    state,
    0,
    { shadowMode: true },
    'add 2 classic burgers'
  );
  assert(addResult.success === true, 'Shadow add_to_cart executed successfully in simulation');

  // 2. Shadow update_cart_quantity
  const updateQtyResult = await aiToolsExecutor.executeTool(
    'update_cart_quantity',
    { target_item: 'Classic Burger', new_quantity: 4 },
    customer.id,
    state,
    0,
    { shadowMode: true },
    'change to 4'
  );
  assert(updateQtyResult.result?.shadowExecution === true, 'Shadow update_cart_quantity returned shadowExecution flag');

  // 3. Shadow update_cart_variant
  const updateVarResult = await aiToolsExecutor.executeTool(
    'update_cart_variant',
    { target_item: 'Classic Burger', variant_name: 'Double Patty' },
    customer.id,
    state,
    0,
    { shadowMode: true },
    'make it double patty'
  );
  assert(updateVarResult.result?.shadowExecution === true, 'Shadow update_cart_variant returned shadowExecution flag');

  // 4. Shadow confirm_and_create_order
  state.awaitingConfirmation = true;
  state.selectedAddress = { id: 1, label: 'Home', formatted: 'Home' };
  const mockSummary = {
    merchantName: 'Burger House',
    itemsCount: 2,
    items: [{ productName: 'Classic Burger', quantity: 2, unitPriceUsd: 8.5, totalPriceUsd: 17.0 }],
    subtotalUsd: 17.0,
    deliveryFeeUsd: 1.5,
    totalUsd: 18.5,
  };
  state.cartSummary = mockSummary;
  state.checkoutFingerprint = (aiToolsExecutor as any).generateCheckoutFingerprint(mockSummary, state.selectedAddress);

  const confirmResult = await aiToolsExecutor.executeTool(
    'confirm_and_create_order',
    { confirmation_phrase: 'yes confirm' },
    customer.id,
    state,
    0,
    { shadowMode: true },
    'yes confirm'
  );
  assert(confirmResult.success === true, 'Shadow confirm_and_create_order succeeded in simulation');
  assert(confirmResult.result?.shadowExecution === true, 'Shadow order returned shadowExecution: true');
  assert(confirmResult.result?.simulated_order_number === 'LION-SHADOW-0001', 'Simulated order number returned');

  // 5. Shadow clear_cart (requires explicit confirmation: true per canonical schema)
  const clearResult = await aiToolsExecutor.executeTool(
    'clear_cart',
    { confirmation: true },
    customer.id,
    state,
    0,
    { shadowMode: true },
    'clear cart'
  );
  if (!clearResult.success) {
    console.error('clearResult failed with:', clearResult);
  }
  assert(clearResult.success === true, 'Shadow clear_cart succeeded in simulation');

  // Assert all database tables and rows are STRICTLY UNCHANGED
  const afterCustomersCount = await getTableRowCount('customers');
  const afterCartsCount = await getTableRowCount('carts');
  const afterCartItemsCount = await getTableRowCount('cart_items');
  const afterOrdersCount = await getTableRowCount('orders');
  const afterOrderItemsCount = await getTableRowCount('order_items');

  assert(afterCustomersCount === baseline.customersCount, 'customers table row count unchanged');
  assert(afterCartsCount === baseline.cartsCount, 'carts table row count unchanged');
  assert(afterCartItemsCount === baseline.cartItemsCount, 'cart_items table row count unchanged');
  assert(afterOrdersCount === baseline.ordersCount, 'orders table row count unchanged (zero shadow orders created)');
  assert(afterOrderItemsCount === baseline.orderItemsCount, 'order_items table row count unchanged');

  const currentCartRows: any = await query(`SELECT * FROM cart_items WHERE cart_id = ? ORDER BY id ASC`, [cart.id]);
  assert(
    JSON.stringify(currentCartRows) === JSON.stringify(baselineCartRows),
    'Cart items rows for customer remain byte-for-byte identical before and after shadow execution'
  );

  const currentRedisState = await redis.get(`ai:state:${customer.id}`);
  const currentRedisHistory = await redis.get(`ai:history:${customer.id}`);
  assert(currentRedisState === baselineRedisState, 'Redis ai:state unchanged by shadow tool calls');
  assert(currentRedisHistory === baselineRedisHistory, 'Redis ai:history unchanged by shadow tool calls');

  // --- PART 3: Shadow-vs-Stable Disagreement Logging ---
  console.log('\n--- Part 3: Verify Shadow Disagreement Detection and Telemetry Persistence ---');
  const testRequestId = `req-shadow-disagree-${Date.now()}`;

  // Configure test credentials and router to SHADOW mode
  const origKey = config.ai.geminiApiKey;
  config.ai.geminiApiKey = 'test-gemini-credential-key';

  shadowCanaryRouter.configure({
    routingMode: 'SHADOW',
    stableProvider: 'smart_nlu',
    candidateProvider: 'gemini',
  });

  // Mock stable processor producing intent A
  const mockStableProcessor = async (): Promise<AIProcessResult> => ({
    replyText: 'Showing 3 burger restaurants nearby.',
    intent: 'SEARCH_RESULTS',
    confidence: 0.95,
    actionTaken: 'SEARCH_CATALOG',
  });

  // Temporarily mock geminiService.processCustomerMessage to produce intent B
  const origProcess = geminiService.processCustomerMessage;
  geminiService.processCustomerMessage = async (phone: string, text: string, mediaType?: any, options?: any) => {
    return {
      replyText: 'Your order #104 is out for delivery! 🛵',
      intent: 'ORDER_STATUS',
      confidence: 0.98,
      actionTaken: 'ORDER_TRACKING',
      shadowExecution: Boolean(options?.shadowMode),
    };
  };

  try {
    const routeRes = await shadowCanaryRouter.routeCustomerMessage(
      testPhone,
      'Wein el order?',
      'text',
      mockStableProcessor,
      { requestId: testRequestId }
    );

    assert(routeRes.executionMode === 'LIVE', 'Customer received response from LIVE stable processor');
    assert(routeRes.shadowRan === true, 'Shadow candidate was triggered asynchronously');
    assert(routeRes.result.intent === 'SEARCH_RESULTS', 'Live result is from stable processor');

    // Allow async shadow candidate execution and DB write
    await new Promise((resolve) => setTimeout(resolve, 300));

    // Query MySQL ai_interactions for the exact requestId
    const rows: any = await query(
      `SELECT public_id, model_name, interaction_type, input_summary, output_summary, structured_output
       FROM ai_interactions
       WHERE structured_output LIKE ?
       ORDER BY id DESC LIMIT 1`,
      [`%${testRequestId}%`]
    );

    assert(rows.length > 0, `Disagreement row found with requestId ${testRequestId}`);
    const disagreementRow = rows[0];
    assert(
      disagreementRow.interaction_type === 'SHADOW_DISAGREEMENT',
      `Interaction type recorded as SHADOW_DISAGREEMENT (got: ${disagreementRow.interaction_type})`
    );
    assert(
      disagreementRow.output_summary.includes('Stable: SEARCH_RESULTS') &&
        disagreementRow.output_summary.includes('Candidate: ORDER_STATUS'),
      'Disagreement telemetry recorded both stable and candidate intents'
    );
  } finally {
    // Restore original method and config
    geminiService.processCustomerMessage = origProcess;
    config.ai.geminiApiKey = origKey;
  }

  console.log('\n🏁 Area B: Shadow Mode Immutability Tests: All Assertions Passed!\n');
}

runShadowImmutabilityTests()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Fatal test error:', err);
    process.exit(1);
  });
