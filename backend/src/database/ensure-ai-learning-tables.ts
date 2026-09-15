import { execute } from './db.js';

/**
 * Ensures AI continuous learning tables and columns exist in MySQL.
 * Safe and idempotent for dev, test, and production startup.
 */
export async function ensureAILearningTables(): Promise<void> {
  try {
    // 1. Ensure new columns in customer_preferences
    const alterColumns = [
      `ALTER TABLE customer_preferences ADD COLUMN allow_ai_training TINYINT(1) NOT NULL DEFAULT 0;`,
      `ALTER TABLE customer_preferences ADD COLUMN ai_training_consent_at TIMESTAMP(3) NULL;`,
      `ALTER TABLE customer_preferences ADD COLUMN ai_training_consent_source VARCHAR(80) NULL;`,
      `ALTER TABLE customer_preferences ADD COLUMN delivery_landmarks JSON NULL;`,
      `ALTER TABLE customer_preferences ADD COLUMN special_instructions JSON NULL;`,
      `ALTER TABLE customer_preferences ADD COLUMN memory_items_json JSON NULL;`,
    ];

    for (const sql of alterColumns) {
      try {
        await execute(sql);
      } catch (err: any) {
        // MariaDB 10.4 does not support ADD COLUMN IF NOT EXISTS.
        // Duplicate columns are expected on an already-migrated database;
        // every other error must reach the strict production guard below.
        if (err?.errno !== 1060 && err?.code !== 'ER_DUP_FIELDNAME') {
          throw err;
        }
      }
    }

    // 2. Training curation queue (sanitized text ONLY, no raw PII)
    await execute(`
      CREATE TABLE IF NOT EXISTS training_curation_queue (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        public_id CHAR(36) NOT NULL,
        conversation_id BIGINT UNSIGNED NULL,
        customer_id BIGINT UNSIGNED NULL,
        turn_index INT UNSIGNED NOT NULL DEFAULT 1,
        correlation_id VARCHAR(100) NULL,
        inbound_message_id BIGINT UNSIGNED NULL,
        assistant_message_id BIGINT UNSIGNED NULL,
        dataset_version VARCHAR(40) NULL,
        sender_language VARCHAR(20) NOT NULL DEFAULT 'en',
        sanitized_user_message TEXT NOT NULL,
        sanitized_model_response TEXT NOT NULL,
        detected_intent VARCHAR(60) NOT NULL DEFAULT 'UNKNOWN',
        tool_calls_json JSON NULL,
        quality_score INT NOT NULL DEFAULT 0,
        conversion_status VARCHAR(40) NOT NULL DEFAULT 'NOT_CONVERTED',
        review_status VARCHAR(30) NOT NULL DEFAULT 'PENDING',
        reviewed_by BIGINT UNSIGNED NULL,
        reviewed_at TIMESTAMP(3) NULL,
        review_notes VARCHAR(500) NULL,
        created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        PRIMARY KEY (id),
        UNIQUE KEY uq_training_curation_public_id (public_id),
        UNIQUE KEY uq_training_curation_turn (conversation_id, turn_index, correlation_id),
        KEY idx_training_curation_status (review_status, quality_score),
        KEY idx_training_curation_conv (conversation_id),
        KEY idx_training_curation_cust (customer_id)
      ) ENGINE=InnoDB;
    `);

    // 3. Harvest checkpoints
    await execute(`
      CREATE TABLE IF NOT EXISTS training_harvest_checkpoints (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        harvester_name VARCHAR(80) NOT NULL,
        last_message_id BIGINT UNSIGNED NOT NULL DEFAULT 0,
        last_harvested_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        status VARCHAR(40) NOT NULL DEFAULT 'IDLE',
        metrics_json JSON NULL,
        updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        PRIMARY KEY (id),
        UNIQUE KEY uq_harvest_checkpoints_name (harvester_name)
      ) ENGINE=InnoDB;
    `);

    // 4. AI training jobs
    await execute(`
      CREATE TABLE IF NOT EXISTS ai_training_jobs (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        public_id CHAR(36) NOT NULL,
        provider VARCHAR(40) NOT NULL DEFAULT 'GEMINI',
        provider_job_id VARCHAR(120) NULL,
        dataset_version VARCHAR(40) NOT NULL,
        base_model VARCHAR(80) NOT NULL DEFAULT 'gemini-2.5-flash',
        tuned_model_name VARCHAR(120) NULL,
        status VARCHAR(40) NOT NULL DEFAULT 'CREATED',
        hyperparameters_json JSON NULL,
        metrics_json JSON NULL,
        error_message TEXT NULL,
        approved_by BIGINT UNSIGNED NULL,
        approved_at TIMESTAMP(3) NULL,
        created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        PRIMARY KEY (id),
        UNIQUE KEY uq_ai_training_jobs_public_id (public_id),
        KEY idx_ai_training_jobs_status (status)
      ) ENGINE=InnoDB;
    `);

    // 5. Model registry
    await execute(`
      CREATE TABLE IF NOT EXISTS ai_model_registry (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        public_id CHAR(36) NOT NULL,
        model_name VARCHAR(120) NOT NULL,
        base_model VARCHAR(80) NOT NULL DEFAULT 'gemini-2.5-flash',
        version VARCHAR(40) NOT NULL,
        dataset_version VARCHAR(40) NOT NULL,
        status VARCHAR(40) NOT NULL DEFAULT 'REGISTERED',
        eval_score DECIMAL(5,2) NULL,
        eval_metrics_json JSON NULL,
        canary_percentage INT UNSIGNED NOT NULL DEFAULT 0,
        promoted_by BIGINT UNSIGNED NULL,
        promoted_at TIMESTAMP(3) NULL,
        rollback_reason VARCHAR(500) NULL,
        created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        PRIMARY KEY (id),
        UNIQUE KEY uq_ai_model_registry_public_id (public_id),
        UNIQUE KEY uq_ai_model_registry_version (version),
        KEY idx_ai_model_registry_status (status)
      ) ENGINE=InnoDB;
    `);

    // 6. Audit events
    await execute(`
      CREATE TABLE IF NOT EXISTS ai_audit_events (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        event_type VARCHAR(60) NOT NULL,
        entity_type VARCHAR(40) NOT NULL,
        entity_id VARCHAR(120) NOT NULL,
        performed_by BIGINT UNSIGNED NULL,
        details_json JSON NULL,
        created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (id),
        KEY idx_ai_audit_events_type (event_type, created_at),
        KEY idx_ai_audit_events_entity (entity_type, entity_id)
      ) ENGINE=InnoDB;
    `);

    // 7. Execute legacy raw PII columns migration to ensure no raw text columns exist
    const { migratePurgeRawPiiColumns } = await import('./migrations/purge-raw-pii.js');
    await migratePurgeRawPiiColumns();
  } catch (err: any) {
    console.error('[DB Migration Error] Failed ensuring AI learning tables:', err.message);
    // Fatal in test and production environments
    if (process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'test' || process.env.STRICT_DB === 'true') {
      throw err;
    }
  }
}
