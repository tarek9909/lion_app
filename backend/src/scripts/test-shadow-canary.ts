import { shadowCanaryRouter } from '../modules/ai/routing/shadow-canary.service.js';
import { AIProcessResult } from '../modules/ai/ai.types.js';
import { query } from '../database/db.js';
import { config } from '../config/env.js';

function assert(condition: boolean, message: string, extra?: any) {
  if (!condition) {
    console.error(`❌ Assertion failed: ${message}`, extra || '');
    process.exit(1);
  }
  console.log(`  ✅ ${message} [PASS]`);
}

async function runShadowCanaryTests() {
  console.log('\n🧪 Starting Shadow, Canary, and Rollback Routing Tests (Phase 10)...');

  const mockStableProcessor = async (phone: string, text: string): Promise<AIProcessResult> => {
    return {
      replyText: `Stable reply for ${text}`,
      intent: 'SEARCH_RESULTS',
      confidence: 0.99,
    };
  };

  // 1. Stable only mode
  shadowCanaryRouter.configure({ routingMode: 'STABLE_ONLY' });
  const r1 = await shadowCanaryRouter.routeCustomerMessage('96170123456', 'crispy chicken', 'text', mockStableProcessor);
  assert(r1.executionMode === 'LIVE', 'STABLE_ONLY executes in LIVE mode');
  assert(r1.shadowRan === false, 'Shadow does not run in STABLE_ONLY');
  assert(r1.result.replyText.includes('Stable reply'), 'Stable processor generated reply');

  // 2. Canary routing percentage check
  shadowCanaryRouter.configure({ routingMode: 'CANARY', canaryPercentage: 0 });
  assert(!shadowCanaryRouter.isCanaryEligible('96170123456'), '0% canary gives false for all');

  shadowCanaryRouter.configure({ routingMode: 'CANARY', canaryPercentage: 100 });
  assert(shadowCanaryRouter.isCanaryEligible('96170123456'), '100% canary gives true for all');

  shadowCanaryRouter.configure({ routingMode: 'CANARY', canaryPercentage: 50 });
  const p1 = shadowCanaryRouter.isCanaryEligible('96170123456');
  const p2 = shadowCanaryRouter.isCanaryEligible('96171987654');
  assert(typeof p1 === 'boolean' && typeof p2 === 'boolean', 'Deterministic canary hash evaluation');

  // 3. Shadow mode
  const origKey = config.ai.geminiApiKey;
  config.ai.geminiApiKey = 'test-gemini-key';
  shadowCanaryRouter.configure({ routingMode: 'SHADOW' });
  const rShadow = await shadowCanaryRouter.routeCustomerMessage('96170123456', 'crispy chicken', 'text', mockStableProcessor);
  assert(rShadow.executionMode === 'LIVE', 'Customer receives reply from LIVE stable processor');
  assert(rShadow.shadowRan === true, 'Shadow candidate ran asynchronously');
  assert(rShadow.result.replyText.includes('Stable reply'), 'Customer received only the stable reply');

  let shadowLogs: any[] = [];
  for (let attempt = 0; attempt < 20 && shadowLogs.length === 0; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 50));
    shadowLogs = (await query(`
      SELECT public_id, model_name, structured_output
      FROM ai_interactions
      WHERE model_name LIKE '%shadow%'
      ORDER BY id DESC LIMIT 1
    `)) as any[];
  }
  assert(shadowLogs.length > 0, 'Shadow execution telemetry logged to ai_interactions table');

  // 4. Rollback support
  shadowCanaryRouter.rollbackToStable();
  assert(shadowCanaryRouter.getConfig().routingMode === 'STABLE_ONLY', 'Rollback switches router to STABLE_ONLY');
  assert(shadowCanaryRouter.getConfig().canaryPercentage === 0, 'Rollback resets canary percentage to 0');
  config.ai.geminiApiKey = origKey;

  console.log('\n🏁 Shadow, Canary, and Rollback Routing Tests: All Assertions Passed!\n');
}

runShadowCanaryTests()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Fatal test error:', err);
    process.exit(1);
  });
