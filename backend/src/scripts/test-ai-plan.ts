/**
 * Lion Delivery Gemini AI Training & Quality Plan Master Runner
 * Executes every quality suite against a disposable database and Redis DB.
 */

import { spawnSync } from 'child_process';
import { createIsolatedDatabase, dropIsolatedDatabase, isolatedRedisUrl } from './test-isolation.js';

const suites = [
  { name: 'Phase 1: Behavior Contract & Tool Schemas', script: 'src/scripts/test-behavior-contract.ts' },
  { name: 'P0/P1: Customer Conversation Acceptance', script: 'src/scripts/test-conversations.ts' },
  { name: 'Phase 3: AI Telemetry & PII Redaction', script: 'src/scripts/test-telemetry-redaction.ts' },
  { name: 'Phase 4: Dataset Pipeline & Zero-Leakage Splits', script: 'src/scripts/test-dataset-validation.ts' },
  { name: 'Phase 5: Real-Model Evaluation Harness (CI Mode)', script: 'src/scripts/test-evaluator.ts' },
  { name: 'Phase 7: Multilingual Hybrid Catalog Retrieval', script: 'src/scripts/test-catalog-search-quality.ts' },
  { name: 'Phase 8: Voice and Image Disambiguation Evaluation', script: 'src/scripts/test-media-evaluation.ts' },
  { name: 'Phase 9: Management AI Read-Only Intent Router', script: 'src/scripts/test-management-ai.ts' },
  { name: 'Phase 10: Shadow, Canary, and Instant Rollback', script: 'src/scripts/test-shadow-canary.ts' },
  { name: 'Audit: Shadow zero-mutation boundary', script: 'src/scripts/test-shadow-immutability.ts' },
  { name: 'Audit: Evaluator safety and exact typing', script: 'src/scripts/test-evaluator-safety.ts' },
  { name: 'Audit: Interactive catalog misses and clarification', script: 'src/scripts/test-interactive-not-found.ts' },
  { name: 'Audit: Sender-language response consistency', script: 'src/scripts/test-language-consistency.ts' },
];

function runChild(script: string, env: NodeJS.ProcessEnv) {
  return spawnSync('npx', ['tsx', script], {
    stdio: 'inherit',
    shell: true,
    env,
    cwd: process.cwd(),
  });
}

async function main() {
  console.log('Lion Delivery Gemini AI Training & Quality Plan Master Runner');
  console.log('Every suite runs in a disposable MySQL database and Redis DB 15.');

  const databaseName = await createIsolatedDatabase();
  const testEnv: NodeJS.ProcessEnv = {
    ...process.env,
    NODE_ENV: 'test',
    DB_NAME: databaseName,
    REDIS_URL: isolatedRedisUrl(),
  };
  let allPassed = true;
  const results: { name: string; ok: boolean; durationMs: number }[] = [];

  try {
    console.log('Using isolated test database ' + databaseName + ' and Redis DB 15');
    const seed = runChild('src/scripts/seed-demo.ts', testEnv);
    if (seed.status !== 0) {
      throw new Error('Unable to seed isolated test database');
    }

    for (const suite of suites) {
      console.log('Running ' + suite.name + '...');
      const start = Date.now();
      const result = runChild(suite.script, testEnv);
      const durationMs = Date.now() - start;
      const ok = result.status === 0;
      results.push({ name: suite.name, ok, durationMs });
      if (!ok) allPassed = false;
      console.log('');
    }

    console.log('Gemini AI Training & Quality Plan Summary:');
    for (const result of results) {
      console.log(
        '  ' +
          (result.ok ? 'PASS' : 'FAIL') +
          ' ' +
          result.name +
          ' (' +
          (result.durationMs / 1000).toFixed(2) +
          's)',
      );
    }
    console.log(
      allPassed
        ? 'ALL ' + suites.length + ' AI TRAINING & QUALITY SUITES PASSED CLEANLY (100%)!'
        : 'One or more AI training plan suites failed.',
    );
  } finally {
    await dropIsolatedDatabase(databaseName);
    console.log('Removed isolated test database ' + databaseName);
  }

  process.exit(allPassed ? 0 : 1);
}

main().catch((error) => {
  console.error('Fatal isolated test runner error:', error);
  process.exit(1);
});
