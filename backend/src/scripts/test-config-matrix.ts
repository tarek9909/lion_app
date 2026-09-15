import assert from 'assert';
import { shadowCanaryRouter, RoutingMode } from '../modules/ai/routing/shadow-canary.service.js';
import { validateStartupConfig } from '../config/env.js';
import { config } from '../config/env.js';

export async function runConfigMatrixTests() {
  console.log('\n🧪 Starting AI Router & Configuration Matrix Regression Tests (Area A)...');

  const originalRouterConfig = shadowCanaryRouter.getConfig();
  const originalEnvAi = { ...config.ai };

  try {
    // -------------------------------------------------------------
    // Test 1: Startup Credential Validation Matrix
    // -------------------------------------------------------------
    console.log('  Testing startup credential validation matrix...');

    // 1a: STABLE_ONLY with smart_nlu requires NO Gemini key
    assert.doesNotThrow(() => {
      validateStartupConfig({
        whatsapp: { mode: 'MOCK' },
        media: { mode: 'FIXTURE' },
        ai: {
          routingMode: 'STABLE_ONLY',
          stableProvider: 'smart_nlu',
          candidateProvider: 'gemini',
          geminiApiKey: undefined,
        },
      });
    }, 'STABLE_ONLY with smart_nlu starts cleanly without Gemini credentials');
    console.log('  ✅ STABLE_ONLY with smart_nlu passes startup validation without Gemini key [PASS]');

    // 1b: STABLE_ONLY with gemini REQUIRES valid Gemini key
    assert.throws(() => {
      validateStartupConfig({
        whatsapp: { mode: 'MOCK' },
        media: { mode: 'FIXTURE' },
        ai: {
          routingMode: 'STABLE_ONLY',
          stableProvider: 'gemini',
          candidateProvider: 'smart_nlu',
          geminiApiKey: 'placeholder',
        },
      });
    }, /Startup Error.*gemini/, 'STABLE_ONLY with gemini throws if GEMINI_API_KEY is placeholder');
    console.log('  ✅ STABLE_ONLY with gemini rejects missing/placeholder key at startup [PASS]');

    // 1c: CANDIDATE_ONLY with gemini REQUIRES valid Gemini key
    assert.throws(() => {
      validateStartupConfig({
        whatsapp: { mode: 'MOCK' },
        media: { mode: 'FIXTURE' },
        ai: {
          routingMode: 'CANDIDATE_ONLY',
          stableProvider: 'smart_nlu',
          candidateProvider: 'gemini',
          geminiApiKey: 'demo_key',
        },
      });
    }, /Startup Error.*CANDIDATE_ONLY/, 'CANDIDATE_ONLY with gemini throws if key is placeholder');
    console.log('  ✅ CANDIDATE_ONLY with gemini rejects missing/placeholder key at startup [PASS]');

    // 1d: SHADOW mode with missing candidate key fails safe (warns but does not crash startup)
    assert.doesNotThrow(() => {
      validateStartupConfig({
        whatsapp: { mode: 'MOCK' },
        media: { mode: 'FIXTURE' },
        ai: {
          routingMode: 'SHADOW',
          stableProvider: 'smart_nlu',
          candidateProvider: 'gemini',
          geminiApiKey: undefined,
        },
      });
    }, 'SHADOW mode with missing candidate key fails safe without throwing');
    console.log('  ✅ SHADOW mode with missing candidate key fails safely at startup [PASS]');

    // -------------------------------------------------------------
    // 1e: production never starts on the deterministic fallback provider
    assert.throws(() => {
      validateStartupConfig({
        nodeEnv: 'production',
        whatsapp: { mode: 'MOCK' },
        media: { mode: 'FIXTURE' },
        ai: {
          routingMode: 'STABLE_ONLY',
          stableProvider: 'smart_nlu',
          candidateProvider: 'gemini',
          geminiApiKey: undefined,
        },
      });
    }, /Gemini-only/, 'production rejects Smart NLU routing');
    console.log('  Production routing is Gemini-only [PASS]');

    // Test 2: Runtime Router Behavior Across All Modes
    // -------------------------------------------------------------
    console.log('  Testing router execution matrix across all 4 modes...');

    let stableCalls = 0;
    const mockStableProcessor = async (phone: string, msg: string) => {
      stableCalls++;
      return {
        replyText: `Stable reply for ${phone}: ${msg}`,
        intent: 'SEARCH_PRODUCTS' as any,
        confidence: 0.99,
      };
    };

    // 2a: STABLE_ONLY
    shadowCanaryRouter.configure({
      routingMode: 'STABLE_ONLY',
      stableProvider: 'smart_nlu',
      candidateProvider: 'gemini',
      canaryPercentage: 0,
    });
    stableCalls = 0;
    const stableRes = await shadowCanaryRouter.routeCustomerMessage(
      '96170111222',
      'bade burger',
      'text',
      mockStableProcessor
    );
    assert.strictEqual(stableRes.executionMode, 'LIVE');
    assert.strictEqual(stableRes.shadowRan, false);
    assert.strictEqual(stableCalls, 1);
    console.log('  ✅ STABLE_ONLY routes strictly to stable processor [PASS]');

    // 2b: CANARY with 0% canary
    shadowCanaryRouter.configure({
      routingMode: 'CANARY',
      stableProvider: 'smart_nlu',
      candidateProvider: 'gemini',
      canaryPercentage: 0,
    });
    stableCalls = 0;
    const canary0Res = await shadowCanaryRouter.routeCustomerMessage(
      '96170111222',
      'bade burger',
      'text',
      mockStableProcessor
    );
    assert.strictEqual(canary0Res.executionMode, 'LIVE');
    assert.strictEqual(stableCalls, 1);
    console.log('  ✅ CANARY (0%) routes 100% to stable processor [PASS]');

    // 2c: CANARY with missing candidate credentials fails safely to stable
    config.ai.geminiApiKey = 'placeholder';
    shadowCanaryRouter.configure({
      routingMode: 'CANARY',
      stableProvider: 'smart_nlu',
      candidateProvider: 'gemini',
      canaryPercentage: 100, // Eligible, but lacks key
    });
    stableCalls = 0;
    const canaryFallbackRes = await shadowCanaryRouter.routeCustomerMessage(
      '96170111222',
      'bade burger',
      'text',
      mockStableProcessor
    );
    assert.strictEqual(canaryFallbackRes.executionMode, 'LIVE');
    assert.strictEqual(stableCalls, 1);
    console.log('  ✅ CANARY with missing candidate credentials falls back safely to stable [PASS]');

    // 2d: SHADOW mode with missing candidate credentials executes stable and skips shadow
    shadowCanaryRouter.configure({
      routingMode: 'SHADOW',
      stableProvider: 'smart_nlu',
      candidateProvider: 'gemini',
      canaryPercentage: 0,
    });
    stableCalls = 0;
    const shadowNoKeyRes = await shadowCanaryRouter.routeCustomerMessage(
      '96170111222',
      'bade burger',
      'text',
      mockStableProcessor
    );
    assert.strictEqual(shadowNoKeyRes.executionMode, 'LIVE');
    assert.strictEqual(shadowNoKeyRes.shadowRan, false);
    assert.strictEqual(stableCalls, 1);
    console.log('  ✅ SHADOW mode with missing candidate key runs stable and skips shadow [PASS]');

    // 2e: Rollback to stable
    shadowCanaryRouter.rollbackToStable();
    const currentConf = shadowCanaryRouter.getConfig();
    assert.strictEqual(currentConf.routingMode, 'STABLE_ONLY');
    assert.strictEqual(currentConf.canaryPercentage, 0);
    console.log('  ✅ rollbackToStable resets to STABLE_ONLY with 0% canary [PASS]');

    console.log('\n🏁 AI Configuration Matrix Tests: All Assertions Passed!\n');
    return true;
  } finally {
    shadowCanaryRouter.configure(originalRouterConfig);
    config.ai = originalEnvAi;
  }
}

if (process.argv[1]?.endsWith('test-config-matrix.ts') || process.argv[1]?.endsWith('test-config-matrix.js')) {
  runConfigMatrixTests()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Fatal configuration matrix error:', err);
      process.exit(1);
    });
}
