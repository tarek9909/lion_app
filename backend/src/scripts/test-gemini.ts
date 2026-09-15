import { validateStartupConfig, config } from '../config/env.js';
import { geminiService } from '../modules/ai/gemini.service.js';
import { aiService } from '../modules/ai/ai.service.js';
import { resetDemo } from './reset-demo.js';
import { customerService } from '../modules/customers/customer.service.js';
import { cartService } from '../modules/carts/cart.service.js';
import { orderService } from '../modules/orders/order.service.js';
import { query } from '../database/db.js';
import { redis } from '../database/redis.js';
import { shadowCanaryRouter } from '../modules/ai/routing/shadow-canary.service.js';

export async function runGeminiIntegrationTests(): Promise<boolean> {
  console.log('\n🧪 Starting Gemini 3.8 Flash Integration Test Suite...');
  await resetDemo();

  let passed = 0;
  let failed = 0;

  const assert = (condition: boolean, name: string, detail?: any) => {
    if (condition) {
      console.log(`  ✅ ${name} [PASS]`);
      passed++;
    } else {
      console.error(`  ❌ ${name} [FAIL]`, detail || '');
      failed++;
    }
  };

  const TEST_PHONE = '96170123456';

  // -------------------------------------------------------------
  // Test 1: Startup Configuration & Fail-Fast Validation (Kickoff Req 1)
  // -------------------------------------------------------------
  console.log('\n▶ Sub-suite 1: Startup Configuration & Key Validation');

  // 1a: smart_nlu passes without Gemini credentials
  try {
    const res = validateStartupConfig({
      whatsapp: { mode: 'MOCK' },
      media: { mode: 'FIXTURE' },
      ai: { provider: 'smart_nlu', geminiApiKey: '' },
    });
    assert(res.aiValid === true, 'AI_PROVIDER=smart_nlu succeeds startup without Gemini credentials');
  } catch (err: any) {
    assert(false, 'AI_PROVIDER=smart_nlu threw unexpected error during startup', err.message);
  }

  // 1b: gemini mode fails fast when GEMINI_API_KEY is empty
  try {
    validateStartupConfig({
      whatsapp: { mode: 'MOCK' },
      media: { mode: 'FIXTURE' },
      ai: { provider: 'gemini', geminiApiKey: '' },
    });
    assert(false, 'AI_PROVIDER=gemini without key must fail startup');
  } catch (err: any) {
    assert(
      err.message.includes('AI_PROVIDER is set to gemini') && err.message.includes('GEMINI_API_KEY is missing'),
      'AI_PROVIDER=gemini fails fast at startup when key is empty'
    );
  }

  // 1c: gemini mode fails fast when GEMINI_API_KEY is placeholder
  try {
    validateStartupConfig({
      whatsapp: { mode: 'MOCK' },
      media: { mode: 'FIXTURE' },
      ai: { provider: 'gemini', geminiApiKey: 'demo_gemini_api_key_placeholder' },
    });
    assert(false, 'AI_PROVIDER=gemini with placeholder key must fail startup');
  } catch (err: any) {
    assert(
      err.message.includes('missing or placeholder'),
      'AI_PROVIDER=gemini fails fast at startup when key is placeholder'
    );
  }

  // 1d: gemini mode passes with valid key
  try {
    const res = validateStartupConfig({
      whatsapp: { mode: 'MOCK' },
      media: { mode: 'FIXTURE' },
      ai: { provider: 'gemini', geminiApiKey: 'mock_valid_test_key_for_gemini_38_flash' },
    });
    assert(res.aiValid === true, 'AI_PROVIDER=gemini passes startup with valid key');
  } catch (err: any) {
    assert(false, 'AI_PROVIDER=gemini threw unexpected error with valid key', err.message);
  }

  // -------------------------------------------------------------
  // Test 2: Provider Selection & No Silent Fallback (Kickoff Req 1, 2)
  // -------------------------------------------------------------
  console.log('\n▶ Sub-suite 2: Provider Selection & Fail-Closed Guard');

  const origProvider = config.ai.provider;
  const origKey = config.ai.geminiApiKey;
  const origModel = config.ai.geminiModel;
  const origRouting = shadowCanaryRouter.getConfig();

  try {
    // In gemini mode without key, must throw error, NOT silently call smart_nlu
    config.ai.provider = 'gemini';
    config.ai.geminiApiKey = '';
    shadowCanaryRouter.configure({ stableProvider: 'gemini', routingMode: 'STABLE_ONLY', canaryPercentage: 0 });
    try {
      await aiService.processCustomerMessage(TEST_PHONE, 'bade crispy chicken');
      assert(false, 'Gemini mode without key must throw, not return smart_nlu result');
    } catch (err: any) {
      assert(
        err.message.includes('GEMINI_API_KEY is not configured') || err.message.includes('placeholder'),
        'Gemini mode fails closed without silent fallback when key is missing'
      );
    }

    // In smart_nlu mode, processes customer message normally
    config.ai.provider = 'smart_nlu';
    shadowCanaryRouter.configure({ stableProvider: 'smart_nlu', routingMode: 'STABLE_ONLY', canaryPercentage: 0 });
    const nluRes = await aiService.processCustomerMessage(TEST_PHONE, 'bade crispy chicken under 15$');
    assert(
      nluRes.intent === 'SEARCH_RESULTS' && nluRes.replyText.includes('Crispy Chicken'),
      'smart_nlu provider correctly executes offline deterministic chatbot'
    );
  } finally {
    config.ai.provider = origProvider;
    config.ai.geminiApiKey = origKey;
    config.ai.geminiModel = origModel;
    shadowCanaryRouter.configure(origRouting);
  }

  // -------------------------------------------------------------
  // Test 3: Controlled Server-Side Tools Execution (Kickoff Req 3)
  // -------------------------------------------------------------
  console.log('\n▶ Sub-suite 3: Controlled Autonomous Tools Execution');

  const customer = await customerService.findOrCreateByPhone(TEST_PHONE, 'Gemini Test User');
  const cart = await cartService.getOrCreateActiveCart(customer.id);
  await cartService.clearCart(cart.id);

  // Setup Gemini service with valid mock key and custom fetch for testing
  config.ai.provider = 'gemini';
  config.ai.geminiApiKey = 'test_key_gemini_3_8_flash';
  config.ai.geminiModel = 'gemini-3.8-flash';

  // 3a: Tool - Catalog Search (via Gemini function call round)
  let fetchCallCount = 0;
  let functionResponseRoleSeen: string | undefined;
  geminiService.setFetchFn(async (url: any, options: any) => {
    fetchCallCount++;
    const body = JSON.parse(options.body);

    if (fetchCallCount > 1) {
      const responseTurn = body.contents?.find((content: any) =>
        content.parts?.some((part: any) => part.functionResponse)
      );
      functionResponseRoleSeen = responseTurn?.role;
    }

    // First round: simulate Gemini calling 'search_catalog'
    if (fetchCallCount === 1) {
      return new Response(
        JSON.stringify({
          candidates: [
            {
              content: {
                role: 'model',
                parts: [
                  {
                    functionCall: {
                      name: 'search_catalog',
                      args: { query: 'crispy chicken', max_budget: 15.0 },
                    },
                  },
                ],
              },
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Second round: Gemini produces text response using functionResponse results
    return new Response(
      JSON.stringify({
        candidates: [
          {
            content: {
              role: 'model',
              parts: [
                {
                  text: 'Found great crispy chicken options under $15 for you in Saida:\n\n1. **Chicken House**\n🍗 Crispy Chicken Meal — **$10.50** (Delivery: $1.50 | ⏱️ 35 mins | ⭐ 4.8)',
                },
              ],
            },
          },
        ],
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  });

  const searchRes = await geminiService.processCustomerMessage(TEST_PHONE, 'bade crispy chicken under 15$');
  assert(
    searchRes.intent === 'SEARCH_RESULTS' &&
      searchRes.replyText.includes('Chicken House') &&
      searchRes.replyText.includes('$10.50'),
      'Gemini executes search_catalog tool and reports real catalog prices & delivery fees'
  );
  assert(
    functionResponseRoleSeen === 'user',
    'Gemini sends functionResponse in a valid user turn (never the unsupported function role)'
  );

  // 3b: Tool - Add to Cart with notes
  fetchCallCount = 0;
  geminiService.setFetchFn(async (url: any, options: any) => {
    fetchCallCount++;
    if (fetchCallCount === 1) {
      return new Response(
        JSON.stringify({
          candidates: [
            {
              content: {
                role: 'model',
                parts: [
                  {
                    functionCall: {
                      name: 'add_to_cart',
                      args: {
                        option_index: 1,
                        quantity: 1,
                        customer_notes: 'No pickles (بلا كبيس)',
                      },
                    },
                  },
                ],
              },
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }
    return new Response(
      JSON.stringify({
        candidates: [
          {
            content: {
              role: 'model',
              parts: [
                {
                  text: 'Added **Crispy Chicken Meal** from **Chicken House** ($10.50) (No pickles (بلا كبيس)) to your cart!\n\n🛒 Cart Subtotal: $10.50 + $1.50 delivery = **$12.00**.',
                },
              ],
            },
          },
        ],
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  });

  const addRes = await geminiService.processCustomerMessage(TEST_PHONE, 'add the first one bas without pickles');
  const cartAfterAdd = await cartService.getOrCreateActiveCart(customer.id);
  assert(
    addRes.intent === 'ADD_TO_CART' &&
      cartAfterAdd.items.length === 1 &&
      cartAfterAdd.items[0].product_name.includes('Crispy Chicken') &&
      Boolean(cartAfterAdd.items[0].customer_notes?.includes('No pickles')),
    'Gemini executes add_to_cart tool with notes and updates customer cart'
  );

  // 3c: Tool - Add a drink (Coke Zero)
  fetchCallCount = 0;
  geminiService.setFetchFn(async (url: any, options: any) => {
    fetchCallCount++;
    if (fetchCallCount === 1) {
      return new Response(
        JSON.stringify({
          candidates: [
            {
              content: {
                role: 'model',
                parts: [
                  {
                    functionCall: {
                      name: 'add_to_cart',
                      args: { product_name_query: 'coke zero', quantity: 1 },
                    },
                  },
                ],
              },
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }
    return new Response(
      JSON.stringify({
        candidates: [
          {
            content: {
              role: 'model',
              parts: [
                {
                  text: 'Added **Coke Zero** ($1.50) to your cart!\n\n🛒 New total: **$13.50**.',
                },
              ],
            },
          },
        ],
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  });

  await geminiService.processCustomerMessage(TEST_PHONE, 'add coke zero');
  const cartWithCoke = await cartService.getOrCreateActiveCart(customer.id);
  assert(
    cartWithCoke.items.length === 2,
    'Gemini adds secondary product (Coke Zero) to cart'
  );

  // -------------------------------------------------------------
  // Test 4: Ambiguity Detection & Clarification Rule (Kickoff Req 3, 5, Acceptance 7)
  // -------------------------------------------------------------
  console.log('\n▶ Sub-suite 4: Ambiguity Detection & Clarification');

  // Customer says "large" when cart has BOTH crispy chicken meal and coke zero
  fetchCallCount = 0;
  geminiService.setFetchFn(async (url: any, options: any) => {
    fetchCallCount++;
    if (fetchCallCount === 1) {
      return new Response(
        JSON.stringify({
          candidates: [
            {
              content: {
                role: 'model',
                parts: [
                  {
                    functionCall: {
                      name: 'update_cart_variant',
                      args: { target_item: 'large', variant_name: 'Large' },
                    },
                  },
                ],
              },
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }
    return new Response(
      JSON.stringify({
        candidates: [
          {
            content: {
              role: 'model',
              parts: [
                {
                  text: 'Do you mean the Coke or the meal?',
                },
              ],
            },
          },
        ],
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  });

  const ambigRes = await geminiService.processCustomerMessage(TEST_PHONE, 'large');
  assert(
    ambigRes.intent === 'CLARIFICATION_REQUIRED' && ambigRes.replyText.includes('Do you mean the Coke or the meal?'),
    'Gemini asks for clarification instead of guessing when target item is ambiguous (meal vs coke)'
  );

  // Clarification resolution: "the coke"
  const clarifRes = await geminiService.processCustomerMessage(TEST_PHONE, 'the coke');
  assert(
    clarifRes.intent === 'CLARIFICATION_RESOLVED' && clarifRes.replyText.includes('Coke Zero to **Large**'),
    'Resolving clarification updates specific item variant and restores pricing'
  );

  // -------------------------------------------------------------
  // Test 5: Address Selection by Phrase (Kickoff Req 3, 4)
  // -------------------------------------------------------------
  console.log('\n▶ Sub-suite 5: Lebanese Arabizi Address Selection');

  fetchCallCount = 0;
  geminiService.setFetchFn(async (url: any, options: any) => {
    fetchCallCount++;
    if (fetchCallCount === 1) {
      return new Response(
        JSON.stringify({
          candidates: [
            {
              content: {
                role: 'model',
                parts: [
                  {
                    functionCall: {
                      name: 'select_delivery_address',
                      args: { phrase_or_label: '3al bet' },
                    },
                  },
                ],
              },
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }
    return new Response(
      JSON.stringify({
        candidates: [
          {
            content: {
              role: 'model',
              parts: [
                {
                  text: 'Got it! Delivering to your **Home** address (Saida, Near Nejmeh Square).\n\n📋 *Final Order Summary*:\n• 1x Crispy Chicken Meal ($10.50)\n• 1x Coke Zero (Large) ($2.50)\n\nSubtotal: $13.00\nDelivery Fee: $1.50\n*Total*: **$14.50** (Cash on Delivery)\n\nReply **"confirm"** to place your order!',
                },
              ],
            },
          },
        ],
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  });

  const addrRes = await geminiService.processCustomerMessage(TEST_PHONE, '3al bet');
  assert(
    addrRes.intent === 'ADDRESS_SELECTED' &&
      addrRes.replyText.includes('Home') &&
      addrRes.replyText.includes('confirm'),
    'Gemini resolves Lebanese Arabizi address phrase ("3al bet") and shows final order summary'
  );

  // -------------------------------------------------------------
  // Test 6: Strict Explicit Order Confirmation Protection (Kickoff Req 3, 5, Acceptance 8, 9)
  // -------------------------------------------------------------
  console.log('\n▶ Sub-suite 6: Strict Order Confirmation Protection');

  // 6a: Attempting to call confirm_and_create_order when customer did NOT explicitly confirm
  fetchCallCount = 0;
  geminiService.setFetchFn(async (url: any, options: any) => {
    fetchCallCount++;
    if (fetchCallCount === 1) {
      // Model tries to prematurely call order confirmation
      return new Response(
        JSON.stringify({
          candidates: [
            {
              content: {
                role: 'model',
                parts: [
                  {
                    functionCall: {
                      name: 'confirm_and_create_order',
                      args: {},
                    },
                  },
                ],
              },
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }
    // Second round: model receives EXPLICIT_CONFIRMATION_REQUIRED from server tool and asks customer
    return new Response(
      JSON.stringify({
        candidates: [
          {
            content: {
              role: 'model',
              parts: [
                {
                  text: 'Please reply "confirm" when you are ready to place your order!',
                },
              ],
            },
          },
        ],
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  });

  // Customer asks a non-confirmation message e.g. "what is the delivery time?"
  const ordersBefore = await query<any[]>(`SELECT COUNT(*) as cnt FROM orders WHERE customer_id = ?`, [customer.id]);
  const unconfirmedRes = await geminiService.processCustomerMessage(TEST_PHONE, 'what is the delivery time?');
  const ordersAfterUnconfirmed = await query<any[]>(`SELECT COUNT(*) as cnt FROM orders WHERE customer_id = ?`, [customer.id]);

  assert(
    ordersBefore[0].cnt === ordersAfterUnconfirmed[0].cnt,
    'Order creation strictly blocked on server without explicit customer confirmation'
  );

  // 6b: Explicit customer confirmation ("confirm")
  fetchCallCount = 0;
  geminiService.setFetchFn(async (url: any, options: any) => {
    fetchCallCount++;
    if (fetchCallCount === 1) {
      return new Response(
        JSON.stringify({
          candidates: [
            {
              content: {
                role: 'model',
                parts: [
                  {
                    functionCall: {
                      name: 'confirm_and_create_order',
                      args: {},
                    },
                  },
                ],
              },
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }
    return new Response(
      JSON.stringify({
        candidates: [
          {
            content: {
              role: 'model',
              parts: [
                {
                  text: '🎉 *Order Confirmed!* (Order #ORD-2026-9999)\n\n📍 *Merchant*: Chicken House\n🛵 Delivery Fee: $1.50\n💰 *Total to Pay (Cash)*: **$14.50**\n🏠 *Delivering To*: Home\n⏱️ *Estimated Delivery*: 25-30 mins',
                },
              ],
            },
          },
        ],
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  });

  const confirmedRes = await geminiService.processCustomerMessage(TEST_PHONE, 'confirm');
  const ordersAfterConfirmed = await query<any[]>(`SELECT * FROM orders WHERE customer_id = ? ORDER BY id DESC LIMIT 1`, [customer.id]);


  assert(
    confirmedRes.intent === 'ORDER_CONFIRMED' &&
      ordersAfterConfirmed.length > 0 &&
      ordersAfterConfirmed[0].status === 'CONFIRMED' &&
      Boolean(confirmedRes.orderCreated),
    'Order successfully created in MySQL after customer explicitly confirms with "confirm"'
  );

  // -------------------------------------------------------------
  // Test 7: Order Status Checking (Kickoff Req 3)
  // -------------------------------------------------------------
  console.log('\n▶ Sub-suite 7: Order Status & Live Tracking');

  fetchCallCount = 0;
  geminiService.setFetchFn(async (url: any, options: any) => {
    fetchCallCount++;
    if (fetchCallCount === 1) {
      return new Response(
        JSON.stringify({
          candidates: [
            {
              content: {
                role: 'model',
                parts: [
                  {
                    functionCall: {
                      name: 'get_order_status',
                      args: {},
                    },
                  },
                ],
              },
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }
    return new Response(
      JSON.stringify({
        candidates: [
          {
            content: {
              role: 'model',
              parts: [
                {
                  text: `📦 *Order #${ordersAfterConfirmed[0].order_number} Update*:\nYour order from **Chicken House** is currently **CONFIRMED**.\n💰 Total: $14.50 (Cash on Delivery).`,
                },
              ],
            },
          },
        ],
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  });

  const statusRes = await geminiService.processCustomerMessage(TEST_PHONE, 'wein el order');
  assert(
    statusRes.intent === 'ORDER_STATUS' &&
      statusRes.replyText.includes('Order #') &&
      statusRes.replyText.includes('Chicken House'),
    'Gemini retrieves live order tracking via get_order_status tool for "wein el order"'
  );

  // -------------------------------------------------------------
  // Test 8: Supermarket Basket Comparison (Kickoff Req 3)
  // -------------------------------------------------------------
  console.log('\n▶ Sub-suite 8: Supermarket Whole-Basket Comparison');

  fetchCallCount = 0;
  geminiService.setFetchFn(async (url: any, options: any) => {
    fetchCallCount++;
    if (fetchCallCount === 1) {
      return new Response(
        JSON.stringify({
          candidates: [
            {
              content: {
                role: 'model',
                parts: [
                  {
                    functionCall: {
                      name: 'compare_supermarket_basket',
                      args: {
                        items: [
                          { query: 'coke zero', quantity: 2 },
                          { query: 'milk', quantity: 1 },
                          { query: 'bread', quantity: 1 },
                          { query: 'lays', quantity: 1 },
                        ],
                      },
                    },
                  },
                ],
              },
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }
    return new Response(
      JSON.stringify({
        candidates: [
          {
            content: {
              role: 'model',
              parts: [
                {
                  text: '🎙️ Understood your shopping list! I compared nearby supermarkets:\n\n🏆 **Best Value: Metro Supermarket**\n• 2x Coke Zero Can 330ml ($1.50)\n• 1x Fresh Milk 1L ($1.50)\n• 1x White Sliced Bread ($1.00)\n• 1x Lays Salt Chips ($1.25)\n🛵 Delivery Fee: $1.50\n💰 **Total Complete Basket: $6.75**',
                },
              ],
            },
          },
        ],
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  });

  const basketRes = await geminiService.processCustomerMessage(
    TEST_PHONE,
    'bade 2 coke zero w lays w shufle arkhass mahal',
    'audio'
  );
  assert(
    basketRes.intent === 'BASKET_COMPARISON' &&
      basketRes.replyText.includes('Metro Supermarket') &&
      basketRes.replyText.includes('Total Complete Basket'),
    'Gemini compares whole supermarket basket and ranks best-value store'
  );

  // -------------------------------------------------------------
  // Test 9: Redis Context State & History Preservation (Kickoff Req 4, Acceptance 10)
  // -------------------------------------------------------------
  console.log('\n▶ Sub-suite 9: Redis State & Multi-Turn History');

  const redisHistory = await redis.get(`ai:history:${customer.id}`);
  const parsedHistory = redisHistory ? JSON.parse(redisHistory) : [];
  assert(
    parsedHistory.length >= 4 && parsedHistory.some((h: any) => h.role === 'user' && h.text.includes('3al bet')),
    'Multi-turn conversation history is persisted in Redis across WhatsApp messages'
  );

  const redisStateRaw = await redis.get(`ai:state:${customer.id}`);
  const parsedState = redisStateRaw ? JSON.parse(redisStateRaw) : null;
  assert(
    parsedState && parsedState.customerId === customer.id && parsedState.selectedAddressLabel === 'Home',
    'AI context state (selected address, active merchant) is persisted in Redis'
  );

  // -------------------------------------------------------------
  // Test 10: Gemini API Error Classification & Fail-Closed Behavior (Kickoff Req 5, Acceptance 11)
  // -------------------------------------------------------------
  console.log('\n▶ Sub-suite 10: Error Classification & Fail-Closed Resilience');

  // 10a: HTTP 401 Auth Error
  geminiService.setFetchFn(async () => {
    return new Response(
      JSON.stringify({ error: { code: 401, message: 'API_KEY_INVALID' } }),
      { status: 401, headers: { 'Content-Type': 'application/json' } }
    );
  });

  try {
    await geminiService.processCustomerMessage(TEST_PHONE, 'hello');
    assert(false, 'HTTP 401 from Gemini must throw, not succeed');
  } catch (err: any) {
    assert(
      err.message.includes('HTTP 401'),
      'HTTP 401 from Gemini API throws clear error and does not report fake success'
    );
  }

  // 10b: HTTP 429 Rate Limit
  geminiService.setFetchFn(async () => {
    return new Response(
      JSON.stringify({ error: { code: 429, message: 'RESOURCE_EXHAUSTED' } }),
      { status: 429, headers: { 'Content-Type': 'application/json' } }
    );
  });

  try {
    await geminiService.processCustomerMessage(TEST_PHONE, 'hello');
    assert(false, 'HTTP 429 from Gemini must throw, not succeed');
  } catch (err: any) {
    assert(
      err.message.includes('HTTP 429'),
      'HTTP 429 Rate Limit from Gemini API fails closed safely'
    );
  }

  // Reset Gemini fetch fn and configs
  geminiService.resetFetchFn();
  config.ai.provider = origProvider;
  config.ai.geminiApiKey = origKey;
  config.ai.geminiModel = origModel;

  console.log(`\n🏁 Gemini 3.8 Flash Test Results: ${passed} Passed, ${failed} Failed`);
  return failed === 0;
}

if (process.argv[1]?.endsWith('test-gemini.ts') || process.argv[1]?.endsWith('test-gemini.js')) {
  runGeminiIntegrationTests()
    .then((ok) => process.exit(ok ? 0 : 1))
    .catch((err) => {
      console.error('Fatal Gemini test suite failure:', err);
      process.exit(1);
    });
}
