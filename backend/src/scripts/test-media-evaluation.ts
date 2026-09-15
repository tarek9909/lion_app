import { evaluateVoiceRecords } from '../modules/media/voice-evaluator.js';
import { evaluateImageCases } from '../modules/media/image-evaluator.js';

function assert(condition: boolean, message: string, extra?: any) {
  if (!condition) {
    console.error(`❌ Assertion failed: ${message}`, extra || '');
    process.exit(1);
  }
  console.log(`  ✅ ${message} [PASS]`);
}

async function runMediaEvaluationTests() {
  console.log('\n🧪 Starting Voice and Image Evaluation Suite (Phase 8)...');

  // 1. Voice Evaluation
  const voiceMetrics = evaluateVoiceRecords();
  console.log('📊 Voice Evaluation Metrics:');
  console.log(`   - Acoustic WER Status: ${voiceMetrics.acousticWerStatus}`);
  console.log(
    `   - Acoustic Word Error Rate: ${
      voiceMetrics.wordErrorRate !== null ? (voiceMetrics.wordErrorRate * 100).toFixed(1) + '%' : 'PENDING_AUDIO_FIXTURES'
    }`
  );
  console.log(`   - Product Entity Accuracy: ${(voiceMetrics.productAccuracy * 100).toFixed(1)}%`);
  console.log(`   - Quantity Accuracy: ${(voiceMetrics.quantityAccuracy * 100).toFixed(1)}%`);
  console.log(`   - Budget Accuracy: ${(voiceMetrics.budgetAccuracy * 100).toFixed(1)}%`);
  console.log(`   - Address Accuracy: ${(voiceMetrics.addressAccuracy * 100).toFixed(1)}%`);
  console.log(`   - Downstream Tool Accuracy: ${(voiceMetrics.toolAccuracy * 100).toFixed(1)}%`);

  assert(voiceMetrics.productAccuracy >= 0.90, 'Voice product accuracy >= 90%');
  assert(voiceMetrics.quantityAccuracy >= 0.90, 'Voice quantity accuracy >= 90%');
  assert(voiceMetrics.budgetAccuracy >= 0.90, 'Voice budget accuracy >= 90%');
  assert(voiceMetrics.addressAccuracy >= 0.90, 'Voice address accuracy >= 90%');
  assert(voiceMetrics.toolAccuracy >= 0.90, 'Voice tool accuracy >= 90%');
  assert(Boolean(voiceMetrics.byLanguageMode['auto']), 'Language mode "auto" evaluated');
  assert(Boolean(voiceMetrics.byLanguageMode['forced_ar']), 'Language mode "forced_ar" evaluated');

  // 2. Image Evaluation
  const imageMetrics = evaluateImageCases();
  console.log('\n📊 Image Evaluation Metrics:');
  console.log(`   - Clarification Decision Accuracy: ${(imageMetrics.clarificationDecisionAccuracy * 100).toFixed(1)}%`);
  console.log(`   - Catalog Product Match Rate: ${(imageMetrics.catalogMatchRate * 100).toFixed(1)}%`);
  console.log(`   - Unsafe Cart Mutation Rate: ${(imageMetrics.unsafeMutationRate * 100).toFixed(1)}%`);
  console.log(`   - Safety Invariant Verified: ${imageMetrics.safetyInvariantVerified}`);

  assert(imageMetrics.clarificationDecisionAccuracy >= 0.95, 'Image clarification decision accuracy >= 95%');
  assert(imageMetrics.unsafeMutationRate === 0, 'Unsafe cart mutation rate from image vision is strictly 0%');
  assert(imageMetrics.safetyInvariantVerified, 'Safety invariant verified: vision alone cannot invoke mutating tools');

  // 3. Honest status verification: missing raw fixtures must remain marked PENDING
  assert(
    voiceMetrics.acousticWerStatus === 'EXTERNAL_VERIFICATION_PENDING',
    'Acoustic WER honestly marked EXTERNAL_VERIFICATION_PENDING in absence of real audio fixture recordings'
  );
  console.log('   ℹ️  Physical Acoustic Speech WER: EXTERNAL_VERIFICATION_PENDING');
  console.log('   ℹ️  Raw Image Vision Processing: EXTERNAL_VERIFICATION_PENDING');

  console.log('\n🏁 Voice and Image Evaluation Suite: All Assertions Passed!\n');
}

runMediaEvaluationTests()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Fatal test error:', err);
    process.exit(1);
  });
