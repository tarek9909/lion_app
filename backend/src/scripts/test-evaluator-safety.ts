import { deepCompareArguments, modelEvaluator } from '../modules/ai/evaluation/evaluator.js';
import { getAuthoritativeGeminiToolDeclarations } from '../modules/ai/contract/tool-schemas.js';

function assert(condition: boolean, message: string, extra?: any) {
  if (!condition) {
    console.error(`❌ Assertion failed: ${message}`, extra !== undefined ? extra : '');
    process.exit(1);
  }
  console.log(`  ✅ ${message} [PASS]`);
}

async function runEvaluatorSafetyTests() {
  console.log('\n🧪 Starting Area F: Evaluator Hardening & Safety Tests...');

  // 1. Tool Declaration Structure Check (Finding 7.1: Double-wrapping prevention)
  console.log('\n--- Part 1: Verify Single-Wrapped Authoritative Tool Declarations ---');
  const tools = getAuthoritativeGeminiToolDeclarations();
  assert(Array.isArray(tools), 'Tool declarations is an array');
  assert(tools.length === 1, 'Tool declarations has exactly one wrapper object');
  assert(tools[0].functionDeclarations !== undefined, 'Wrapper contains functionDeclarations property');
  assert(Array.isArray(tools[0].functionDeclarations), 'functionDeclarations is an array of function specs');
  assert(
    (tools[0].functionDeclarations[0] as any).functionDeclarations === undefined,
    'functionDeclarations items are NOT double-wrapped'
  );
  assert(
    typeof (tools[0].functionDeclarations[0] as any).name === 'string',
    'First function declaration has direct name property'
  );

  // 2. Recursive Deep Exact Argument Comparison (Finding 7.2)
  console.log('\n--- Part 2: Verify Deep Recursive Exact Argument Matching ---');

  // 2a: Exact match
  const rExact = deepCompareArguments(
    { query: 'crispy chicken', max_budget: 15, options: { spicy: true } },
    { query: 'crispy chicken', max_budget: 15, options: { spicy: true } }
  );
  assert(rExact.match === true, 'Exact object and nested object match');

  // 2b: Missing required key
  const rMissing = deepCompareArguments(
    { query: 'burger', quantity: 2 },
    { query: 'burger' }
  );
  assert(rMissing.match === false, 'Missing argument key rejected');
  assert(Boolean(rMissing.reason?.includes('Missing required argument key')), 'Failure reason specifies missing key');

  // 2c: Extra unrecognized key (strict boundary)
  const rExtra = deepCompareArguments(
    { query: 'burger' },
    { query: 'burger', fake_hack_field: 'injected' }
  );
  assert(rExtra.match === false, 'Extra unrecognized argument key rejected');
  assert(Boolean(rExtra.reason?.includes('Unrecognized extra argument key')), 'Failure reason specifies extra key');

  // 2d: Type mismatch
  const rTypeMismatch = deepCompareArguments(
    { quantity: 5 },
    { quantity: true }
  );
  assert(rTypeMismatch.match === false, 'Type mismatch rejected');
  assert(Boolean(rTypeMismatch.reason?.includes('Type mismatch')), 'Failure reason specifies type mismatch');


  // 2e: Array mismatch
  const rArrayMismatch = deepCompareArguments(
    { items: ['coke', 'fries'] },
    { items: ['coke', 'burger'] }
  );
  assert(rArrayMismatch.match === false, 'Array item mismatch rejected');

  // 3. API Error Reporting Check (Status must be FAILED, never COMPLETED on error)
  console.log('\n--- Part 3: Verify Honest Error Status Reporting on 503 / Network Failure ---');
  const mockRecord: any = {
    id: 'test-rec-1',
    conversation_id: 'conv-1',
    split: 'core_dialogue',
    customer_message: 'bade 2 crispy',
    expected_tool: 'add_to_cart',
    expected_tool_arguments: { quantity: 2 },
    language: 'arabizi',
    intent: 'ADD_TO_CART',
  };

  // Mock global fetch to simulate 503 capacity limit
  const origFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        error: {
          code: 503,
          message: 'No capacity available for model gemini-3.8-flash-high on the server',
          status: 'UNAVAILABLE',
        },
      }),
      { status: 503, headers: { 'Content-Type': 'application/json' } }
    );

  try {
    const report = await modelEvaluator.evaluate([mockRecord], {
      mode: 'REAL_GEMINI',
      geminiApiKey: 'test-api-key',
      modelName: 'gemini-3.8-flash-high',
    });

    assert(
      report.status === 'FAILED',
      `Evaluator reported status 'FAILED' on HTTP 503 (got: '${report.status}')`
    );
    assert(
      report.turnResults[0].errors.some((e) => e.includes('503') || e.includes('Gemini API error')),
      'Turn results captured the 503 error message'
    );
  } finally {
    globalThis.fetch = origFetch;
  }

  // 4. Measured Exactly-Once Order Rate
  console.log('\n--- Part 4: Verify Measured Exactly-Once Order Rate ---');
  const mockConfirmRecords: any[] = [
    {
      id: 'confirm-1',
      conversation_id: 'conv-1',
      split: 'core_dialogue',
      customer_message: 'yes confirm',
      expected_tool: 'confirm_and_create_order',
      expected_tool_arguments: { confirmation_phrase: 'yes confirm' },
      language: 'en',
      intent: 'CONFIRM_ORDER',
    },
  ];

  const mockReport = await modelEvaluator.evaluate(mockConfirmRecords, {
    mode: 'DETERMINISTIC_MOCK',
  });

  assert(
    mockReport.metrics.confirmedOrderExactlyOnceRate === 1.0,
    'Confirmed order exactly-once rate correctly computed for successful confirmation'
  );

  console.log('\n🏁 Area F: Evaluator Hardening & Safety Tests: All Assertions Passed!\n');
}

runEvaluatorSafetyTests()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Fatal evaluator safety test error:', err);
    process.exit(1);
  });
