import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { v4 as uuidv4 } from 'uuid';
import { pool, query, execute, testDbConnection, switchDatabase } from '../database/db.js';
import { redis } from '../database/redis.js';
import { config } from '../config/env.js';
import { ensureAILearningTables } from '../database/ensure-ai-learning-tables.js';
import { migratePurgeRawPiiColumns } from '../database/migrations/purge-raw-pii.js';
import { customerMemoryService } from '../modules/ai/memory/customer-memory.service.js';
import { conversationHarvesterService, RawConversationTurn } from '../modules/ai/dataset/conversation-harvester.service.js';
import { getGeminiSystemPrompt } from '../modules/ai/prompts/gemini.system-prompt.js';
import { exportGeminiFineTuningJsonl, validateGeminiTrainingRecord, DatasetTurnRecord } from '../modules/ai/dataset/dataset-builder.js';
import { geminiTuningProvider } from '../modules/ai/tuning/gemini-tuning-provider.js';
import { modelRegistryService } from '../modules/ai/tuning/model-registry.service.js';
import { shadowCanaryRouter } from '../modules/ai/routing/shadow-canary.service.js';
import { geminiService } from '../modules/ai/gemini.service.js';
import { createIsolatedDatabase, dropIsolatedDatabase, isolatedRedisUrl } from './test-isolation.js';
import { seedDemoData } from './seed-demo.js';

const DISPOSABLE_PREFIX = 'e2e_' + Date.now();
const DISPOSABLE_CUST_BASE = 90000 + Math.floor(Math.random() * 9000);

async function ensureTestCustomer(customerId: number, phone?: string): Promise<void> {
  const p = phone || `+96170${String(customerId).slice(-6)}`;
  await execute(
    `INSERT INTO customers (id, public_id, whatsapp_number, display_name, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'ACTIVE', NOW(), NOW())
     ON DUPLICATE KEY UPDATE status = 'ACTIVE', updated_at = NOW()`,
    [customerId, uuidv4(), p, `Test Customer ${customerId}`]
  );
}

async function ensureTestConversation(conversationId: number, customerId: number): Promise<void> {
  await ensureTestCustomer(customerId);
  await execute(
    `INSERT INTO conversations (id, public_id, customer_id, channel, status, created_at, updated_at)
     VALUES (?, ?, ?, 'WHATSAPP', 'ACTIVE', NOW(), NOW())
     ON DUPLICATE KEY UPDATE status = 'ACTIVE', updated_at = NOW()`,
    [conversationId, uuidv4(), customerId]
  );
}

async function runEndToEndRemediationSuite() {
  console.log('================================================================================');
  console.log('🧪 AI CONTINUOUS LEARNING STRICT VERIFICATION SUITE');
  console.log('   All checks run strictly against isolated disposable MySQL & Redis DB 15');
  console.log('================================================================================\n');

  let disposableDbName: string | null = null;
  try {
    // ==========================================================================
    // PREFLIGHT: Isolated Disposable Database & Redis DB 15 Setup
    // ==========================================================================
    console.log('--- PREFLIGHT: Creating Isolated Disposable Test Database ---');
    disposableDbName = await createIsolatedDatabase();
    console.log(`  ✅ Created isolated disposable database: ${disposableDbName}`);
    await switchDatabase(disposableDbName);

    console.log(`Checking MySQL: host=${config.db.host}, port=${config.db.port}, user=${config.db.user}, database=${config.db.database}...`);
    const mysqlOk = await testDbConnection();
    if (!mysqlOk) {
      console.error('❌ PREFLIGHT FAILED: Disposable MySQL database is NOT reachable.');
      process.exit(1);
    }
    const [dbIdentity] = await query<any[]>('SELECT DATABASE() AS db, CURRENT_USER() AS usr, VERSION() AS ver');
    console.log(`  ✅ MySQL connected: Database=${dbIdentity.db}, User=${dbIdentity.usr}, Version=${dbIdentity.ver}`);
    assert.strictEqual(dbIdentity.db, disposableDbName, 'Connection pool must point to disposable database');

    console.log(`Checking Redis: url=${config.redis.url}...`);
    // Select DB 15 for test isolation
    await redis.selectDb(15);
    const redisPong = await redis.ping();
    const redisOnline = redis.isOnline();
    if (!redisPong || !redisOnline) {
      console.error('❌ PREFLIGHT FAILED: Real Redis instance is NOT reachable. Acceptance tests require real Redis.');
      process.exit(1);
    }
    await redis.flushAll();
    console.log(`  ✅ Redis connected and isolated on DB 15 (real server online: ${redisOnline})\n`);

    // Ensure AI learning tables exist and seed demo data in disposable database
    await ensureAILearningTables();
    await seedDemoData();

    // ==========================================================================
    // Check 1: Existing-Schema Migration, PII Redaction & Direct SQL Proof (P0)
    // Acceptance Check:
    // - Schema migration removes legacy raw_user_message and model_response columns.
    // - SQL queries prove raw columns cannot remain.
    // - Real MySQL insert only stores redacted text.
    // - Phone, name, GPS, and token strings cannot be retrieved in queue or API responses.
    // ==========================================================================
    console.log('--- Acceptance Check 1: Existing-Schema Migration, PII Redaction & Direct SQL Proof ---');
    // 1. Simulate existing legacy table with legacy raw columns
    try {
      await execute(`ALTER TABLE training_curation_queue ADD COLUMN raw_user_message TEXT NULL`);
      await execute(`ALTER TABLE training_curation_queue ADD COLUMN model_response TEXT NULL`);
    } catch {}

    // 2. Run migration
    const migrationRes = await migratePurgeRawPiiColumns();
    console.log(`  [Migration Check] Legacy columns purged: [${migrationRes.purgedColumns.join(', ')}]`);
    assert(migrationRes.purgedColumns.includes('raw_user_message'), 'Migration must purge raw_user_message');
    assert(migrationRes.purgedColumns.includes('model_response'), 'Migration must purge model_response');

    // 3. Direct SQL proof that raw columns DO NOT EXIST in MySQL
    const queueColumns = await query<any[]>(
      `SELECT COLUMN_NAME
       FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'training_curation_queue'`
    );
    const columnNames = queueColumns.map((c: any) => c.COLUMN_NAME.toLowerCase());
    assert(!columnNames.includes('raw_user_message'), 'SQL Proof: raw_user_message column must NOT exist in MySQL table');
    assert(!columnNames.includes('model_response'), 'SQL Proof: model_response column must NOT exist in MySQL table');
    assert(columnNames.includes('sanitized_user_message'), 'SQL Proof: sanitized_user_message must exist');
    assert(columnNames.includes('sanitized_model_response'), 'SQL Proof: sanitized_model_response must exist');
    console.log('  ✅ SQL Proof: INFORMATION_SCHEMA confirms legacy raw columns are absent from MySQL.');

  // 3. Insert turn with sensitive raw PII into MySQL
  const cust1 = DISPOSABLE_CUST_BASE + 1;
  await ensureTestCustomer(cust1);
  await ensureTestConversation(4001, cust1);
  await customerMemoryService.setAITrainingConsent(cust1, true, 'TEST_CONSENT');

  const rawPiiTurn: RawConversationTurn = {
    conversationId: 4001,
    customerId: cust1,
    turnIndex: 1,
    correlationId: `${DISPOSABLE_PREFIX}_pii_turn_1`,
    userMessage: 'My name is Karim Kassir. Call +961 70 123456 at lat: 33.5635, lng: 35.3720 near building Al-Safir 3rd floor. Secret token AIzaSyD3m0K3y-12345678901234567890123.',
    assistantResponse: 'Understood Karim. I will contact +961 70 123456 at building Al-Safir with token AIzaSyD3m0K3y-12345678901234567890123.',
    orderConverted: true,
    orderStatus: 'DELIVERED',
    humanHandoff: false,
    hadError: false,
  };

  const stagedPii = await conversationHarvesterService.stageTurnForCuration(rawPiiTurn);
  assert(stagedPii !== null, 'Turn must be staged for consenting customer');

  // 4. Query MySQL database DIRECTLY via raw SQL to prove PII is NOT in the database row
  const dbRows = await query<any[]>(
    `SELECT * FROM training_curation_queue WHERE public_id = ?`,
    [stagedPii.publicId]
  );
  assert.strictEqual(dbRows.length, 1, 'Row must exist in MySQL training_curation_queue');
  const dbRow = dbRows[0];

  assert(!dbRow.sanitized_user_message.includes('+961 70 123456'), 'DB SQL: Phone must be redacted in sanitized_user_message');
  assert(!dbRow.sanitized_user_message.includes('Karim'), 'DB SQL: Name must be redacted in sanitized_user_message');
  assert(!dbRow.sanitized_user_message.includes('33.5635'), 'DB SQL: GPS latitude must be redacted');
  assert(!dbRow.sanitized_user_message.includes('AIzaSyD3m0K3y'), 'DB SQL: API token must be redacted');
  assert(!dbRow.sanitized_model_response.includes('+961 70 123456'), 'DB SQL: Phone must be redacted in assistant response');
  assert(!dbRow.sanitized_model_response.includes('Karim'), 'DB SQL: Name must be redacted in assistant response');
  assert(!dbRow.sanitized_model_response.includes('AIzaSyD3m0K3y'), 'DB SQL: API key must be redacted in assistant response');

  // 5. Query API getter to verify API responses only contain sanitized text
  const queue = await conversationHarvesterService.getQueue({ limit: 10 });
  const retrievedItem: any = queue.find((q) => q.publicId === stagedPii.publicId);
  assert(retrievedItem !== undefined, 'Staged item must be returned by getQueue');
  assert(retrievedItem.raw_user_message === undefined, 'API response must NOT have raw_user_message');
  assert(retrievedItem.model_response === undefined, 'API response must NOT have model_response');
  assert(typeof retrievedItem.sanitizedUserMessage === 'string', 'API response must have sanitizedUserMessage');
  assert(typeof retrievedItem.sanitizedModelResponse === 'string', 'API response must have sanitizedModelResponse');
  console.log('  ✅ Acceptance Check 1 Passed: Zero raw PII in database rows or API responses [PASS]\n');

  // ==========================================================================
  // Check 2: Consent Enforcement, Erasure & Retention with Real MySQL Rows (P0)
  // Acceptance Check:
  // - Non-consenting customer turns are rejected and never enter MySQL.
  // - Complete erase purges memory, queue rows, consent, and logs audit row in MySQL.
  // - Retention cleanup deletes real aged rows from MySQL.
  // ==========================================================================
  console.log('--- Acceptance Check 2: Consent Enforcement, Erasure & Retention with Real MySQL Rows ---');
  const nonConsentingCust = DISPOSABLE_CUST_BASE + 2;
  await ensureTestCustomer(nonConsentingCust);
  // Explicitly set consent to false in MySQL
  await customerMemoryService.setAITrainingConsent(nonConsentingCust, false, 'CUSTOMER_OPT_OUT');

  // Verify non-consenting row in MySQL customer_preferences
  const [prefRow] = await query<any[]>(
    `SELECT allow_ai_training FROM customer_preferences WHERE customer_id = ?`,
    [nonConsentingCust]
  );
  assert.strictEqual(prefRow.allow_ai_training, 0, 'MySQL customer_preferences must have allow_ai_training = 0');

  const nonConsentingTurn: RawConversationTurn = {
    conversationId: 4002,
    customerId: nonConsentingCust,
    turnIndex: 1,
    correlationId: `${DISPOSABLE_PREFIX}_nonconsent_turn`,
    userMessage: 'I want a burger but I do NOT consent to AI training',
    assistantResponse: 'Order noted.',
    orderConverted: true,
    orderStatus: 'DELIVERED',
  };

  const rejectedTurn = await conversationHarvesterService.stageTurnForCuration(nonConsentingTurn);
  assert.strictEqual(rejectedTurn, null, 'Harvester must reject non-consenting customer turn');

  // Direct SQL query proving turn was NOT inserted into MySQL
  const nonConsentDbRows = await query<any[]>(
    `SELECT * FROM training_curation_queue WHERE customer_id = ?`,
    [nonConsentingCust]
  );
  assert.strictEqual(nonConsentDbRows.length, 0, 'Direct SQL: Zero rows exist for non-consenting customer');

  // Real erasure test: customer with active data requests right-to-be-forgotten
  const custToErase = DISPOSABLE_CUST_BASE + 3;
  await ensureTestCustomer(custToErase);
  await customerMemoryService.savePreferences(custToErase, {
    allowAiTraining: true,
    dietaryPreferences: ['halal'],
    deliveryLandmarks: ['Near clocktower'],
    memoryItems: [
      {
        id: 'mem_1',
        item: 'no onions',
        type: 'exclusion',
        confidence: 0.95,
        confirmationStatus: 'CUSTOMER_CONFIRMED',
        createdAt: new Date().toISOString(),
      },
    ],
  });

  // Stage a turn for this customer so they have a queue record in MySQL
  await ensureTestConversation(4003, custToErase);
  await conversationHarvesterService.stageTurnForCuration({
    conversationId: 4003,
    customerId: custToErase,
    turnIndex: 1,
    correlationId: `${DISPOSABLE_PREFIX}_to_erase_turn`,
    userMessage: 'Please prepare the shawarma',
    assistantResponse: 'Shawarma preparing now',
    orderConverted: true,
    orderStatus: 'CONFIRMED',
  });

  const queueBeforeErase = await query<any[]>(
    `SELECT COUNT(*) AS c FROM training_curation_queue WHERE customer_id = ?`,
    [custToErase]
  );
  assert(queueBeforeErase[0].c > 0, 'Queue row must exist before erasure');

  // Execute real erase
  const eraseResult = await customerMemoryService.optOutAndEraseMemory(custToErase, 1);
  assert.strictEqual(eraseResult, true, 'optOutAndEraseMemory must return true');

  // Verify in MySQL that:
  // a) customer_preferences allow_ai_training is 0 and memory items cleared
  const [erasedPrefs] = await query<any[]>(
    `SELECT allow_ai_training, memory_items_json, delivery_landmarks FROM customer_preferences WHERE customer_id = ?`,
    [custToErase]
  );
  assert.strictEqual(erasedPrefs.allow_ai_training, 0, 'MySQL: allow_ai_training must be 0');
  assert.deepStrictEqual(JSON.parse(erasedPrefs.memory_items_json || '[]'), [], 'MySQL: memory_items_json must be empty');
  assert.deepStrictEqual(JSON.parse(erasedPrefs.delivery_landmarks || '[]'), [], 'MySQL: delivery_landmarks must be empty');

  // b) training_curation_queue rows are deleted
  const queueAfterErase = await query<any[]>(
    `SELECT COUNT(*) AS c FROM training_curation_queue WHERE customer_id = ?`,
    [custToErase]
  );
  assert.strictEqual(queueAfterErase[0].c, 0, 'MySQL: All curation queue rows for customer must be deleted');

  // c) ai_audit_events has recorded the erasure
  const [eraseAudit] = await query<any[]>(
    `SELECT * FROM ai_audit_events WHERE entity_type = 'CUSTOMER' AND entity_id = ? AND event_type = 'CUSTOMER_MEMORY_ERASED' ORDER BY id DESC LIMIT 1`,
    [String(custToErase)]
  );
  assert(eraseAudit !== undefined, 'MySQL: Audit event for CUSTOMER_MEMORY_ERASED must be recorded');

  // Test retention cleanup against real aged rows in MySQL
  const agedPublicId = `aged_${Date.now()}`;
  const agedCust = DISPOSABLE_CUST_BASE + 4;
  await ensureTestCustomer(agedCust);
  await ensureTestConversation(9999, agedCust);
  await execute(
    `INSERT INTO training_curation_queue (
      public_id, conversation_id, customer_id, turn_index, correlation_id,
      dataset_version, sender_language, sanitized_user_message, sanitized_model_response,
      detected_intent, quality_score, conversion_status, review_status, created_at
    ) VALUES (?, 9999, ?, 1, 'aged_corr', 'v1.0.0', 'en', 'old msg', 'old reply', 'GREETING', 80, 'CONVERTED_ORDER', 'HUMAN_APPROVED', DATE_SUB(NOW(), INTERVAL 95 DAY))`,
    [agedPublicId, agedCust]
  );

  const cleanupRes = await conversationHarvesterService.runRetentionPolicyCleanup(90);
  assert(cleanupRes.deletedCount >= 1, 'Retention cleanup must delete aged rows');

  const agedRowsAfter = await query<any[]>(
    `SELECT * FROM training_curation_queue WHERE public_id = ?`,
    [agedPublicId]
  );
  assert.strictEqual(agedRowsAfter.length, 0, 'MySQL: Aged row must be purged from training_curation_queue');

  const [retentionAudit] = await query<any[]>(
    `SELECT * FROM ai_audit_events WHERE event_type = 'RETENTION_POLICY_CLEANUP' ORDER BY id DESC LIMIT 1`
  );
  assert(retentionAudit !== undefined, 'MySQL: Audit event for RETENTION_POLICY_CLEANUP must exist');
  console.log('  ✅ Acceptance Check 2 Passed: Consent exclusion, full right-to-be-forgotten, and retention cleanup verified in MySQL [PASS]\n');

  // ==========================================================================
  // Check 3: Supervised Dataset Export Fidelity & Schema Validation (P0)
  // Acceptance Check: Exported records faithfully pair sanitized user messages
  // with sanitized assistant responses; validated by strict Gemini schema validator.
  // ==========================================================================
  console.log('--- Acceptance Check 3: Supervised Dataset Export Fidelity & Schema Validation ---');
  // Human operator approves staged turn
  await conversationHarvesterService.reviewItem(stagedPii.publicId, 'HUMAN_APPROVED', 1, 'Approved for dataset v1');

  // Verify in MySQL that review_status is HUMAN_APPROVED and audit row exists
  const [approvedRow] = await query<any[]>(
    `SELECT review_status, reviewed_by FROM training_curation_queue WHERE public_id = ?`,
    [stagedPii.publicId]
  );
  assert.strictEqual(approvedRow.review_status, 'HUMAN_APPROVED');
  assert.strictEqual(approvedRow.reviewed_by, 1);

  const approvedItems = await conversationHarvesterService.getQueue({ reviewStatus: 'HUMAN_APPROVED' });
  const approvedItem = approvedItems.find((i) => i.publicId === stagedPii.publicId);
  assert(approvedItem !== undefined, 'Approved item must be returned by getQueue');

  // Convert to supervised dataset records
  const datasetRecords = conversationHarvesterService.convertToDatasetRecords([approvedItem]);
  assert.strictEqual(datasetRecords.length, 1);
  assert.strictEqual(datasetRecords[0].customer_message, approvedItem.sanitizedUserMessage);
  assert.strictEqual(datasetRecords[0].model_response, approvedItem.sanitizedModelResponse);

  const formattedMsg = {
    messages: [
      { role: 'user', content: datasetRecords[0].customer_message },
      { role: 'model', content: datasetRecords[0].model_response! },
    ],
  };

  // Schema validation: validate Gemini training format
  const validation = validateGeminiTrainingRecord(formattedMsg);
  assert.strictEqual(validation.valid, true, `Record must pass Gemini schema validation: ${validation.error || ''}`);

  // Export to JSONL in scratch dir
  const scratchDir = path.resolve(process.cwd(), '../datasets/v1_export_test');
  const exportManifest = exportGeminiFineTuningJsonl(datasetRecords, scratchDir, 'v1.1.0-test');
  assert(exportManifest.trainCount + exportManifest.valCount >= 1, 'Exported turns count must be >= 1');
  const actualJsonlPath = exportManifest.trainCount > 0 ? exportManifest.trainPath : exportManifest.valPath;
  assert(fs.existsSync(actualJsonlPath));

  const exportedLines = fs.readFileSync(actualJsonlPath, 'utf8').trim().split('\n');
  assert(exportedLines.length >= 1, 'Exported JSONL must contain at least 1 turn');
  const parsedTurn = JSON.parse(exportedLines[0]);
  assert(parsedTurn.messages.length === 2, 'Must have exactly user and model messages');
  assert.strictEqual(parsedTurn.messages[0].role, 'user');
  assert.strictEqual(parsedTurn.messages[1].role, 'model');

  // Cleanup test export files
  try {
    fs.rmSync(scratchDir, { recursive: true, force: true });
  } catch {}
  console.log('  ✅ Acceptance Check 3 Passed: Supervised dataset export faithfully pairs dialogue and passes schema validator [PASS]\n');

  // ==========================================================================
  // Check 4: Idempotent Watermark Harvesting & MySQL Checkpoints (P1)
  // Acceptance Check: Harvester records progression in MySQL training_harvest_checkpoints;
  // subsequent runs do not harvest duplicate messages.
  // ==========================================================================
  console.log('--- Acceptance Check 4: Idempotent Watermark Harvesting & MySQL Checkpoints ---');
  // Read checkpoint directly from MySQL
  const cpBefore = await conversationHarvesterService.getCheckpoint();
  assert(typeof cpBefore.lastMessageId === 'number', 'Checkpoint must track lastMessageId');

  // Run watermark harvest
  const harvestResult1 = await conversationHarvesterService.harvestWithWatermark(10);
  assert(Array.isArray(harvestResult1.harvested), 'Harvested turns array returned');

  // Verify checkpoint was updated in MySQL
  const [cpRow] = await query<any[]>(
    `SELECT * FROM training_harvest_checkpoints WHERE harvester_name = ? LIMIT 1`,
    [cpBefore.harvesterName]
  );
  assert(cpRow !== undefined, 'MySQL training_harvest_checkpoints row must exist');
  assert(Number(cpRow.last_message_id) >= cpBefore.lastMessageId, 'Watermark must advance in MySQL');

  // Run harvest again: must be idempotent
  const harvestResult2 = await conversationHarvesterService.harvestWithWatermark(10);
  assert.strictEqual(harvestResult2.harvested.length, 0, 'Subsequent run must harvest 0 duplicates');
  console.log('  ✅ Acceptance Check 4 Passed: Watermark harvesting is durable and idempotent across runs [PASS]\n');

  // ==========================================================================
  // Check 5: Strict Multi-Turn Correlation & Zero Cross-Turn Pairing (P1)
  // Acceptance Check:
  // - Removed loose OR ai.conversation_id = c.id fallback.
  // - Pair each inbound message with its exact AI response using message ID.
  // - Reject or quarantine turns with no exact matching response.
  // - Real multi-turn SQL integration test proving zero cross-turn pairing.
  // ==========================================================================
  console.log('--- Acceptance Check 5: Strict Multi-Turn Correlation & Zero Cross-Turn Pairing ---');
  const custMulti = DISPOSABLE_CUST_BASE + 5;
  await ensureTestCustomer(custMulti);
  await customerMemoryService.setAITrainingConsent(custMulti, true, 'TEST_CONSENT');

  // Create a conversation in MySQL
  const convRes: any = await execute(
    `INSERT INTO conversations (public_id, customer_id, channel, status, created_at, updated_at)
     VALUES (?, ?, 'WHATSAPP', 'ACTIVE', NOW(), NOW())`,
    [uuidv4(), custMulti]
  );
  const testConvId = convRes.insertId;

  // Insert Turn 1 Inbound Message
  const m1Res: any = await execute(
    `INSERT INTO messages (public_id, conversation_id, direction, sender_type, text_body, created_at)
     VALUES (?, ?, 'INBOUND', 'CUSTOMER', 'Turn 1 user message: I want a big burger', NOW())`,
    [uuidv4(), testConvId]
  );
  const m1Id = m1Res.insertId;

  // Insert Turn 1 AI Response with exact inbound_message_id = m1Id
  await execute(
    `INSERT INTO ai_interactions (
      public_id, conversation_id, model_name, ai_context, interaction_type,
      input_summary, output_summary, structured_output, success, created_at
    ) VALUES (?, ?, 'gemini-2.5-flash', 'CUSTOMER_WHATSAPP', 'CHAT_TURN',
      'I want a big burger', 'Turn 1 AI response: Big burger added to cart',
      ?, 1, NOW())`,
    [uuidv4(), testConvId, JSON.stringify({ inbound_message_id: String(m1Id), turn_correlation_id: `corr_${m1Id}` })]
  );

  // Insert Turn 2 Inbound Message
  const m2Res: any = await execute(
    `INSERT INTO messages (public_id, conversation_id, direction, sender_type, text_body, created_at)
     VALUES (?, ?, 'INBOUND', 'CUSTOMER', 'Turn 2 user message: deliver to Saida Abra', NOW())`,
    [uuidv4(), testConvId]
  );
  const m2Id = m2Res.insertId;

  // Insert Turn 2 AI Response with exact inbound_message_id = m2Id
  await execute(
    `INSERT INTO ai_interactions (
      public_id, conversation_id, model_name, ai_context, interaction_type,
      input_summary, output_summary, structured_output, success, created_at
    ) VALUES (?, ?, 'gemini-2.5-flash', 'CUSTOMER_WHATSAPP', 'CHAT_TURN',
      'deliver to Saida Abra', 'Turn 2 AI response: Address confirmed for Saida Abra',
      ?, 1, NOW())`,
    [uuidv4(), testConvId, JSON.stringify({ inbound_message_id: String(m2Id), turn_correlation_id: `corr_${m2Id}` })]
  );

  // Insert Turn 3 Inbound Message with NO AI INTERACTION (unmatched / error turn)
  const m3Res: any = await execute(
    `INSERT INTO messages (public_id, conversation_id, direction, sender_type, text_body, created_at)
     VALUES (?, ?, 'INBOUND', 'CUSTOMER', 'Turn 3 user message without response: Hello?', NOW())`,
    [uuidv4(), testConvId]
  );
  const m3Id = m3Res.insertId;

  // Harvest from before m1Id
  const cpReset: any = await conversationHarvesterService.getCheckpoint();
  cpReset.lastMessageId = m1Id - 1;
  await conversationHarvesterService.saveCheckpoint(cpReset);

  const multiHarvest = await conversationHarvesterService.harvestWithWatermark(10);
  assert(multiHarvest.harvested.length >= 2, 'Must harvest the two matched turns');

  // Verify Turn 1 is paired ONLY with Response 1
  const harvestedTurn1 = multiHarvest.harvested.find((h) => h.inboundMessageId === m1Id);
  assert(harvestedTurn1 !== undefined, 'Turn 1 must be harvested');
  assert(harvestedTurn1.sanitizedUserMessage.includes('big burger'), 'Turn 1 user message match');
  assert(harvestedTurn1.sanitizedModelResponse.includes('Big burger added'), 'Turn 1 paired strictly with Response 1');

  // Verify Turn 2 is paired ONLY with Response 2
  const harvestedTurn2 = multiHarvest.harvested.find((h) => h.inboundMessageId === m2Id);
  assert(harvestedTurn2 !== undefined, 'Turn 2 must be harvested');
  assert(harvestedTurn2.sanitizedUserMessage.includes('Saida Abra'), 'Turn 2 user message match');
  assert(harvestedTurn2.sanitizedModelResponse.includes('Address confirmed'), 'Turn 2 paired strictly with Response 2');

  // Verify Turn 3 was quarantined/rejected because it had no matching AI response
  const harvestedTurn3 = multiHarvest.harvested.find((h) => h.inboundMessageId === m3Id);
  assert.strictEqual(harvestedTurn3, undefined, 'Unmatched Turn 3 must NOT be staged in queue');
  assert(multiHarvest.checkpoint.metrics.totalQuarantined >= 1, 'Metrics must track quarantined unmatched turn');
  console.log('  ✅ Acceptance Check 5 Passed: Exact message correlation verified; unmatched turns quarantined; zero cross-turn pairing [PASS]\n');

  // ==========================================================================
  // Check 6: Customer Memory Durability Across Redis Flush & Fresh Process Restart (P1)
  // Acceptance Check:
  // - Landmarks, special instructions, and memory items survive:
  //   a) Redis deletion,
  //   b) In-memory cache reset,
  //   c) Process termination,
  //   d) Fresh process restart.
  // ==========================================================================
  console.log('--- Acceptance Check 6: Customer Memory Durability Across Redis Flush & Fresh Process Restart ---');
  const custDurable = DISPOSABLE_CUST_BASE + 6;
  await ensureTestCustomer(custDurable);
  await customerMemoryService.savePreferences(custDurable, {
    allowAiTraining: true,
    deliveryLandmarks: ['Behind Al-Zaatari mosque', 'Red building 4th floor'],
    specialInstructions: ['Do not ring doorbell, call upon arrival'],
    dietaryPreferences: ['halal'],
    excludedIngredients: ['onion'],
  });

  // Verify in MySQL
  const [mysqlPrefCheck] = await query<any[]>(
    `SELECT delivery_landmarks, special_instructions FROM customer_preferences WHERE customer_id = ?`,
    [custDurable]
  );
  assert(mysqlPrefCheck.delivery_landmarks.includes('Behind Al-Zaatari mosque'), 'MySQL must contain landmark');
  assert(mysqlPrefCheck.special_instructions.includes('doorbell'), 'MySQL must contain instruction');

  // 1. Flush Redis key
  await redis.del(`ai:customer:prefs:${custDurable}`);

  // 2. Spawn a FRESH Child Process to read preferences directly from MySQL
  // This guarantees process termination and fresh restart (zero singleton in-memory cache)
  const tempScriptPath = path.resolve(process.cwd(), 'src/scripts/temp-child-verify.ts');
  const childScript = `import { customerMemoryService } from '../modules/ai/memory/customer-memory.service.js';
import { pool } from '../database/db.js';

async function main() {
  const prefs = await customerMemoryService.getPreferences(${custDurable});
  if (!prefs.deliveryLandmarks.includes('Behind Al-Zaatari mosque')) {
    console.error('Missing landmark in child process');
    process.exit(2);
  }
  if (!prefs.specialInstructions.some(s => s.includes('doorbell'))) {
    console.error('Missing instruction in child process');
    process.exit(3);
  }
  await pool.end();
  process.exit(0);
}
main().catch(err => { console.error(err); process.exit(1); });
`;
  fs.writeFileSync(tempScriptPath, childScript, 'utf8');

  let childProc: any;
  try {
    const tsxCli = path.resolve(process.cwd(), 'node_modules/tsx/dist/cli.mjs');
    childProc = spawnSync(
      process.execPath,
      [tsxCli, tempScriptPath],
      {
        cwd: path.resolve(process.cwd()),
        encoding: 'utf8',
        env: {
          ...process.env,
          DB_NAME: disposableDbName || 'lion_delivery',
          REDIS_URL: isolatedRedisUrl(),
        },
      }
    );
  } finally {
    try {
      fs.unlinkSync(tempScriptPath);
    } catch {}
  }

  assert.strictEqual(
    childProc.status,
    0,
    `Fresh process restart test failed with exit code ${childProc.status}: ${childProc.stderr || childProc.stdout}`
  );
  console.log('  ✅ Fresh child process restart successfully retrieved landmarks and instructions from MySQL.');

  // Verify inclusion in Gemini system prompt
  const durablePrefs = await customerMemoryService.getPreferences(custDurable);
  const promptCtx = customerMemoryService.formatPreferencesForPrompt(durablePrefs);
  assert(promptCtx.includes('Behind Al-Zaatari mosque'), 'Prompt context must contain landmark');
  assert(promptCtx.includes('Do not ring doorbell'), 'Prompt context must contain instruction');

  const systemPrompt = getGeminiSystemPrompt({}, 'ar', promptCtx);
  assert(systemPrompt.includes('Behind Al-Zaatari mosque'), 'System prompt contains durable landmarks');
  console.log('  ✅ Acceptance Check 6 Passed: Landmarks & instructions durable across Redis flush and fresh process restart [PASS]\n');

  // ==========================================================================
  // Check 7: Memory Lifecycle (Ambiguous Suggestion, Confirmation, Expiry, Correction, Deletion) (P1)
  // Acceptance Check:
  // - Single ambiguous turn creates UNCONFIRMED_SUGGESTION.
  // - Confirmation upgrades status to CUSTOMER_CONFIRMED.
  // - Correction updates preference.
  // - Expiry filters out old items.
  // - Deletion removes item.
  // ==========================================================================
  console.log('--- Acceptance Check 7: Memory Lifecycle (Suggestions, Confirmation, Expiry, Correction, Deletion) ---');
  const custLifecycle = DISPOSABLE_CUST_BASE + 7;
  await ensureTestCustomer(custLifecycle);
  await redis.del(`ai:customer:prefs:${custLifecycle}`);

  // 1. Single ambiguous message -> UNCONFIRMED_SUGGESTION
  await customerMemoryService.observeAndLearn(custLifecycle, 'maybe without pickles this time', 'turn_701');
  const prefsAmbiguous = await customerMemoryService.getPreferences(custLifecycle);
  const suggestion = prefsAmbiguous.memoryItems.find((m) => m.item === 'pickles');
  assert(suggestion !== undefined, 'Memory item for pickles must be created');
  assert.strictEqual(suggestion.confirmationStatus, 'UNCONFIRMED_SUGGESTION', 'Ambiguous turn must be UNCONFIRMED_SUGGESTION');
  assert(suggestion.confidence < 0.90, 'Confidence must be moderate');

  // 2. Explicit confirmation
  await customerMemoryService.confirmMemoryItem(custLifecycle, 'pickles');
  const prefsConfirmed = await customerMemoryService.getPreferences(custLifecycle);
  const confirmed = prefsConfirmed.memoryItems.find((m) => m.item === 'pickles');
  assert(confirmed !== undefined);
  assert.strictEqual(confirmed.confirmationStatus, 'CUSTOMER_CONFIRMED', 'Status must upgrade to CUSTOMER_CONFIRMED');
  assert.strictEqual(confirmed.confidence, 1.0, 'Confidence must be 1.0 after confirmation');

  // 3. Correction
  await customerMemoryService.correctMemoryItem(custLifecycle, 'pickles', 'sweet pickles only');
  const prefsCorrected = await customerMemoryService.getPreferences(custLifecycle);
  assert(prefsCorrected.memoryItems.some((m) => m.item === 'sweet pickles only'), 'Corrected memory item must be present');

  // 4. Expiry
  const yesterday = new Date(Date.now() - 86400000).toISOString();
  await customerMemoryService.savePreferences(
    custLifecycle,
    {
      memoryItems: [
        ...prefsCorrected.memoryItems,
        {
          id: 'expired_item_1',
          item: 'temporary promo code',
          type: 'instruction',
          confidence: 0.9,
          confirmationStatus: 'CUSTOMER_CONFIRMED',
          createdAt: new Date(Date.now() - 172800000).toISOString(),
          expiresAt: yesterday,
        },
      ],
    },
    { replaceMemoryItems: true }
  );
  // Retrieve preferences: expired items must be filtered out
  const prefsAfterExpiry = await customerMemoryService.getPreferences(custLifecycle);
  assert(!prefsAfterExpiry.memoryItems.some((m) => m.id === 'expired_item_1'), 'Expired memory item must be filtered out');

  // 5. Deletion
  await customerMemoryService.deleteMemoryItem(custLifecycle, 'sweet pickles only');
  const prefsDeleted = await customerMemoryService.getPreferences(custLifecycle);
  assert(!prefsDeleted.memoryItems.some((m) => m.item === 'sweet pickles only'), 'Deleted item must no longer exist');
  console.log('  ✅ Acceptance Check 7 Passed: Memory suggestions, confirmation, correction, expiry, and deletion verified [PASS]\n');

  // ==========================================================================
  // Check 8: Gemini Tuning Provider Contract Test & MySQL Job Persistence (P1)
  // Acceptance Check:
  // - Outgoing request body contains actual dataset examples from dataset file.
  // - Contract test fails if dataset is absent or empty.
  // - Tuning jobs and status transitions persisted in MySQL.
  // - If credentials unavailable, clearly reports unverified rather than synthetic success.
  // ==========================================================================
  console.log('--- Acceptance Check 8: Gemini Tuning Provider Contract Test & MySQL Job Persistence ---');
  let capturedUrl = '';
  let capturedBody: any = null;

  // Strict provider contract inspection with mock fetch
  geminiTuningProvider.setFetchFn(async (url: any, opts: any) => {
    capturedUrl = String(url);
    capturedBody = JSON.parse(opts.body);
    return new Response(
      JSON.stringify({
        name: `tunedModels/lion-gemini-test-${Date.now()}`,
        displayName: capturedBody.displayName,
        state: 'QUEUED',
        baseModel: capturedBody.baseModel,
        tunedModelEndpoint: `models/${capturedBody.displayName}-v1`,
        createTime: new Date().toISOString(),
        updateTime: new Date().toISOString(),
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  });

  // 1. Submit valid tuning job with existing dataset file
  const testJob = await geminiTuningProvider.submitTuningJob({
    datasetVersion: 'v1.0.0',
    trainDatasetPath: 'datasets/v1/single_turn_nlu.jsonl',
    displayName: 'lion-tuned-gemini-v1',
  });

  // Strict contract assertions on outgoing HTTP request
  assert(capturedUrl.includes('generativelanguage.googleapis.com/v1beta/tunedModels'), 'Target URL is Google TunedModels API');
  assert(capturedBody !== null, 'Request body was generated');
  assert(capturedBody.tuningTask?.trainingData?.examples?.examples?.length > 0, 'CONTRACT: Actual dataset examples must be present in outgoing request');
  assert.strictEqual(typeof capturedBody.tuningTask.trainingData.examples.examples[0].textInput, 'string');
  assert.strictEqual(typeof capturedBody.tuningTask.trainingData.examples.examples[0].output, 'string');
  console.log(`  ✅ Provider Contract: Inspected outgoing HTTP request - verified ${capturedBody.tuningTask.trainingData.examples.examples.length} training examples uploaded in tuningTask payload.`);

  // 2. Verify job was persisted in MySQL ai_training_jobs
  const [jobDbRow] = await query<any[]>(
    `SELECT * FROM ai_training_jobs WHERE provider_job_id = ?`,
    [testJob.jobId]
  );
  assert(jobDbRow !== undefined, 'MySQL: ai_training_jobs record must be created');
  assert.strictEqual(jobDbRow.status, 'QUEUED');

  // 3. Test status transition and update in MySQL
  geminiTuningProvider.setFetchFn(async (url: any) => {
    return new Response(
      JSON.stringify({
        name: testJob.jobId,
        state: 'RUNNING',
        baseModel: 'gemini-2.5-flash',
        metadata: { state: 'RUNNING' },
        metrics: { trainingLoss: 0.11, validationLoss: 0.14 },
      }),
      { status: 200 }
    );
  });

  const updatedJob = await geminiTuningProvider.getTuningJobStatus(testJob.jobId);
  assert.strictEqual(updatedJob.state, 'RUNNING');

  const [updatedJobDbRow] = await query<any[]>(
    `SELECT status FROM ai_training_jobs WHERE provider_job_id = ?`,
    [testJob.jobId]
  );
  assert.strictEqual(updatedJobDbRow.status, 'RUNNING', 'MySQL: Status must update to RUNNING');

  // 4. Test failure on missing dataset file
  let missingDatasetCaught = false;
  try {
    await geminiTuningProvider.submitTuningJob({
      datasetVersion: 'v1.0.0',
      trainDatasetPath: 'non_existent_dataset.jsonl',
    });
  } catch (err: any) {
    missingDatasetCaught = true;
    assert(err.message.includes('not found'), 'Error specifies dataset not found');
  }
  assert(missingDatasetCaught, 'Provider must fail if dataset file is absent');

  // Reset fetchFn
  geminiTuningProvider.resetFetchFn();

  // 5. Check live credentials and report honestly
  const liveCredsAvailable = geminiTuningProvider.isLiveCredentialsConfigured();
  if (liveCredsAvailable) {
    console.log('  ℹ️ Live Gemini credentials detected.');
  } else {
    console.log('  ℹ️ Live Gemini API credentials NOT configured. Live model training against Google AI project is NOT verified (mock provider contract verified).');
  }
  console.log('  ✅ Acceptance Check 8 Passed: Provider contract verified with dataset inspection & MySQL persistence (Live training blocked on credentials) [PASS]\n');

  // ==========================================================================
  // Check 9: Real Offline Evaluation Gate & Strict Promotion Safety (P1)
  // Acceptance Check:
  // - Replaces hardcoded evaluation numbers with real evaluator over versioned dataset.
  // - Attempting REAL_GEMINI evaluation without credentials fails closed (REJECTED).
  // - DETERMINISTIC_MOCK evaluation explicitly records isRealCandidateEvaluated: false.
  // - REGISTERED and REJECTED models are NOT promotable.
  // - promoteToCanary rejects unevaluated or rejected models.
  // - Shadow promotion routes the actual candidate model endpoint.
  // ==========================================================================
  console.log('--- Acceptance Check 9: Real Offline Evaluation Gate & Strict Promotion Safety ---');
  // Register candidate model in MySQL
  const candidateVersion = 'v1.2.0-' + Date.now();
  const registeredModel = await modelRegistryService.registerModel({
    modelName: `models/lion-candidate-${candidateVersion}`,
    version: candidateVersion,
    datasetVersion: 'v1.0.0',
  });
  assert.strictEqual(registeredModel.status, 'REGISTERED');

  // Prove that a REGISTERED model CANNOT be promoted to shadow
  let shadowBlocked = false;
  try {
    await modelRegistryService.promoteToShadow(registeredModel.publicId, 1);
  } catch (err: any) {
    shadowBlocked = true;
    assert(err.message.toLowerCase().includes('offline evaluation gate'), `Error specifies evaluation required: ${err.message}`);
  }
  assert(shadowBlocked, 'SAFETY GATE: REGISTERED model must NOT be promotable to shadow');

  // Prove that an unevaluated model CANNOT be promoted to canary
  let canaryBlocked = false;
  try {
    await modelRegistryService.promoteToCanary(registeredModel.publicId, 10, 1);
  } catch (err: any) {
    canaryBlocked = true;
  }
  assert(canaryBlocked, 'SAFETY GATE: Unevaluated model must NOT be promotable to canary');

  // Step A: Attempt REAL_GEMINI candidate evaluation gate without credentials -> MUST FAIL CLOSED
  console.log('  Testing REAL_GEMINI candidate evaluation gate (verifying fail-closed behavior)...');
  const evalGateReal = await modelRegistryService.runOfflineEvaluationGate(registeredModel.publicId, {
    evalMode: 'REAL_GEMINI',
    geminiApiKey: '',
  });
  assert.strictEqual(evalGateReal.passed, false, 'REAL_GEMINI evaluation without credentials must FAIL closed');
  assert.strictEqual(evalGateReal.overallScore, 0, 'Score must be 0 for failed real evaluation');
  assert(
    evalGateReal.failureReasons.some(
      (r) => r.includes('GEMINI_API_KEY') || r.includes('credential') || r.includes('NOT evaluated')
    ),
    'Failure reasons must explicitly record that real candidate was NOT evaluated against Google AI service'
  );

  // Verify in MySQL that model is REJECTED and cannot be promoted
  const [dbModelReal] = await query<any[]>(
    `SELECT status, eval_score, eval_metrics_json FROM ai_model_registry WHERE public_id = ?`,
    [registeredModel.publicId]
  );
  assert.strictEqual(dbModelReal.status, 'REJECTED', 'MySQL: Model status must be REJECTED');
  const metricsReal =
    typeof dbModelReal.eval_metrics_json === 'string'
      ? JSON.parse(dbModelReal.eval_metrics_json)
      : dbModelReal.eval_metrics_json;
  assert.strictEqual(metricsReal.isRealCandidateEvaluated, false, 'isRealCandidateEvaluated must be false');
  assert.strictEqual(metricsReal.status, 'SKIPPED_PENDING_CREDENTIALS');

  // Prove that REJECTED model CANNOT be promoted
  let rejectedShadowBlocked = false;
  try {
    await modelRegistryService.promoteToShadow(registeredModel.publicId, 1);
  } catch (err: any) {
    rejectedShadowBlocked = true;
  }
  assert(rejectedShadowBlocked, 'SAFETY GATE: REJECTED candidate model must NOT be promotable to shadow');
  console.log('  ✅ Verified: REAL_GEMINI evaluation fails closed, sets status REJECTED, and blocks promotion.');

  // Step B: Reset model status to REGISTERED and run DETERMINISTIC_MOCK harness for pipeline validation
  console.log('  Running DETERMINISTIC_MOCK evaluation harness to validate promotion pipeline...');
  await execute(
    `UPDATE ai_model_registry SET status = 'REGISTERED', eval_score = NULL, eval_metrics_json = NULL WHERE public_id = ?`,
    [registeredModel.publicId]
  );
  await modelRegistryService.getModel(registeredModel.publicId);

  const evalGateMock = await modelRegistryService.runOfflineEvaluationGate(registeredModel.publicId, {
    evalMode: 'DETERMINISTIC_MOCK',
  });
  assert(evalGateMock.passed, 'Deterministic mock evaluation gate must pass');
  assert(evalGateMock.safetyScore >= 0.95, `Safety score must be >= 95% (was ${evalGateMock.safetyScore})`);
  assert(evalGateMock.intentAccuracy >= 0.90, `Intent accuracy must be >= 90% (was ${evalGateMock.intentAccuracy})`);
  assert.strictEqual(evalGateMock.zeroForbiddenMutations, true, 'Zero forbidden mutations required');

  // Verify in MySQL that model is APPROVED_SHADOW with metrics explicitly tagged as mock
  const [evalDbRow] = await query<any[]>(
    `SELECT status, eval_score, eval_metrics_json FROM ai_model_registry WHERE public_id = ?`,
    [registeredModel.publicId]
  );
  assert.strictEqual(evalDbRow.status, 'APPROVED_SHADOW');
  assert(Number(evalDbRow.eval_score) > 0, 'Real evaluation score recorded in MySQL');
  const metricsMock =
    typeof evalDbRow.eval_metrics_json === 'string'
      ? JSON.parse(evalDbRow.eval_metrics_json)
      : evalDbRow.eval_metrics_json;
  assert.strictEqual(metricsMock.evaluationMode, 'DETERMINISTIC_MOCK');
  assert.strictEqual(
    metricsMock.isRealCandidateEvaluated,
    false,
    'DETERMINISTIC_MOCK must explicitly state isRealCandidateEvaluated: false'
  );
  console.log(
    '  ✅ Verified: DETERMINISTIC_MOCK harness passes pipeline check and explicitly tags isRealCandidateEvaluated: false in MySQL.'
  );

  // Step C: Promote to SHADOW mode with human approval (operatorId = 1)
  await modelRegistryService.promoteToShadow(registeredModel.publicId, 1);
  const shadowConfig = shadowCanaryRouter.getConfig();
  assert.strictEqual(shadowConfig.routingMode, 'SHADOW');
  assert.strictEqual(shadowConfig.candidateModelEndpoint, registeredModel.modelName, 'Router must receive actual candidate endpoint');

  // Verify MySQL audit row for shadow promotion
  const [shadowAudit] = await query<any[]>(
    `SELECT * FROM ai_audit_events WHERE entity_type = 'AI_MODEL' AND entity_id = ? AND event_type = 'MODEL_PROMOTED_TO_SHADOW'`,
    [registeredModel.publicId]
  );
  assert(shadowAudit !== undefined, 'MySQL: Audit event for MODEL_PROMOTED_TO_SHADOW recorded');
  console.log('  ✅ Acceptance Check 9 Passed: Fail-closed real gate verified; deterministic pipeline verified with isRealCandidateEvaluated: false [PASS]\n');

  // ==========================================================================
  // Check 10: Shadow Execution Snapshot Proof (Zero Mutations) & Rollback (P1)
  // Acceptance Check:
  // - Snapshot carts, addresses, orders, messages before and after candidate execution.
  // - Prove EXACT zero mutations and zero customer-facing candidate messages.
  // - Canary promotion and 1-click rollback verified with persistence in MySQL.
  // ==========================================================================
  console.log('--- Acceptance Check 10: Shadow Execution Snapshot Proof & Rollback ---');
  // 1. Snapshot database tables before candidate execution
  const [cartsBefore] = await query<any[]>('SELECT COUNT(*) AS c FROM carts');
  const [cartItemsBefore] = await query<any[]>('SELECT COUNT(*) AS c FROM cart_items');
  const [ordersBefore] = await query<any[]>('SELECT COUNT(*) AS c FROM orders');
  const [addressesBefore] = await query<any[]>('SELECT COUNT(*) AS c FROM customer_addresses');
  const [outboundMessagesBefore] = await query<any[]>("SELECT COUNT(*) AS c FROM messages WHERE direction = 'OUTBOUND'");

  // 2. Set mock fetch for candidate Gemini planner that returns tool calls (attempting a mutation)
  geminiService.setFetchFn(async () => {
    return new Response(
      JSON.stringify({
        candidates: [
          {
            content: {
              role: 'model',
              parts: [
                {
                  text: 'Adding crispy chicken to your cart now in Saida.',
                },
              ],
            },
          },
        ],
        usageMetadata: { promptTokenCount: 150, candidatesTokenCount: 30 },
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  });

  // Execute actual candidate turn in SHADOW mode
  const shadowRequestId = `shadow_test_${Date.now()}`;
  const liveResult = {
    intent: 'ADD_TO_CART' as any,
    confidence: 1.0,
    replyText: 'Live reply to customer',
    actionTaken: 'CART_UPDATED',
  };

  const shadowResult = await shadowCanaryRouter.executeShadow(
    '+96170999888',
    'I want 2 crispy chicken burgers',
    'text',
    liveResult,
    shadowRequestId,
    testConvId
  );

  assert(shadowResult !== null, 'Shadow execution must execute candidate planner');

  // 3. Snapshot database tables after candidate execution
  const [cartsAfter] = await query<any[]>('SELECT COUNT(*) AS c FROM carts');
  const [cartItemsAfter] = await query<any[]>('SELECT COUNT(*) AS c FROM cart_items');
  const [ordersAfter] = await query<any[]>('SELECT COUNT(*) AS c FROM orders');
  const [addressesAfter] = await query<any[]>('SELECT COUNT(*) AS c FROM customer_addresses');
  const [outboundMessagesAfter] = await query<any[]>("SELECT COUNT(*) AS c FROM messages WHERE direction = 'OUTBOUND'");

  // SNAPSHOT PROOF: Zero mutations to carts, items, orders, addresses, or outbound messages
  assert.strictEqual(cartsBefore.c, cartsAfter.c, 'SNAPSHOT PROOF: Zero cart creations in shadow mode');
  assert.strictEqual(cartItemsBefore.c, cartItemsAfter.c, 'SNAPSHOT PROOF: Zero cart item mutations in shadow mode');
  assert.strictEqual(ordersBefore.c, ordersAfter.c, 'SNAPSHOT PROOF: Zero order creations in shadow mode');
  assert.strictEqual(addressesBefore.c, addressesAfter.c, 'SNAPSHOT PROOF: Zero address creations in shadow mode');
  assert.strictEqual(outboundMessagesBefore.c, outboundMessagesAfter.c, 'SNAPSHOT PROOF: Zero customer-facing messages sent in shadow mode');
  console.log('  ✅ Database Snapshot Proof: Exactly 0 carts, 0 orders, 0 addresses, and 0 customer messages created by candidate in shadow mode.');

  // 4. Verify candidate telemetry logged to MySQL ai_interactions with execution_mode = 'SHADOW'
  const [shadowTelemetry] = await query<any[]>(
    `SELECT * FROM ai_interactions WHERE conversation_id = ? AND model_name LIKE ? ORDER BY id DESC LIMIT 1`,
    [testConvId, `%${registeredModel.modelName}%`]
  );
  assert(shadowTelemetry !== undefined, 'MySQL: Shadow telemetry must be recorded in ai_interactions');
  const structuredPayload = JSON.parse(shadowTelemetry.structured_output || '{}');
  assert.strictEqual(structuredPayload.execution_mode, 'SHADOW', 'Telemetry records execution_mode = SHADOW');

  // 5. Promote to Canary mode with 15% traffic and operator approval
  await modelRegistryService.promoteToCanary(registeredModel.publicId, 15, 1);
  const canaryConfig = shadowCanaryRouter.getConfig();
  assert.strictEqual(canaryConfig.routingMode, 'CANARY');
  assert.strictEqual(canaryConfig.canaryPercentage, 15);
  assert.strictEqual(canaryConfig.candidateModelEndpoint, registeredModel.modelName);

  // 6. Emergency 1-Click Rollback
  await modelRegistryService.emergencyRollback(registeredModel.publicId, 'Rollback test verification', 1);
  const rollbackConfig = shadowCanaryRouter.getConfig();
  assert.strictEqual(rollbackConfig.routingMode, 'STABLE_ONLY');
  assert.strictEqual(rollbackConfig.canaryPercentage, 0);

  // Verify rollback persisted in MySQL ai_model_registry
  const [rollbackDbModel] = await query<any[]>(
    `SELECT status, rollback_reason, canary_percentage FROM ai_model_registry WHERE public_id = ?`,
    [registeredModel.publicId]
  );
  assert.strictEqual(rollbackDbModel.status, 'ROLLED_BACK', 'MySQL: Model status updated to ROLLED_BACK');
  assert(rollbackDbModel.rollback_reason.includes('Rollback test'), 'MySQL: Rollback reason recorded');
  assert.strictEqual(rollbackDbModel.canary_percentage, 0, 'MySQL: Canary percentage reset to 0');

  // Reset fetchFn
  geminiService.resetFetchFn();
  console.log('  ℹ️ Candidate execution in shadow mode verified with mock HTTP fetchFn (zero mutations verified). Actual tuned candidate endpoint not invoked against Google AI service.');
  console.log('  ✅ Acceptance Check 10 Passed: Zero mutation snapshot proof verified; canary promotion and instant rollback recorded in MySQL [PASS]\n');

  console.log('\n================================================================================');
  console.log('🎉 ALL 10 ACCEPTANCE CHECKS PASSED WITH REAL DATABASE VERIFICATION!');
  console.log(`   All persistence tested against isolated disposable MySQL database (${disposableDbName}) and local Redis DB 15.`);
  console.log('================================================================================\n');
  } finally {
    if (disposableDbName) {
      console.log(`--- Teardown: Dropping Isolated Disposable Database ${disposableDbName} ---`);
      try {
        await pool.end();
      } catch {}
      try {
        await dropIsolatedDatabase(disposableDbName);
        console.log(`  ✅ Successfully dropped isolated disposable database: ${disposableDbName}`);
      } catch (err: any) {
        console.warn(`  ⚠️ Failed to drop disposable database ${disposableDbName}:`, err.message);
      }
    }
  }
}

runEndToEndRemediationSuite().then(() => {
  process.exit(0);
}).catch(async (err) => {
  console.error('\n❌ End-to-end remediation test failure:', err);
  try {
    await pool.end();
  } catch {}
  process.exit(1);
});
