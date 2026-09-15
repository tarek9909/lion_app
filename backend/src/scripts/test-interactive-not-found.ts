import { INTERACTIVE_NOT_FOUND_REPLY, dispatchCustomerError, getCustomerResponseCategory, isNotFoundError, resultHasNoCatalogMatches } from '../modules/ai/interactive-not-found.js';
import { hasForbiddenCustomerPresentation } from '../modules/ai/customer-output.js';
import { getGeminiSystemPrompt, GEMINI_FEW_SHOT_EXEMPLARS } from '../modules/ai/prompts/gemini.system-prompt.js';

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
  console.log(`  ✅ ${message} [PASS]`);
}

export function runInteractiveNotFoundTests(): void {
  console.log('\n🧪 Starting interactive catalog-miss and understandability checks...');
  assert(INTERACTIVE_NOT_FOUND_REPLY.includes("couldn't find that within my current catalog"), 'Catalog miss names the current catalog');
  assert(INTERACTIVE_NOT_FOUND_REPLY.endsWith('?'), 'Catalog miss always ends with an actionable question');
  assert(isNotFoundError('PRODUCT_NOT_FOUND'), 'Product-not-found tool errors are classified as interactive misses');
  assert(!isNotFoundError('ADDRESS_NOT_FOUND'), 'Address misses are not collapsed into catalog misses');
  assert(getCustomerResponseCategory('NO_ORDER_FOUND') === 'NO_ACTIVE_ORDER', 'No-order outcome keeps its own response category');
  const addressReply = dispatchCustomerError({ errorCode: 'ADDRESS_NOT_FOUND', language: 'en' })!;
  assert(addressReply.category === 'ADDRESS_MISS' && /address/i.test(addressReply.text), 'Address miss receives an address-specific reply');
  const unclearReply = dispatchCustomerError({ errorCode: 'UNINTELLIGIBLE_MESSAGE', language: 'arabizi' })!;
  assert(unclearReply.category === 'CLARIFICATION' && !hasForbiddenCustomerPresentation(unclearReply.text), 'Clarification is plain text in the requested language');
  assert(resultHasNoCatalogMatches({ count: 0, results: [] }), 'Empty catalog results are classified as interactive misses');
  const prompt = getGeminiSystemPrompt();
  assert(prompt.includes('response category'), 'Live Gemini prompt requires a response category');
  assert(prompt.includes('unclear'), 'Live Gemini prompt instructs the assistant to ask for clarification');
  assert(GEMINI_FEW_SHOT_EXEMPLARS.length >= 8, 'Live prompt includes customer-flow examples');
  console.log('🏁 Interactive catalog-miss checks: All Assertions Passed!\n');
}

if (process.argv[1] && process.argv[1].endsWith('test-interactive-not-found.ts')) {
  try {
    runInteractiveNotFoundTests();
    process.exit(0);
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
}
