import { runApiTests } from './test-api.js';
import { runWebhookTests } from './test-webhook.js';
import { runWebSocketTests } from './test-websocket.js';
import { runFailureAndRetryTests } from './test-failures.js';
import { runConversationTestPack } from './test-conversations.js';
import { runConsecutiveRehearsals } from './test-rehearsal.js';
import { runBackupDemoScenario } from './demo-backup-scenario.js';
import { runConfigMatrixTests } from './test-config-matrix.js';
import { runGeminiIntegrationTests } from './test-gemini.js';
import { runDemoGapTests } from './test-demo-gaps.js';

async function runAllSuites() {
  console.log('════════════════════════════════════════════════════════════');
  console.log('🦁 Lion Delivery Master Integration Test Runner');
  console.log('════════════════════════════════════════════════════════════\n');

  const start = Date.now();
  const results: { name: string; ok: boolean }[] = [];

  // Suite 1: HTTP API & Auth
  console.log('▶ [1/10] Running HTTP API & Auth Integration Suite...');
  const apiOk = await runApiTests();
  results.push({ name: 'HTTP API & Auth', ok: apiOk });

  // Suite 2: Webhooks, HMAC & Media
  console.log('\n▶ [2/10] Running Webhook, HMAC & Media Suite...');
  const webhookOk = await runWebhookTests();
  results.push({ name: 'WhatsApp Webhooks & Media', ok: webhookOk });

  // Suite 3: WebSockets & Live Broadcasting
  console.log('\n▶ [3/10] Running WebSockets & Live Broadcasting Suite...');
  const wsOk = await runWebSocketTests();
  results.push({ name: 'WebSockets & Live Events', ok: wsOk });

  // Suite 4: Failures, State Validation & Idempotency
  console.log('\n▶ [4/10] Running Failures & State Machine Suite...');
  const failOk = await runFailureAndRetryTests();
  results.push({ name: 'Failures & State Transitions', ok: failOk });

  // Suite 5: AI Conversational 15 Scenarios
  console.log('\n▶ [5/10] Running 15-Scenario Conversational AI Suite...');
  const convOk = await runConversationTestPack();
  results.push({ name: 'AI 15-Scenario Pack', ok: convOk });

  // Suite 6: Full Client Demo Rehearsal (3 consecutive runs)
  console.log('\n▶ [6/10] Running Full Client Demo 3x Consecutive Rehearsal...');
  const rehearsalOk = await runConsecutiveRehearsals(3);
  results.push({ name: 'Full Demo 3x Rehearsal', ok: rehearsalOk });

  // Suite 7: Resilient Backup Demo Scenario
  console.log('\n▶ [7/10] Running Backup Re-route Demo Scenario...');
  const backupOk = await runBackupDemoScenario();
  results.push({ name: 'Backup Demo Re-route Scenario', ok: backupOk });

  // Suite 8: Configuration & Provider Matrix (G-061, G-062, G-065)
  console.log('\n▶ [8/10] Running Configuration & Provider Matrix Suite (G-061, G-062, G-065)...');
  const matrixOk = await runConfigMatrixTests();
  results.push({ name: 'Config & Provider Matrix (G-061, G-062, G-065)', ok: matrixOk });

  // Suite 9: Gemini 3.8 Flash Integration
  console.log('\n▶ [9/10] Running Gemini 3.8 Flash Integration Suite...');
  const geminiOk = await runGeminiIntegrationTests();
  results.push({ name: 'Gemini 3.8 Flash Integration', ok: geminiOk });

  // Suite 10: New demo audit gap regressions (DG-001–DG-008)
  console.log('\n▶ [10/10] Running Demo Gap Regression Suite (DG-001–DG-008)...');
  const demoGapOk = await runDemoGapTests();
  results.push({ name: 'Demo Gap Regressions (DG-001–DG-008)', ok: demoGapOk });

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
    console.log('🏆 ALL 10 TEST SUITES PASSED CLEANLY WITH ZERO FAILURES!');
    process.exit(0);
  } else {
    console.error('❌ One or more test suites failed.');
    process.exit(1);
  }
}

runAllSuites().catch((err) => {
  console.error('Fatal test runner error:', err);
  process.exit(1);
});
