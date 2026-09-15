import { generateAllDatasets } from '../modules/ai/dataset/dataset-builder.js';
import { validateDatasets } from '../modules/ai/dataset/dataset-validator.js';
import fs from 'fs';
import os from 'os';
import path from 'path';

function assert(condition: boolean, message: string, extra?: any) {
  if (!condition) {
    console.error(`❌ Assertion failed: ${message}`, extra || '');
    process.exit(1);
  }
  console.log(`  ✅ ${message} [PASS]`);
}

async function runDatasetValidationTests() {
  console.log('\n🧪 Starting Dataset Pipeline & Leakage Tests (Phase 4)...');

  // 1. Generate datasets in a disposable directory so CI cannot rewrite the
  // shared demo release artifact.
  const isolatedDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lion-dataset-test-'));
  generateAllDatasets(isolatedDir);
  fs.mkdirSync(path.join(isolatedDir, 'schemas'), { recursive: true });
  fs.copyFileSync(
    path.resolve(process.cwd(), '../datasets/v1/schemas/turn-schema.json'),
    path.join(isolatedDir, 'schemas', 'turn-schema.json')
  );

  // 2. Validate datasets
  const results = validateDatasets(isolatedDir);

  assert(results.totalRecords >= 20, `Total dataset records (${results.totalRecords}) >= 20`);
  assert(results.schemaErrors.length === 0, 'Zero schema validation errors', results.schemaErrors);
  assert(results.leakageViolations.length === 0, 'Zero conversation leakage across splits', results.leakageViolations);

  // 3. Language coverage
  assert(Boolean(results.byLanguage['arabizi']), 'Lebanese Arabizi represented in dataset');
  assert(Boolean(results.byLanguage['ar_lb']), 'Lebanese Arabic script represented in dataset');
  assert(Boolean(results.byLanguage['ar']), 'Standard Arabic represented in dataset');
  assert(Boolean(results.byLanguage['en']), 'English represented in dataset');
  assert(Boolean(results.byLanguage['mixed']), 'Code-switched mixed language represented in dataset');

  // 4. Intent coverage
  assert(Boolean(results.byIntent['SEARCH_PRODUCTS']), 'SEARCH_PRODUCTS intent represented');
  assert(Boolean(results.byIntent['ADD_TO_CART']), 'ADD_TO_CART intent represented');
  assert(Boolean(results.byIntent['UPDATE_VARIANT']), 'UPDATE_VARIANT intent represented');
  assert(Boolean(results.byIntent['SELECT_ADDRESS']), 'SELECT_ADDRESS intent represented');
  assert(Boolean(results.byIntent['CONFIRM_ORDER']), 'CONFIRM_ORDER intent represented');

  // 5. Locked safety split exists
  assert(Boolean(results.bySplit['locked_safety']), 'Dedicated locked safety split exists and is populated');

  // 6. Provenance and review integrity
  assert(results.humanReviewIntegrityErrors.length === 0, 'Zero human review integrity errors (no synthetic record claims human approval)');

  // 7. Honest external review target tracking
  assert(results.humanReviewTargetStatus.includes('PENDING_HUMAN_REVIEW'), 'Target of 3,000-5,000 human-reviewed turns honestly marked PENDING_HUMAN_REVIEW');
  console.log(`  ℹ️  Human Review Target Status: ${results.humanReviewTargetStatus}`);

  console.log('\n🏁 Dataset Pipeline & Leakage Tests: All Assertions Passed!\n');
  fs.rmSync(isolatedDir, { recursive: true, force: true });
}

runDatasetValidationTests()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Fatal test error:', err);
    process.exit(1);
  });
