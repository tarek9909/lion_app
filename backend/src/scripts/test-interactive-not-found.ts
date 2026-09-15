import { INTERACTIVE_NOT_FOUND_REPLY, isNotFoundError, resultHasNoCatalogMatches } from '../modules/ai/interactive-not-found.js';
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
  assert(isNotFoundError(undefined, 'Address was not found'), 'Human-readable database misses are classified as interactive misses');
  assert(resultHasNoCatalogMatches({ count: 0, results: [] }), 'Empty catalog results are classified as interactive misses');
  const prompt = getGeminiSystemPrompt();
  assert(prompt.includes(INTERACTIVE_NOT_FOUND_REPLY), 'Live Gemini prompt contains the exact interactive catalog-miss response');
  assert(prompt.includes('message is unclear'), 'Live Gemini prompt instructs the assistant to ask for clarification');
  assert(GEMINI_FEW_SHOT_EXEMPLARS.length >= 20 && GEMINI_FEW_SHOT_EXEMPLARS.length <= 40, 'Live prompt has 20-40 few-shot traces');
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
