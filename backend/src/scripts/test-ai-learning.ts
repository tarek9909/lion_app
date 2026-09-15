import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { v4 as uuidv4 } from 'uuid';
import { execute, pool } from '../database/db.js';
import { customerMemoryService } from '../modules/ai/memory/customer-memory.service.js';
import { conversationHarvesterService, RawConversationTurn } from '../modules/ai/dataset/conversation-harvester.service.js';
import { getGeminiSystemPrompt } from '../modules/ai/prompts/gemini.system-prompt.js';
import { exportGeminiFineTuningJsonl } from '../modules/ai/dataset/dataset-builder.js';

async function ensureTestCustomerAndConv(customerId: number, convId: number) {
  try {
    await execute(
      `INSERT INTO customers (id, public_id, whatsapp_number, display_name, status, created_at, updated_at)
       VALUES (?, ?, '+96170123456', 'Test 77', 'ACTIVE', NOW(), NOW())
       ON DUPLICATE KEY UPDATE status = 'ACTIVE'`,
      [customerId, uuidv4()]
    );
    await execute(
      `INSERT INTO conversations (id, public_id, customer_id, channel, status, created_at, updated_at)
       VALUES (?, ?, ?, 'WHATSAPP', 'ACTIVE', NOW(), NOW())
       ON DUPLICATE KEY UPDATE status = 'ACTIVE'`,
      [convId, uuidv4(), customerId]
    );
  } catch {}
}

async function runAILearningTests() {
  console.log('🧪 Starting AI Continuous Learning & Feedback Loop Test Suite...');

  // --------------------------------------------------------------------------
  // Test 1: Customer Memory Preference Extraction (English, Arabizi, Arabic)
  // --------------------------------------------------------------------------
  console.log('\n--- 1. Testing Customer Preference Extraction ---');

  const englishMessage = 'I want a burger but with no onions and hold the mayo, also make sure it is halal';
  const extractedEng = customerMemoryService.extractPreferencesFromText(englishMessage);
  assert(extractedEng !== null, 'English preferences should be extracted');
  assert(extractedEng.excludedIngredients?.includes('onion'), 'Should detect excluded onion');
  assert(extractedEng.excludedIngredients?.includes('mayonnaise'), 'Should detect excluded mayo');
  assert(extractedEng.dietaryPreferences?.includes('halal'), 'Should detect halal dietary preference');
  console.log('  ✅ English exclusions & dietary preferences extracted correctly [PASS]');

  const arabiziMessage = 'baddi shawarma djej bas bla basel w bala toum';
  const extractedArabizi = customerMemoryService.extractPreferencesFromText(arabiziMessage);
  assert(extractedArabizi !== null, 'Arabizi preferences should be extracted');
  assert(extractedArabizi.excludedIngredients?.includes('onion'), 'Arabizi "bla basel" should map to onion');
  assert(extractedArabizi.excludedIngredients?.includes('garlic'), 'Arabizi "bala toum" should map to garlic');
  console.log('  ✅ Arabizi exclusions (bla basel, bala toum) extracted correctly [PASS]');

  const arabicMessage = 'بدي وجبة برغر بدون مخلل وبلا بصل وخليها نباتي';
  const extractedArabic = customerMemoryService.extractPreferencesFromText(arabicMessage);
  assert(extractedArabic !== null, 'Arabic preferences should be extracted');
  assert(extractedArabic.excludedIngredients?.includes('pickles'), 'Arabic "بدون مخلل" should map to pickles');
  assert(extractedArabic.excludedIngredients?.includes('onion'), 'Arabic "بلا بصل" should map to onion');
  assert(extractedArabic.dietaryPreferences?.includes('vegetarian'), 'Arabic "نباتي" should map to vegetarian');
  console.log('  ✅ Arabic script exclusions & dietary preferences extracted correctly [PASS]');

  const deliveryMessage = "Please call when you arrive and don't ring the doorbell";
  const extractedDelivery = customerMemoryService.extractPreferencesFromText(deliveryMessage);
  assert(extractedDelivery !== null, 'Delivery instructions should be extracted');
  assert(
    extractedDelivery.specialInstructions?.some((s) => s.includes('doorbell')),
    'Should extract doorbell instruction'
  );
  console.log('  ✅ Delivery instructions extracted correctly [PASS]');

  // --------------------------------------------------------------------------
  // Test 2: Customer Memory Formatting & Prompt Injection
  // --------------------------------------------------------------------------
  console.log('\n--- 2. Testing Customer Memory Formatting & Prompt Injection ---');

  const testPrefs = {
    customerId: 9991,
    dietaryPreferences: ['halal', 'vegetarian'],
    excludedIngredients: ['onion', 'garlic'],
    favoriteCuisines: ['lebanese', 'burgers'],
    deliveryLandmarks: [],
    specialInstructions: ['Call upon arrival'],
    allowAiTraining: true,
    memoryItems: [],
  };

  const formattedPrompt = customerMemoryService.formatPreferencesForPrompt(testPrefs);
  assert(formattedPrompt.includes('halal'), 'Formatted text must include dietary preferences');
  assert(formattedPrompt.includes('onion'), 'Formatted text must include excluded ingredients');
  assert(formattedPrompt.includes('Call upon arrival'), 'Formatted text must include delivery instructions');
  console.log('  ✅ Customer preferences formatted cleanly for prompt context [PASS]');

  const systemPrompt = getGeminiSystemPrompt({}, 'en', formattedPrompt);
  assert(systemPrompt.includes('Learned customer memory & preferences:'), 'System prompt must include learned memory block');
  assert(systemPrompt.includes('halal'), 'System prompt must contain memory details');
  console.log('  ✅ Gemini system prompt accurately incorporates customer memory [PASS]');

  // --------------------------------------------------------------------------
  // Test 3: Conversation Harvester Scoring Heuristics
  // --------------------------------------------------------------------------
  console.log('\n--- 3. Testing Conversation Harvester Scoring ---');

  const highQualityTurn: RawConversationTurn = {
    conversationId: 101,
    customerId: 55,
    turnIndex: 3,
    userMessage: 'Perfect, shukran ktir! Please confirm the order.',
    assistantResponse: 'Order #10492 confirmed. Delivering to Abra.',
    orderConverted: true,
    orderStatus: 'CONFIRMED',
    humanHandoff: false,
    hadError: false,
  };
  const highScore = conversationHarvesterService.scoreTurn(highQualityTurn);
  assert(highScore >= 80, `High quality turn score should be >= 80, got ${highScore}`);
  console.log(`  ✅ High-value converted turn scored ${highScore}/100 [PASS]`);

  const handedOffTurn: RawConversationTurn = {
    conversationId: 102,
    customerId: 56,
    turnIndex: 8,
    userMessage: 'This is not working, let me talk to someone.',
    assistantResponse: 'Connecting you to an agent.',
    orderConverted: false,
    orderStatus: 'CANCELLED',
    humanHandoff: true,
    hadError: true,
  };
  const lowScore = conversationHarvesterService.scoreTurn(handedOffTurn);
  assert(lowScore < 50, `Handed-off turn score should be < 50, got ${lowScore}`);
  console.log(`  ✅ Handed-off/failed turn scored ${lowScore}/100 [PASS]`);

  // --------------------------------------------------------------------------
  // Test 4: PII Redaction in Staged Curation Turns
  // --------------------------------------------------------------------------
  console.log('\n--- 4. Testing PII Redaction on Harvested Turns ---');

  const sensitiveTurn: RawConversationTurn = {
    conversationId: 201,
    customerId: 77,
    turnIndex: 2,
    userMessage: 'My name is Karim, call my number +961 70 123456 or lat: 33.5635, lng: 35.3720',
    assistantResponse: 'Sure Karim, calling +961 70 123456 now.',
    orderConverted: true,
    orderStatus: 'DELIVERED',
    humanHandoff: false,
    hadError: false,
  };

  await ensureTestCustomerAndConv(77, 201);
  await customerMemoryService.setAITrainingConsent(77, true, 'TEST_CONSENT');
  const staged = await conversationHarvesterService.stageTurnForCuration(sensitiveTurn);
  assert(staged !== null, 'Staged turn must not be null');
  assert(!staged.sanitizedUserMessage.includes('+961 70 123456'), 'Phone number must be redacted');
  assert(!staged.sanitizedUserMessage.includes('33.5635'), 'GPS coordinates must be redacted');
  assert(staged.sanitizedUserMessage.includes('[REDACTED_PHONE]'), 'Phone token must be present');
  assert(staged.sanitizedUserMessage.includes('[REDACTED_GPS]'), 'GPS token must be present');
  assert(staged.sanitizedUserMessage.includes('[REDACTED_NAME]'), 'Name token must be present');
  console.log('  ✅ Customer phone, GPS, and sensitive details scrubbed before staging [PASS]');

  // --------------------------------------------------------------------------
  // Test 5: Operator Review Queue & Dataset Generation
  // --------------------------------------------------------------------------
  console.log('\n--- 5. Testing Operator Review & Dataset Generation ---');

  const reviewOk = await conversationHarvesterService.reviewItem(staged.publicId, 'HUMAN_APPROVED', 1, 'Great turn');
  assert(reviewOk, 'Review item should update status');

  const queue = await conversationHarvesterService.getQueue({ reviewStatus: 'HUMAN_APPROVED' });
  const found = queue.find((q) => q.publicId === staged.publicId);
  assert(found !== undefined, 'Approved item should appear in approved queue filter');
  assert.strictEqual(found.reviewStatus, 'HUMAN_APPROVED', 'Review status must be HUMAN_APPROVED');
  console.log('  ✅ Operator review approval workflow verified [PASS]');

  const datasetRecords = conversationHarvesterService.convertToDatasetRecords([found]);
  assert.strictEqual(datasetRecords.length, 1, 'Should convert 1 curation item');
  assert.strictEqual(datasetRecords[0].provenance, 'CUSTOMER_LOG', 'Provenance must be CUSTOMER_LOG');
  assert.strictEqual(datasetRecords[0].human_review_status, 'HUMAN_APPROVED', 'Review status must be HUMAN_APPROVED');
  console.log('  ✅ Curation item converted to DatasetTurnRecord with CUSTOMER_LOG provenance [PASS]');

  // --------------------------------------------------------------------------
  // Test 6: Gemini Fine-Tuning JSONL Export
  // --------------------------------------------------------------------------
  console.log('\n--- 6. Testing Fine-Tuning JSONL Export ---');

  const tempExportDir = path.resolve(process.cwd(), 'datasets/test_export');
  const exportResult = exportGeminiFineTuningJsonl(datasetRecords, tempExportDir);

  assert(fs.existsSync(exportResult.trainPath), 'Train JSONL file must exist');
  assert(fs.existsSync(exportResult.valPath), 'Val JSONL file must exist');

  // Verify format of generated JSONL
  const totalCount = exportResult.trainCount + exportResult.valCount;
  assert.strictEqual(totalCount, 1, 'Total exported records should match');

  const targetFile = exportResult.trainCount > 0 ? exportResult.trainPath : exportResult.valPath;
  const line = fs.readFileSync(targetFile, 'utf8').trim();
  const parsed = JSON.parse(line);
  assert(Array.isArray(parsed.messages), 'Line must have messages array');
  assert.strictEqual(parsed.messages[0].role, 'user', 'First message must be role: user');
  assert.strictEqual(parsed.messages[1].role, 'model', 'Second message must be role: model');
  console.log('  ✅ Gemini fine-tuning JSONL exported and schema verified [PASS]');

  // Clean up test export directory
  fs.rmSync(tempExportDir, { recursive: true, force: true });

  // Clean up database test rows
  try {
    await execute('DELETE FROM training_curation_queue WHERE conversation_id = 201 OR customer_id = 77');
    await execute('DELETE FROM conversations WHERE id = 201');
    await execute('DELETE FROM customer_preferences WHERE customer_id = 77');
    await execute('DELETE FROM customers WHERE id = 77');
  } catch {}

  console.log('\n🎉 ALL AI Continuous Learning & Feedback Loop Tests PASSED!\n');
  await pool.end();
  process.exit(0);
}

runAILearningTests().catch(async (err) => {
  console.error('\n❌ AI Continuous Learning test failure:', err);
  try {
    await execute('DELETE FROM training_curation_queue WHERE conversation_id = 201 OR customer_id = 77');
    await execute('DELETE FROM conversations WHERE id = 201');
    await execute('DELETE FROM customer_preferences WHERE customer_id = 77');
    await execute('DELETE FROM customers WHERE id = 77');
    await pool.end();
  } catch {}
  process.exit(1);
});
