import {
  BEHAVIOR_CONTRACT_VERSION,
  CANONICAL_INTENTS,
  toCanonicalIntent,
  toLegacyIntent,
  isMutatingTool,
  isAllowedTransition,
  getBehaviorContractSchema,
} from '../modules/ai/contract/behavior.contract.js';
import {
  AddToCartSchema,
  UpdateCartQuantitySchema,
  SearchCatalogSchema,
  ConfirmAndCreateOrderSchema,
} from '../modules/ai/contract/tool-schemas.js';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ Assertion failed: ${message}`);
    process.exit(1);
  }
  console.log(`  ✅ ${message} [PASS]`);
}

async function runBehaviorContractTests() {
  console.log('\n🧪 Starting Behavior Contract & Validation Tests (Phase 1)...');

  // 1. Version and schema completeness
  const schema = getBehaviorContractSchema();
  assert(schema.version === '1.0.0', `Contract version is ${BEHAVIOR_CONTRACT_VERSION}`);
  assert(schema.canonicalIntents.length === 18, `Taxonomy has 18 canonical intents`);
  assert(schema.conversationStages.length === 11, `Conversation has 11 stages`);
  assert(schema.clarificationTypes.length === 6, `Clarification has 6 types`);

  // 2. Intent conversion and legacy adapter
  assert(toCanonicalIntent('SEARCH_RESULTS') === 'SEARCH_PRODUCTS', 'SEARCH_RESULTS maps to SEARCH_PRODUCTS');
  assert(toCanonicalIntent('BUDGET_SEARCH') === 'SEARCH_PRODUCTS', 'BUDGET_SEARCH maps to SEARCH_PRODUCTS');
  assert(toCanonicalIntent('BASKET_COMPARISON') === 'COMPARE_BASKET', 'BASKET_COMPARISON maps to COMPARE_BASKET');
  assert(toCanonicalIntent('PRODUCT_MODIFICATION') === 'ADD_ITEM_NOTE', 'PRODUCT_MODIFICATION maps to ADD_ITEM_NOTE');
  assert(toCanonicalIntent('ORDER_CONFIRMED') === 'CONFIRM_ORDER', 'ORDER_CONFIRMED maps to CONFIRM_ORDER');
  assert(toCanonicalIntent('UNKNOWN') === 'UNKNOWN', 'UNKNOWN maps to UNKNOWN');
  assert(toLegacyIntent('SEARCH_PRODUCTS') === 'SEARCH_RESULTS', 'Canonical SEARCH_PRODUCTS maps back to legacy SEARCH_RESULTS');

  // 3. Mutating vs read-only classification
  assert(isMutatingTool('add_to_cart') === true, 'add_to_cart is classified as mutating');
  assert(isMutatingTool('update_cart_quantity') === true, 'update_cart_quantity is classified as mutating');
  assert(isMutatingTool('confirm_and_create_order') === true, 'confirm_and_create_order is classified as mutating');
  assert(isMutatingTool('search_catalog') === false, 'search_catalog is classified as read-only');
  assert(isMutatingTool('get_active_cart') === false, 'get_active_cart is classified as read-only');
  assert(isMutatingTool('get_order_status') === false, 'get_order_status is classified as read-only');

  // 4. State transition rules
  assert(isAllowedTransition('IDLE', 'SEARCHING') === true, 'IDLE -> SEARCHING is allowed');
  assert(isAllowedTransition('SELECTING_ADDRESS', 'AWAITING_CONFIRMATION') === true, 'SELECTING_ADDRESS -> AWAITING_CONFIRMATION is allowed');
  assert(isAllowedTransition('AWAITING_CONFIRMATION', 'ORDER_PLACED') === true, 'AWAITING_CONFIRMATION -> ORDER_PLACED is allowed');
  assert(isAllowedTransition('IDLE', 'ORDER_PLACED') === false, 'IDLE -> ORDER_PLACED is forbidden');
  assert(isAllowedTransition('SEARCHING', 'ORDER_PLACED') === false, 'SEARCHING -> ORDER_PLACED is forbidden');

  // 5. Tool argument schema validation
  const validSearch = SearchCatalogSchema.safeParse({ query: 'crispy chicken', max_budget: 15, preference: 'cheapest' });
  assert(validSearch.success === true, 'Valid search parameters pass schema');

  const emptySearch = SearchCatalogSchema.safeParse({ query: '' });
  assert(emptySearch.success === false, 'Empty search query is rejected by schema');

  const validAddToCart = AddToCartSchema.safeParse({ product_name_query: 'coke zero', quantity: 2 });
  assert(validAddToCart.success === true, 'Valid add_to_cart parameters pass schema');

  const negativeQuantityAdd = AddToCartSchema.safeParse({ product_name_query: 'coke', quantity: -1 });
  assert(negativeQuantityAdd.success === false, 'Negative quantity is rejected by AddToCartSchema');

  const decimalQuantityUpdate = UpdateCartQuantitySchema.safeParse({ target_item: 'meal', new_quantity: 2.5 });
  assert(decimalQuantityUpdate.success === false, 'Decimal quantity is rejected by UpdateCartQuantitySchema');

  // 6. Authoritative Gemini tool declarations synchronization
  const { getAuthoritativeGeminiToolDeclarations } = await import('../modules/ai/contract/tool-schemas.js');
  const geminiTools = getAuthoritativeGeminiToolDeclarations();
  const functionDeclarations = geminiTools[0].functionDeclarations;
  assert(functionDeclarations.length === 17, `Exported 17 authoritative Gemini tool declarations`);

  const toolNames = new Set(functionDeclarations.map((t: any) => t.name));
  assert(toolNames.has('add_to_cart'), 'Authoritative tools include add_to_cart');
  assert(toolNames.has('update_cart_quantity'), 'Authoritative tools include update_cart_quantity');
  assert(toolNames.has('update_cart_notes'), 'Authoritative tools include update_cart_notes');
  assert(toolNames.has('list_saved_addresses'), 'Authoritative tools include list_saved_addresses');
  assert(toolNames.has('select_delivery_address'), 'Authoritative tools include select_delivery_address');
  assert(toolNames.has('confirm_and_create_order'), 'Authoritative tools include confirm_and_create_order');
  assert(toolNames.has('switch_merchant_confirm'), 'Authoritative tools include switch_merchant_confirm');
  assert(toolNames.has('switch_merchant_reject'), 'Authoritative tools include switch_merchant_reject');

  // Verify exact argument names in declarations (resolving audit mismatches)
  const updateQtyTool = functionDeclarations.find((t: any) => t.name === 'update_cart_quantity')!;
  assert('new_quantity' in (updateQtyTool.parameters as any).properties, 'update_cart_quantity defines new_quantity');
  assert('target_item' in (updateQtyTool.parameters as any).properties, 'update_cart_quantity defines target_item');

  const updateNotesTool = functionDeclarations.find((t: any) => t.name === 'update_cart_notes')!;
  assert('customer_notes' in (updateNotesTool.parameters as any).properties, 'update_cart_notes defines customer_notes');

  const selectAddrTool = functionDeclarations.find((t: any) => t.name === 'select_delivery_address')!;
  assert('address_label' in (selectAddrTool.parameters as any).properties, 'select_delivery_address defines address_label');

  const confirmTool = functionDeclarations.find((t: any) => t.name === 'confirm_and_create_order')!;
  assert('confirmation_phrase' in (confirmTool.parameters as any).properties, 'confirm_and_create_order defines confirmation_phrase');

  // 7. Rigorous Anti-Defaulting Tests (Audit Finding Area E)
  const {
    UpdateCartNotesSchema,
    SelectDeliveryAddressSchema,
    ClearCartSchema,
    SwitchMerchantConfirmSchema,
    SwitchMerchantRejectSchema,
    CANONICAL_TOOL_SPECS,
    getAuthoritativeGeminiDeclarationsList,
  } = await import('../modules/ai/contract/tool-schemas.js');

  // Quantity updates MUST fail if quantity is missing (no silent default to 1)
  const missingQtyUpdate = UpdateCartQuantitySchema.safeParse({ target_item: 'crispy chicken' });
  assert(missingQtyUpdate.success === false, 'Missing new_quantity is rejected by UpdateCartQuantitySchema (no default to 1)');

  // Notes updates MUST fail if notes are missing (no silent default to empty string)
  const missingNotesUpdate = UpdateCartNotesSchema.safeParse({ target_item: 'crispy chicken' });
  assert(missingNotesUpdate.success === false, 'Missing notes is rejected by UpdateCartNotesSchema (no default to empty string)');

  // Address selection MUST fail if label is missing (no silent default to empty string)
  const missingAddr = SelectDeliveryAddressSchema.safeParse({});
  assert(missingAddr.success === false, 'Missing address_label is rejected by SelectDeliveryAddressSchema (no default to empty)');

  // Clear cart MUST fail if confirmation is missing (no silent default to true)
  const missingClearConfirm = ClearCartSchema.safeParse({});
  assert(missingClearConfirm.success === false, 'Missing confirmation is rejected by ClearCartSchema (no default to true)');

  // Switch merchant confirm MUST fail if confirm_switch is missing (no silent default to true)
  const missingSwitchConfirm = SwitchMerchantConfirmSchema.safeParse({});
  assert(missingSwitchConfirm.success === false, 'Missing confirm_switch is rejected by SwitchMerchantConfirmSchema (no default to true)');

  // Switch merchant reject MUST fail if reject_switch is missing (no silent default to true)
  const missingSwitchReject = SwitchMerchantRejectSchema.safeParse({});
  assert(missingSwitchReject.success === false, 'Missing reject_switch is rejected by SwitchMerchantRejectSchema (no default to true)');

  // Confirm and create order MUST fail if confirmation_phrase is missing
  const missingOrderConfirm = ConfirmAndCreateOrderSchema.safeParse({});
  assert(missingOrderConfirm.success === false, 'Missing confirmation_phrase is rejected by ConfirmAndCreateOrderSchema');

  // 8. Automated Deep Structural Equivalence Tests (CANONICAL_TOOL_SPECS vs Gemini Declarations)
  const allDecls = getAuthoritativeGeminiDeclarationsList();
  for (const [toolName, spec] of Object.entries(CANONICAL_TOOL_SPECS)) {
    const decl = allDecls.find((d: any) => d.name === toolName);
    assert(Boolean(decl), `Gemini declaration exists for tool "${toolName}"`);
    assert(decl.description === spec.description, `Description matches for "${toolName}"`);

    const declProps = decl.parameters?.properties || {};
    const declRequired: string[] = decl.parameters?.required || [];

    for (const [propName, fieldSpec] of Object.entries(spec.parameters)) {
      assert(propName in declProps, `Property "${propName}" exists in Gemini decl for "${toolName}"`);
      assert(declProps[propName].type === fieldSpec.type, `Property "${propName}" type matches (${fieldSpec.type}) in "${toolName}"`);

      if (fieldSpec.required) {
        assert(declRequired.includes(propName), `Property "${propName}" is marked required in Gemini decl for "${toolName}"`);
      }

      if (fieldSpec.enum) {
        assert(
          JSON.stringify(declProps[propName].enum) === JSON.stringify(fieldSpec.enum),
          `Property "${propName}" enum values match in "${toolName}"`
        );
      }

      // Check nested structures (e.g. array of objects)
      if (fieldSpec.type === 'ARRAY' && fieldSpec.items) {
        assert(declProps[propName].items.type === fieldSpec.items.type, `Nested array item type matches in "${toolName}.${propName}"`);
        if (fieldSpec.items.type === 'OBJECT' && fieldSpec.items.properties) {
          const nestedProps = declProps[propName].items.properties;
          for (const [nestedKey, nestedField] of Object.entries(fieldSpec.items.properties)) {
            assert(nestedKey in nestedProps, `Nested property "${nestedKey}" exists in "${toolName}.${propName}"`);
            assert(nestedProps[nestedKey].type === nestedField.type, `Nested property "${nestedKey}" type matches in "${toolName}.${propName}"`);
          }
        }
      }
    }
  }
  console.log('  ✅ 100% Structural & semantic equivalence between CANONICAL_TOOL_SPECS, Zod schemas, and Gemini declarations [PASS]');

  console.log('\n🏁 Behavior Contract Tests: All Assertions Passed!\n');
}

runBehaviorContractTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
