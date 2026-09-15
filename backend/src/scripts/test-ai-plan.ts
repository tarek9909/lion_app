/**
 * Lion Delivery Gemini AI Training & Quality Plan Master Runner
 * Executes all 8 quality suites covering Phases 1 through 10.
 */

import { spawnSync } from 'child_process';

const suites = [
  { name: 'Phase 1: Behavior Contract & Tool Schemas', script: 'src/scripts/test-behavior-contract.ts' },
  { name: 'Phase 3: AI Telemetry & PII Redaction', script: 'src/scripts/test-telemetry-redaction.ts' },
  { name: 'Phase 4: Dataset Pipeline & Zero-Leakage Splits', script: 'src/scripts/test-dataset-validation.ts' },
  { name: 'Phase 5: Real-Model Evaluation Harness (CI Mode)', script: 'src/scripts/test-evaluator.ts' },
  { name: 'Phase 7: Multilingual Hybrid Catalog Retrieval', script: 'src/scripts/test-catalog-search-quality.ts' },
  { name: 'Phase 8: Voice and Image Disambiguation Evaluation', script: 'src/scripts/test-media-evaluation.ts' },
  { name: 'Phase 9: Management AI Read-Only Intent Router', script: 'src/scripts/test-management-ai.ts' },
  { name: 'Phase 10: Shadow, Canary, and Instant Rollback', script: 'src/scripts/test-shadow-canary.ts' },
];

console.log('════════════════════════════════════════════════════════════');
console.log('🦁 Lion Delivery Gemini AI Training & Quality Plan Master Runner');
console.log('════════════════════════════════════════════════════════════\n');

let allPassed = true;
const results: { name: string; ok: boolean; durationMs: number }[] = [];

for (const suite of suites) {
  console.log(`▶ Running ${suite.name}...`);
  const start = Date.now();
  const res = spawnSync('npx', ['tsx', suite.script], { stdio: 'inherit', shell: true });
  const durationMs = Date.now() - start;
  const ok = res.status === 0;
  results.push({ name: suite.name, ok, durationMs });
  if (!ok) allPassed = false;
  console.log('');
}

console.log('════════════════════════════════════════════════════════════');
console.log('📋 Gemini AI Training & Quality Plan Summary:');
console.log('════════════════════════════════════════════════════════════');

for (const r of results) {
  console.log(`  ${r.ok ? '✅' : '❌'} ${r.name} (${(r.durationMs / 1000).toFixed(2)}s)`);
}

console.log('════════════════════════════════════════════════════════════');
if (allPassed) {
  console.log('🏆 ALL 8 AI TRAINING & QUALITY SUITES PASSED CLEANLY (100%)!');
  process.exit(0);
} else {
  console.error('❌ One or more AI training plan suites failed.');
  process.exit(1);
}
