import { createIsolatedDatabase, dropIsolatedDatabase, isolatedRedisUrl } from './test-isolation.js';
import { switchDatabase } from '../database/db.js';
import { config } from '../config/env.js';

async function runAllSuites() {
  const [
    { runApiTests },
    { runWebhookTests },
    { runWebSocketTests },
    { runFailureAndRetryTests },
    { runConversationTestPack },
    { runConsecutiveRehearsals },
    { runBackupDemoScenario },
    { runConfigMatrixTests },
    { runGeminiIntegrationTests },
    { runDemoGapTests },
    { runAiEdgeCaseTests },
    { runShadowImmutabilityTests },
    { runEvaluatorSafetyTests },
    { runInteractiveNotFoundTests },
    { runLanguageConsistencyTests },
  ] = await Promise.all([
    import('./test-api.js'),
    import('./test-webhook.js'),
    import('./test-websocket.js'),
    import('./test-failures.js'),
    import('./test-conversations.js'),
    import('./test-rehearsal.js'),
    import('./demo-backup-scenario.js'),
    import('./test-config-matrix.js'),
    import('./test-gemini.js'),
    import('./test-demo-gaps.js'),
    import('./test-ai-edgecases.js'),
    import('./test-shadow-immutability.js'),
    import('./test-evaluator-safety.js'),
    import('./test-interactive-not-found.js'),
    import('./test-language-consistency.js'),
  ]);

  console.log('════════════════════════════════════════════════════════════');
  console.log('🦁 Lion Delivery Master Integration Test Runner');
  console.log('════════════════════════════════════════════════════════════\n');

  const start = Date.now();
  const results: { name: string; ok: boolean }[] = [];

  // Suite 1: HTTP API & Auth
  console.log('▶ [1/15] Running HTTP API & Auth Integration Suite...');
  const apiOk = await runApiTests();
  results.push({ name: 'HTTP API & Auth', ok: apiOk });

  // Suite 2: Webhooks, HMAC & Media
  console.log('\n▶ [2/15] Running Webhook, HMAC & Media Suite...');
  const webhookOk = await runWebhookTests();
  results.push({ name: 'WhatsApp Webhooks & Media', ok: webhookOk });

  // Suite 3: WebSockets & Live Broadcasting
  console.log('\n▶ [3/15] Running WebSockets & Live Broadcasting Suite...');
  const wsOk = await runWebSocketTests();
  results.push({ name: 'WebSockets & Live Events', ok: wsOk });

  // Suite 4: Failures, State Validation & Idempotency
  console.log('\n▶ [4/15] Running Failures & State Machine Suite...');
  const failOk = await runFailureAndRetryTests();
  results.push({ name: 'Failures & State Transitions', ok: failOk });

  // Suite 5: AI Conversational 15 Scenarios
  console.log('\n▶ [5/15] Running 15-Scenario Conversational AI Suite...');
  const convOk = await runConversationTestPack();
  results.push({ name: 'AI 15-Scenario Pack', ok: convOk });

  // Suite 6: Full Client Demo Rehearsal (3 consecutive runs)
  console.log('\n▶ [6/15] Running Full Client Demo 3x Consecutive Rehearsal...');
  const rehearsalOk = await runConsecutiveRehearsals(3);
  results.push({ name: 'Full Demo 3x Rehearsal', ok: rehearsalOk });

  // Suite 7: Resilient Backup Demo Scenario
  console.log('\n▶ [7/15] Running Backup Re-route Demo Scenario...');
  const backupOk = await runBackupDemoScenario();
  results.push({ name: 'Backup Demo Re-route Scenario', ok: backupOk });

  // Suite 8: Configuration & Provider Matrix (G-061, G-062, G-065)
  console.log('\n▶ [8/15] Running Configuration & Provider Matrix Suite (G-061, G-062, G-065)...');
  const matrixOk = await runConfigMatrixTests();
  results.push({ name: 'Config & Provider Matrix (G-061, G-062, G-065)', ok: matrixOk });

  // Suite 9: Gemini 3.8 Flash Integration
  console.log('\n▶ [9/15] Running Gemini 3.8 Flash Integration Suite...');
  const geminiOk = await runGeminiIntegrationTests();
  results.push({ name: 'Gemini 3.8 Flash Integration', ok: geminiOk });

  // Suite 10: New demo audit gap regressions (DG-001–DG-008)
  console.log('\n▶ [10/15] Running Demo Gap Regression Suite (DG-001–DG-008)...');
  const demoGapOk = await runDemoGapTests();
  results.push({ name: 'Demo Gap Regressions (DG-001–DG-008)', ok: demoGapOk });
  console.log('\n▶ [11/15] Running AI Flow Edge-Case Regression Suite...');
  const aiEdgeOk = await runAiEdgeCaseTests();
  results.push({ name: 'AI Flow Edge Cases', ok: aiEdgeOk });

  console.log('\n[12/15] Running Shadow Zero-Mutation Boundary Suite...');
  let shadowImmutableOk = true;
  try {
    await runShadowImmutabilityTests();
  } catch (error) {
    shadowImmutableOk = false;
    console.error(error);
  }
  results.push({ name: 'Shadow Zero-Mutation Boundary', ok: shadowImmutableOk });

  console.log('\n[13/15] Running Evaluator Safety & Exact-Typing Suite...');
  let evaluatorSafetyOk = true;
  try {
    await runEvaluatorSafetyTests();
  } catch (error) {
    evaluatorSafetyOk = false;
    console.error(error);
  }
  results.push({ name: 'Evaluator Safety & Exact Typing', ok: evaluatorSafetyOk });

  console.log('\n[14/15] Running Interactive Not-Found & Clarification Suite...');
  let interactiveNotFoundOk = true;
  try {
    runInteractiveNotFoundTests();
  } catch (error) {
    interactiveNotFoundOk = false;
    console.error(error);
  }
  results.push({ name: 'Interactive Not-Found & Clarification', ok: interactiveNotFoundOk });

  console.log('\n[15/15] Running Sender-Language Response Consistency Suite...');
  let languageConsistencyOk = true;
  try {
    runLanguageConsistencyTests();
  } catch (error) {
    languageConsistencyOk = false;
    console.error(error);
  }
  results.push({ name: 'Sender-Language Response Consistency', ok: languageConsistencyOk });

  const elapsed = ((Date.now() - start) / 1000).toFixed(2);

  console.log('\n════════════════════════════════════════════════════════════');
  console.log(`📋 Master Test Summary (${elapsed}s total runtime):`);
  console.log('════════════════════════════════════════════════════════════');

  let allPassed = true;
  for (const r of results) {
    console.log(`  ${r.ok ? '✅' : '❌'} ${r.name}: ${r.ok ? 'PASSED' : 'FAILED'}`);
    if (!r.ok) allPassed = false;
  }

  console.log('════════════════════════════════════════════════════════════');
  if (allPassed) {
    console.log('🏆 ALL 15 TEST SUITES PASSED CLEANLY WITH ZERO FAILURES!');
  } else {
    console.error('❌ One or more test suites failed.');
  }
  return allPassed;
}

async function main() {
  let databaseName: string | undefined;
  const originalDatabase = config.db.database;
  const originalNodeEnv = config.nodeEnv;
  let exitCode = 1;
  try {
    databaseName = await createIsolatedDatabase();
    process.env.NODE_ENV = 'test';
    process.env.DB_NAME = databaseName;
    process.env.REDIS_URL = isolatedRedisUrl();
    config.nodeEnv = 'test';
    // The shared pool is initialized during module loading. Point it at the
    // disposable database before any suite can reset, seed, or query data.
    await switchDatabase(databaseName);
    const { seedDemoData } = await import('./seed-demo.js');
    await seedDemoData();
    exitCode = (await runAllSuites()) ? 0 : 1;
  } catch (err) {
    console.error('Fatal isolated test runner error:', err);
  } finally {
    if (databaseName) {
      await switchDatabase(originalDatabase);
      await dropIsolatedDatabase(databaseName);
      console.log('Removed isolated test database ' + databaseName);
    }
    config.nodeEnv = originalNodeEnv;
  }
  process.exit(exitCode);
}

main().catch((err) => {
  console.error('Fatal test runner error:', err);
  process.exit(1);
});
