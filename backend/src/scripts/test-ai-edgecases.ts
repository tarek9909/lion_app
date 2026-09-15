import { config } from '../config/env.js';
import { geminiService } from '../modules/ai/gemini.service.js';
import { customerService } from '../modules/customers/customer.service.js';
import { cartService } from '../modules/carts/cart.service.js';
import { catalogService } from '../modules/catalog/catalog.service.js';
import { normalizeWhatsAppMessage } from '../modules/conversations/whatsapp-message.processor.js';
import { resetDemo } from './reset-demo.js';

type ToolState = {
  customerId: number;
  lastPresentedOptions: any[];
  selectedMerchantId: number | null;
  selectedMerchantBranchId: number | null;
  selectedMerchantName: string | null;
  budgetLimit: number | null;
  pendingClarification: string | null;
  selectedAddressId: number | null;
  selectedAddressLabel: string | null;
  awaitingConfirmation: boolean;
  activeOrderId: number | null;
  checkoutFingerprint?: string | null;
  [key: string]: any;
};

export async function runAiEdgeCaseTests(): Promise<boolean> {
  console.log('\n🧪 Starting AI flow edge-case regression tests...');
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

  const originalProvider = config.ai.provider;
  const originalKey = config.ai.geminiApiKey;
  const originalModel = config.ai.geminiModel;
  const customer = await customerService.findOrCreateByPhone('96170123456', 'Demo Customer');
  const cart = await cartService.getOrCreateActiveCart(customer.id);
  await cartService.clearCart(cart.id);

  try {
    const interactive = await normalizeWhatsAppMessage({
      from: '96170999888',
      id: 'wamid.interactive.edge',
      type: 'interactive',
      interactive: { type: 'button_reply', button_reply: { id: 'add_first', title: 'Add the first one' } },
    });
    assert(interactive.processedText === 'Add the first one' && interactive.providerMessageId === 'wamid.interactive.edge',
      'Interactive WhatsApp replies normalize into text with their provider ID');

    const unsupported = await normalizeWhatsAppMessage({
      from: '96170999888',
      id: 'wamid.sticker.edge',
      type: 'sticker',
      sticker: { id: 'media_sticker_001' },
    });
    assert(Boolean(unsupported.immediateReply) && unsupported.processedText.includes('Unsupported WhatsApp message type'),
      'Unsupported WhatsApp media fails closed with a customer-safe reply');

    const products = await catalogService.searchProducts('crispy chicken');
    const first = products[0];
    const otherMerchant = products.find((product) => product.merchantBranchId !== first?.merchantBranchId);
    assert(Boolean(first), 'Edge-case fixture has a product available for tool validation');

    const state: ToolState = {
      customerId: customer.id,
      lastPresentedOptions: products,
      selectedMerchantId: first?.merchantId || null,
      selectedMerchantBranchId: first?.merchantBranchId || null,
      selectedMerchantName: first?.merchantName || null,
      budgetLimit: null,
      pendingClarification: null,
      selectedAddressId: null,
      selectedAddressLabel: null,
      awaitingConfirmation: false,
      activeOrderId: null,
    };
    const executeTool = (geminiService as any).executeTool.bind(geminiService);

    if (first) {
      const negativeQuantity = await executeTool('add_to_cart', {
        merchant_product_id: first.merchantProductId,
        quantity: -3,
      }, customer, state, 'add it');
      assert(negativeQuantity.result.success === false && negativeQuantity.result.error.includes('positive whole number'),
        'Negative add-to-cart quantities are rejected');

      const decimalQuantity = await executeTool('update_cart_quantity', {
        target_item: 'chicken',
        quantity: 1.5,
      }, customer, state, 'change quantity');
      assert(decimalQuantity.result.success === false && decimalQuantity.result.error.includes('whole-number'),
        'Decimal cart quantities are rejected');

      const added = await executeTool('add_to_cart', {
        merchant_product_id: first.merchantProductId,
        quantity: 1,
      }, customer, state, 'add it');
      assert(added.result.success === true, 'A valid cart mutation still succeeds');

      const vagueClear = await executeTool('clear_cart', { confirmation: true }, customer, state, 'delete yesterday');
      const cartAfterVagueClear = await cartService.getOrCreateActiveCart(customer.id);
      assert(vagueClear.result.error === 'EXPLICIT_CART_CLEAR_REQUIRED' && cartAfterVagueClear.items.length === 1,
        'Vague destructive language cannot clear an existing cart');

      if (otherMerchant) {
        const switchAttempt = await executeTool('add_to_cart', {
          merchant_product_id: otherMerchant.merchantProductId,
          quantity: 1,
        }, customer, state, 'add this too');
        const cartAfterSwitchAttempt = await cartService.getOrCreateActiveCart(customer.id);
        assert(switchAttempt.result.error === 'CART_MERCHANT_SWITCH_CONFIRMATION_REQUIRED' && cartAfterSwitchAttempt.items.length === 1,
          'Cross-merchant add requires confirmation and preserves the current cart');
      }

      const prematureConfirm = await executeTool('confirm_and_create_order', { confirmation_phrase: 'yesterday' }, customer, state, 'yesterday');
      assert(prematureConfirm.result.error === 'EXPLICIT_CONFIRMATION_REQUIRED',
        'Words containing confirmation-like substrings do not place an order');

      const missingSummaryConfirm = await executeTool('confirm_and_create_order', { confirmation_phrase: 'confirm' }, customer, state, 'confirm');
      assert(missingSummaryConfirm.result.error === 'FINAL_SUMMARY_CONFIRMATION_REQUIRED',
        'Explicit confirmation is still blocked until the final summary/address step');

      const clearResult = await executeTool('clear_cart', { confirmation: true }, customer, state, 'clear cart');
      const cartAfterClear = await cartService.getOrCreateActiveCart(customer.id);
      assert(clearResult.result.success === true && cartAfterClear.items.length === 0,
        'Explicit cart-clear language clears the cart');

      // -------------------------------------------------------------
      // REGRESSION TESTS: Safe Order Confirmation & Revision Fingerprint (Area C)
      // -------------------------------------------------------------
      // Note: Baseline customer has saved address 'Home' from demo baseline data.

      // Step 1: Add item and select delivery address (generates final summary and fingerprint)
      await executeTool('add_to_cart', { merchant_product_id: first.merchantProductId, quantity: 1 }, customer, state, 'add it');
      const addrRes = await executeTool('select_delivery_address', { address_label: 'Home' }, customer, state, '3al bet');
      assert(addrRes.success === true, 'Select delivery address succeeds');
      assert(state.awaitingConfirmation === true, 'Awaiting confirmation is true after address selection');
      assert(Boolean(state.checkoutFingerprint), 'Checkout fingerprint is generated and saved upon summary presentation');
      const originalFingerprint = state.checkoutFingerprint;

      // Step 2: Mutate cart after final summary was shown (must invalidate awaitingConfirmation and fingerprint)
      const qtyRes = await executeTool('update_cart_quantity', { target_item: first.productName, new_quantity: 2 }, customer, state, 'make it 2');
      assert(qtyRes.success === true, 'Quantity update succeeds');
      assert(state.awaitingConfirmation === false, 'Awaiting confirmation is invalidated to false after cart modification');
      assert(state.checkoutFingerprint === null, 'Checkout fingerprint is invalidated to null after cart modification');

      // Step 3: Customer says "confirm" -> Server MUST REJECT order confirmation
      const rejectedConfirm = await executeTool('confirm_and_create_order', { confirmation_phrase: 'confirm' }, customer, state, 'confirm');
      assert(
        rejectedConfirm.success === false &&
        (rejectedConfirm.errorCode === 'FINAL_SUMMARY_CONFIRMATION_REQUIRED' || rejectedConfirm.errorCode === 'CHECKOUT_REVISION_MISMATCH'),
        'Confirmation after cart modification is strictly rejected until fresh summary is presented'
      );

      // Step 4: Show fresh summary
      const freshSummaryRes = await executeTool('select_delivery_address', { address_label: 'Home' }, customer, state, 'Home');
      assert(freshSummaryRes.success === true, 'Fresh summary presentation succeeds');
      assert(state.awaitingConfirmation === true, 'Awaiting confirmation is restored');
      assert(Boolean(state.checkoutFingerprint) && state.checkoutFingerprint !== originalFingerprint, 'Fresh checkout fingerprint is generated');

      // Step 5: Customer confirms -> Order created
      const confirmSuccess = await executeTool('confirm_and_create_order', { confirmation_phrase: 'confirm' }, customer, state, 'confirm');
      assert(confirmSuccess.success === true && Boolean(confirmSuccess.result.order_id), 'Order created after confirming fresh summary');
      const createdOrderId = confirmSuccess.result.order_id;

      // Step 6: Repeated confirmation must be idempotent (creates zero duplicate orders)
      const repeatedConfirm = await executeTool('confirm_and_create_order', { confirmation_phrase: 'confirm' }, customer, state, 'confirm');
      assert(
        repeatedConfirm.success === true &&
        repeatedConfirm.result.action === 'IDEMPOTENT_CONFIRMATION' &&
        repeatedConfirm.result.order_id === createdOrderId,
        'Repeated confirmation is idempotent and returns existing order without creating a duplicate'
      );

      // -------------------------------------------------------------
      // REGRESSION TESTS: Safe Cross-Merchant Switching (Area D)
      // -------------------------------------------------------------
      if (otherMerchant) {
        // Reset cart for merchant switch tests
        const cartToReset = await cartService.getOrCreateActiveCart(customer.id);
        await cartService.clearCart(cartToReset.id);
        state.cartSummary = null;
        state.selectedMerchant = null;
        state.pendingMerchantSwitch = null;
        state.activeOrderSummary = null;
        state.stage = 'IDLE';

        // Add item from merchant 1
        state.turnIndex = 1;
        await executeTool('add_to_cart', { merchant_product_id: first.merchantProductId, quantity: 1 }, customer, state, 'add it');

        // Propose switch to other merchant (Turn 2)
        state.turnIndex = 2;
        const switchProposal = await executeTool('add_to_cart', { merchant_product_id: otherMerchant.merchantProductId, quantity: 1 }, customer, state, 0, undefined, 'add from other');
        assert(switchProposal.errorCode === 'CART_MERCHANT_SWITCH_CONFIRMATION_REQUIRED', 'Cross-merchant add requires confirmation');
        assert(Boolean(state.pendingMerchantSwitch), 'Pending merchant switch state is set');

        // Same-turn chaining attempt: model tries to auto-confirm in the same turn (Turn 2)
        const sameTurnChaining = await executeTool('switch_merchant_confirm', { confirm_switch: true }, customer, state, 0, undefined, 'confirm');
        assert(
          sameTurnChaining.success === false && sameTurnChaining.errorCode === 'SAME_TURN_SWITCH_FORBIDDEN',
          'Same-turn merchant switch chaining is strictly blocked'
        );

        // Vague / question approval in subsequent customer turn (Turn 3): must fail and preserve old cart
        state.turnIndex = 3;
        const questionApproval = await executeTool('switch_merchant_confirm', { confirm_switch: true }, customer, state, 0, undefined, 'did I switch yesterday?');
        const cartAfterQuestion = await cartService.getOrCreateActiveCart(customer.id);
        assert(
          questionApproval.success === false && cartAfterQuestion.items.length === 1,
          'Question/vague phrase fails merchant switch and preserves original cart'
        );

        // Re-propose switch (Turn 4)
        state.turnIndex = 4;
        await executeTool('add_to_cart', { merchant_product_id: otherMerchant.merchantProductId, quantity: 1 }, customer, state, 0, undefined, 'add other');

        // Negated phrase in subsequent turn (Turn 5): "don't switch"
        state.turnIndex = 5;
        const negatedSwitch = await executeTool('switch_merchant_confirm', { confirm_switch: true }, customer, state, 0, undefined, "don't switch, cancel");
        const cartAfterNegated = await cartService.getOrCreateActiveCart(customer.id);
        assert(
          negatedSwitch.success === false && cartAfterNegated.items.length === 1,
          'Negated phrase rejects merchant switch and preserves original cart'
        );

        // Re-propose switch (Turn 6)
        state.turnIndex = 6;
        await executeTool('add_to_cart', { merchant_product_id: otherMerchant.merchantProductId, quantity: 1 }, customer, state, 0, undefined, 'add other');

        // Explicit customer approval in subsequent turn (Turn 7): "yes switch"
        state.turnIndex = 7;
        const approvedSwitch = await executeTool('switch_merchant_confirm', { confirm_switch: true }, customer, state, 0, undefined, 'yes switch');
        const cartAfterApproved = await cartService.getOrCreateActiveCart(customer.id);
        assert(
          approvedSwitch.success === true &&
          cartAfterApproved.merchant_branch_id === otherMerchant.merchantBranchId,
          'Explicit approval successfully switches merchant and populates new cart'
        );
      }
    }

    config.ai.provider = 'gemini';
    config.ai.geminiApiKey = 'edge_test_key';
    config.ai.geminiModel = 'gemini-3.8-flash';
    let fetchCalls = 0;
    let functionResponseTurn: any;
    geminiService.setFetchFn(async (_url: any, options: any) => {
      fetchCalls++;
      const body = JSON.parse(options.body);
      if (fetchCalls === 2) {
        functionResponseTurn = body.contents?.find((content: any) =>
          content.parts?.some((part: any) => part.functionResponse)
        );
      }
      if (fetchCalls === 1) {
        return new Response(JSON.stringify({ candidates: [{ content: { role: 'model', parts: [
          { functionCall: { id: 'call_search', name: 'search_catalog', args: { query: 'crispy chicken' } } },
          { functionCall: { id: 'call_cart', name: 'get_active_cart', args: {} } },
        ] } }] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return new Response(JSON.stringify({ candidates: [{ content: { role: 'model', parts: [
        { text: 'I found the catalog and checked your current cart.' },
      ] } }] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    });

    await geminiService.processCustomerMessage('96170999888', 'show me chicken options');
    const responseParts = functionResponseTurn?.parts || [];
    assert(functionResponseTurn?.role === 'user' && responseParts.length === 2,
      'Multiple Gemini function responses are returned in one valid user turn');
    assert(responseParts.every((part: any) => part.functionResponse?.id) &&
      responseParts.some((part: any) => part.functionResponse?.id === 'call_search') &&
      responseParts.some((part: any) => part.functionResponse?.id === 'call_cart'),
      'Every parallel Gemini tool result preserves its matching function-call ID');
  } finally {
    geminiService.resetFetchFn();
    config.ai.provider = originalProvider;
    config.ai.geminiApiKey = originalKey;
    config.ai.geminiModel = originalModel;
  }

  console.log(`\n🏁 AI edge-case results: ${passed} Passed, ${failed} Failed`);
  return failed === 0;
}

if (process.argv[1]?.endsWith('test-ai-edgecases.ts') || process.argv[1]?.endsWith('test-ai-edgecases.js')) {
  runAiEdgeCaseTests()
    .then((ok) => process.exit(ok ? 0 : 1))
    .catch((error) => {
      console.error('Fatal AI edge-case test failure:', error);
      process.exit(1);
    });
}
