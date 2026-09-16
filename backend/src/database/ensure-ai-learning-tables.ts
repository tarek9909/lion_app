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

    // Gemini clarification questions can exceed the original 120-character
    // projection. The full value is also retained in state_json.
    await execute(`ALTER TABLE conversation_state MODIFY COLUMN pending_question TEXT NULL;`);

    // Cart and order services reference these tables/columns on every AI turn.
    // Keep the schema self-healing for existing deployments as well as fresh DBs.
    const { ensureOrderBatchSchema } = await import('./migrations/ensure-order-batch-schema.js');
    await ensureOrderBatchSchema();

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

    // 7. Conversation AI Events (Immutable event timeline)
    await execute(`
      CREATE TABLE IF NOT EXISTS conversation_ai_events (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        public_id CHAR(36) NOT NULL,
        conversation_id BIGINT UNSIGNED NOT NULL,
        turn_index INT UNSIGNED NOT NULL DEFAULT 1,
        sequence_no INT UNSIGNED NOT NULL DEFAULT 1,
        inbound_message_id BIGINT UNSIGNED NULL,
        assistant_message_id BIGINT UNSIGNED NULL,
        request_id VARCHAR(100) NULL,
        event_type VARCHAR(60) NOT NULL,
        state_version_before INT UNSIGNED NOT NULL DEFAULT 1,
        state_version_after INT UNSIGNED NOT NULL DEFAULT 1,
        sanitized_payload_json JSON NULL,
        prompt_version VARCHAR(40) NULL,
        tool_schema_version VARCHAR(40) NULL,
        model_version VARCHAR(120) NULL,
        created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (id),
        UNIQUE KEY uq_ai_events_public_id (public_id),
        KEY idx_ai_events_conv_turn (conversation_id, turn_index),
        KEY idx_ai_events_type (event_type)
      ) ENGINE=InnoDB;
    `);

    // 8. Conversation Tasks (Task stack)
    await execute(`
      CREATE TABLE IF NOT EXISTS conversation_tasks (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        public_id CHAR(36) NOT NULL,
        conversation_id BIGINT UNSIGNED NOT NULL,
        task_type VARCHAR(60) NOT NULL,
        status VARCHAR(30) NOT NULL DEFAULT 'ACTIVE',
        parent_task_id BIGINT UNSIGNED NULL,
        next_required_action VARCHAR(80) NULL,
        expected_entity_type VARCHAR(60) NULL,
        candidate_entities_json JSON NULL,
        last_question TEXT NULL,
        clarification_attempts INT UNSIGNED NOT NULL DEFAULT 0,
        source_turn INT UNSIGNED NOT NULL DEFAULT 1,
        resolved_turn INT UNSIGNED NULL,
        context_json JSON NULL,
        created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        PRIMARY KEY (id),
        UNIQUE KEY uq_conversation_tasks_public_id (public_id),
        KEY idx_conv_tasks_status (conversation_id, status)
      ) ENGINE=InnoDB;
    `);

    // 9. Conversation Summaries (Versioned grounded summaries)
    await execute(`
      CREATE TABLE IF NOT EXISTS conversation_summaries (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        public_id CHAR(36) NOT NULL,
        conversation_id BIGINT UNSIGNED NOT NULL,
        summary_version INT UNSIGNED NOT NULL DEFAULT 1,
        customer_goal VARCHAR(255) NULL,
        confirmed_constraints_json JSON NULL,
        decisions_json JSON NULL,
        corrections_json JSON NULL,
        unresolved_json JSON NULL,
        source_turn_start INT UNSIGNED NOT NULL DEFAULT 1,
        source_turn_end INT UNSIGNED NOT NULL DEFAULT 1,
        language_profile VARCHAR(30) NOT NULL DEFAULT 'arabizi',
        summary_text TEXT NULL,
        created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        PRIMARY KEY (id),
        UNIQUE KEY uq_conv_summaries_public_id (public_id),
        KEY idx_conv_summaries_conv (conversation_id, summary_version)
      ) ENGINE=InnoDB;
    `);

    // 10. Customer Memory Items (Canonical evidence-backed memory store)
    await execute(`
      CREATE TABLE IF NOT EXISTS customer_memory_items (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        public_id CHAR(36) NOT NULL,
        customer_id BIGINT UNSIGNED NOT NULL,
        kind VARCHAR(60) NOT NULL,
        canonical_value VARCHAR(255) NOT NULL,
        customer_expression VARCHAR(255) NOT NULL,
        scope VARCHAR(30) NOT NULL DEFAULT 'ACCOUNT',
        status VARCHAR(40) NOT NULL DEFAULT 'SUGGESTED',
        confidence DECIMAL(4,3) NOT NULL DEFAULT 0.750,
        evidence_count INT UNSIGNED NOT NULL DEFAULT 1,
        source_conversation_id BIGINT UNSIGNED NULL,
        source_turn_index INT UNSIGNED NULL,
        confirmed_at TIMESTAMP(3) NULL,
        expires_at TIMESTAMP(3) NULL,
        supersedes_id BIGINT UNSIGNED NULL,
        sensitivity VARCHAR(30) NOT NULL DEFAULT 'NORMAL',
        created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        PRIMARY KEY (id),
        UNIQUE KEY uq_customer_memory_public_id (public_id),
        KEY idx_cust_memory_search (customer_id, kind, status)
      ) ENGINE=InnoDB;
    `);

    // 11. AI Turn Outcomes (Multi-dimensional delayed outcome scoring)
    await execute(`
      CREATE TABLE IF NOT EXISTS ai_turn_outcomes (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        public_id CHAR(36) NOT NULL,
        conversation_id BIGINT UNSIGNED NOT NULL,
        turn_index INT UNSIGNED NOT NULL,
        inbound_message_id BIGINT UNSIGNED NULL,
        assistant_message_id BIGINT UNSIGNED NULL,
        request_id VARCHAR(100) NULL,
        customer_reaction VARCHAR(60) NOT NULL DEFAULT 'ACCEPTED',
        primary_root_cause VARCHAR(60) NULL,
        contributing_causes_json JSON NULL,
        safety_score DECIMAL(4,3) NOT NULL DEFAULT 1.000,
        groundedness_score DECIMAL(4,3) NOT NULL DEFAULT 1.000,
        intent_score DECIMAL(4,3) NOT NULL DEFAULT 1.000,
        entity_score DECIMAL(4,3) NOT NULL DEFAULT 1.000,
        context_score DECIMAL(4,3) NOT NULL DEFAULT 1.000,
        clarification_score DECIMAL(4,3) NOT NULL DEFAULT 1.000,
        language_score DECIMAL(4,3) NOT NULL DEFAULT 1.000,
        tool_success_score DECIMAL(4,3) NOT NULL DEFAULT 1.000,
        customer_effort_score DECIMAL(4,3) NOT NULL DEFAULT 1.000,
        task_completion_score DECIMAL(4,3) NOT NULL DEFAULT 1.000,
        sentiment_score DECIMAL(4,3) NOT NULL DEFAULT 1.000,
        latency_quality_score DECIMAL(4,3) NOT NULL DEFAULT 1.000,
        overall_score DECIMAL(4,3) NOT NULL DEFAULT 1.000,
        hard_rejections_json JSON NULL,
        observed_signals_json JSON NULL,
        created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (id),
        UNIQUE KEY uq_ai_turn_outcomes_public_id (public_id),
        KEY idx_ai_turn_outcomes_conv (conversation_id, turn_index),
        KEY idx_ai_turn_outcomes_cause (primary_root_cause)
      ) ENGINE=InnoDB;
    `);

    // 12. AI Learning Cases (Diagnostic and rich training cases)
    await execute(`
      CREATE TABLE IF NOT EXISTS ai_learning_cases (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        public_id CHAR(36) NOT NULL,
        conversation_id BIGINT UNSIGNED NULL,
        customer_id BIGINT UNSIGNED NULL,
        turn_index INT UNSIGNED NOT NULL DEFAULT 1,
        correlation_id VARCHAR(100) NULL,
        inbound_message_id BIGINT UNSIGNED NULL,
        assistant_message_id BIGINT UNSIGNED NULL,
        sender_language VARCHAR(20) NOT NULL DEFAULT 'arabizi',
        user_message TEXT NOT NULL,
        actual_plan_json JSON NULL,
        actual_tools_json JSON NULL,
        actual_response TEXT NOT NULL,
        tool_results_json JSON NULL,
        customer_reaction VARCHAR(60) NULL,
        root_cause VARCHAR(60) NOT NULL DEFAULT 'HUMAN_REVIEW_REQUIRED',
        risk_tier VARCHAR(40) NOT NULL DEFAULT 'NORMAL',
        priority_score INT NOT NULL DEFAULT 0,
        gemini_proposed_plan_json JSON NULL,
        gemini_proposed_reply TEXT NULL,
        reviewer_corrected_intent VARCHAR(60) NULL,
        reviewer_corrected_entities_json JSON NULL,
        reviewer_corrected_tool VARCHAR(80) NULL,
        reviewer_corrected_args_json JSON NULL,
        reviewer_corrected_state_json JSON NULL,
        reviewer_corrected_reply TEXT NULL,
        target_intent VARCHAR(60) NULL,
        target_reply_text TEXT NULL,
        required_facts_json JSON NULL,
        forbidden_facts_json JSON NULL,
        review_status VARCHAR(30) NOT NULL DEFAULT 'PENDING',
        reviewed_by BIGINT UNSIGNED NULL,
        reviewed_at TIMESTAMP(3) NULL,
        review_notes VARCHAR(500) NULL,
        dataset_memberships_json JSON NULL,
        prompt_version VARCHAR(40) NULL,
        model_version VARCHAR(120) NULL,
        created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        PRIMARY KEY (id),
        UNIQUE KEY uq_ai_learning_cases_public_id (public_id),
        KEY idx_ai_learning_cases_status_prio (review_status, priority_score),
        KEY idx_ai_learning_cases_cause (root_cause)
      ) ENGINE=InnoDB;
    `);

    // 13. Case Sets & Members (Runtime approved-example versions for few-shot prompt guidance)
    await execute(`
      CREATE TABLE IF NOT EXISTS ai_case_sets (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        public_id CHAR(36) NOT NULL,
        version VARCHAR(40) NOT NULL DEFAULT 'v1.0.0',
        name VARCHAR(100) NOT NULL,
        description VARCHAR(255) NULL,
        is_active TINYINT(1) NOT NULL DEFAULT 0,
        created_by BIGINT UNSIGNED NULL,
        created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        PRIMARY KEY (id),
        UNIQUE KEY uq_ai_case_sets_public_id (public_id),
        UNIQUE KEY uq_ai_case_sets_version (version)
      ) ENGINE=InnoDB;
    `);

    await execute(`
      CREATE TABLE IF NOT EXISTS ai_case_set_members (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        case_set_id BIGINT UNSIGNED NOT NULL,
        case_id BIGINT UNSIGNED NULL,
        learning_case_id BIGINT UNSIGNED NULL,
        stage VARCHAR(40) NOT NULL DEFAULT 'ANY',
        intent VARCHAR(60) NOT NULL DEFAULT 'ANY',
        language VARCHAR(20) NOT NULL DEFAULT 'arabizi',
        example_input TEXT NULL,
        example_reasoning TEXT NULL,
        example_tool_calls_json JSON NULL,
        example_response TEXT NULL,
        created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (id),
        KEY idx_case_set_members_lookup (case_set_id, stage, intent, language)
      ) ENGINE=InnoDB;
    `);

    // 14. Prompt Registry (Prompt versioning, templates, and evaluations)
    await execute(`
      CREATE TABLE IF NOT EXISTS ai_prompt_registry (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        public_id CHAR(36) NOT NULL,
        version VARCHAR(40) NOT NULL,
        name VARCHAR(100) NOT NULL,
        prompt_template MEDIUMTEXT NOT NULL,
        content_sha256 CHAR(64) NOT NULL,
        status VARCHAR(30) NOT NULL DEFAULT 'DRAFT',
        is_active TINYINT(1) NOT NULL DEFAULT 0,
        eval_results_json JSON NULL,
        created_by BIGINT UNSIGNED NULL,
        created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        PRIMARY KEY (id),
        UNIQUE KEY uq_ai_prompt_registry_public_id (public_id),
        UNIQUE KEY uq_ai_prompt_registry_version (version)
      ) ENGINE=InnoDB;
    `);

    // 15. AI Experiments & Assignments (Shadow / Canary evidence & cohorts)
    await execute(`
      CREATE TABLE IF NOT EXISTS ai_experiments (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        public_id CHAR(36) NOT NULL,
        name VARCHAR(120) NOT NULL,
        experiment_type VARCHAR(40) NOT NULL DEFAULT 'SHADOW',
        stable_version VARCHAR(60) NOT NULL,
        candidate_version VARCHAR(60) NOT NULL,
        canary_percentage INT UNSIGNED NOT NULL DEFAULT 0,
        status VARCHAR(30) NOT NULL DEFAULT 'RUNNING',
        metrics_comparison_json JSON NULL,
        started_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        ended_at TIMESTAMP(3) NULL,
        PRIMARY KEY (id),
        UNIQUE KEY uq_ai_experiments_public_id (public_id)
      ) ENGINE=InnoDB;
    `);

    await execute(`
      CREATE TABLE IF NOT EXISTS ai_experiment_assignments (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        experiment_id BIGINT UNSIGNED NOT NULL,
        conversation_id BIGINT UNSIGNED NOT NULL,
        cohort VARCHAR(30) NOT NULL,
        assigned_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (id),
        UNIQUE KEY uq_ai_experiment_conv (experiment_id, conversation_id)
      ) ENGINE=InnoDB;
    `);

    // 16. Catalog Alias Candidates (Gated crowdsourced alias learning)
    await execute(`
      CREATE TABLE IF NOT EXISTS catalog_alias_candidates (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        public_id CHAR(36) NOT NULL,
        alias_term VARCHAR(120) NOT NULL,
        target_type VARCHAR(30) NOT NULL DEFAULT 'PRODUCT',
        target_id BIGINT UNSIGNED NOT NULL,
        target_name VARCHAR(150) NOT NULL,
        language VARCHAR(20) NOT NULL DEFAULT 'arabizi',
        distinct_customer_count INT UNSIGNED NOT NULL DEFAULT 1,
        customer_ids_json JSON NULL,
        status VARCHAR(30) NOT NULL DEFAULT 'CANDIDATE',
        reviewed_by BIGINT UNSIGNED NULL,
        reviewed_at TIMESTAMP(3) NULL,
        created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        PRIMARY KEY (id),
        UNIQUE KEY uq_catalog_alias_term (alias_term, target_type, target_id),
        KEY idx_catalog_alias_status (status, distinct_customer_count)
      ) ENGINE=InnoDB;
    `);

    // 17. AI Routing Config (Durable routing state that survives restarts)
    await execute(`
      CREATE TABLE IF NOT EXISTS ai_routing_config (
        id INT UNSIGNED NOT NULL DEFAULT 1,
        routing_mode VARCHAR(40) NOT NULL DEFAULT 'STABLE_ONLY',
        stable_provider VARCHAR(40) NOT NULL DEFAULT 'gemini',
        candidate_provider VARCHAR(40) NOT NULL DEFAULT 'gemini',
        canary_percentage INT UNSIGNED NOT NULL DEFAULT 0,
        stable_model_endpoint VARCHAR(180) NULL,
        candidate_model_endpoint VARCHAR(180) NULL,
        last_rollback_reason VARCHAR(500) NULL,
        updated_by BIGINT UNSIGNED NULL,
        updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        PRIMARY KEY (id)
      ) ENGINE=InnoDB;
    `);

    // Seed default routing row if not present
    await execute(`
      INSERT INTO ai_routing_config (id, routing_mode, stable_provider, candidate_provider, canary_percentage, updated_at)
      VALUES (1, 'STABLE_ONLY', 'gemini', 'gemini', 0, NOW())
      ON DUPLICATE KEY UPDATE id = id;
    `);

    // 18. Conversation Mutation Receipts (Durable turn/action idempotency receipts)
    await execute(`
      CREATE TABLE IF NOT EXISTS conversation_mutation_receipts (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        idempotency_key VARCHAR(180) NOT NULL,
        conversation_id BIGINT UNSIGNED NOT NULL,
        action_name VARCHAR(80) NULL,
        tool_name VARCHAR(80) NULL,
        action_status VARCHAR(40) NOT NULL DEFAULT 'SUCCESS',
        request_payload JSON NULL,
        response_payload JSON NULL,
        receipt_json JSON NULL,
        created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (id),
        UNIQUE KEY uq_mutation_receipts_key (idempotency_key),
        KEY idx_mutation_receipts_conv (conversation_id)
      ) ENGINE=InnoDB;
    `);

    // Ensure columns on conversation_mutation_receipts and ai_learning_cases if tables already exist
    const receiptCols = [
      `ALTER TABLE conversation_mutation_receipts ADD COLUMN action_name VARCHAR(80) NULL;`,
      `ALTER TABLE conversation_mutation_receipts ADD COLUMN request_payload JSON NULL;`,
      `ALTER TABLE conversation_mutation_receipts ADD COLUMN response_payload JSON NULL;`,
      `ALTER TABLE ai_learning_cases ADD COLUMN target_intent VARCHAR(60) NULL;`,
      `ALTER TABLE ai_learning_cases ADD COLUMN target_reply_text TEXT NULL;`,
      `ALTER TABLE ai_case_set_members ADD COLUMN case_id BIGINT UNSIGNED NULL;`,
    ];
    for (const sql of receiptCols) {
      try {
        await execute(sql);
      } catch (err: any) {
        if (err?.errno !== 1060 && err?.code !== 'ER_DUP_FIELDNAME') {
          // ignore column exists
        }
      }
    }

    // 19. Ensure new columns on conversation_state for task stack & versioning
    const convStateCols = [
      `ALTER TABLE conversation_state ADD COLUMN version_no INT UNSIGNED NOT NULL DEFAULT 1;`,
      `ALTER TABLE conversation_state ADD COLUMN active_task_id BIGINT UNSIGNED NULL;`,
      `ALTER TABLE conversation_state ADD COLUMN active_task_stack_json JSON NULL;`,
      `ALTER TABLE conversation_state ADD COLUMN context_summary_id BIGINT UNSIGNED NULL;`,
      `ALTER TABLE conversation_state ADD COLUMN routing_state_json JSON NULL;`,
      `ALTER TABLE conversation_state ADD COLUMN summary_version INT UNSIGNED NOT NULL DEFAULT 1;`,
      `ALTER TABLE conversation_state ADD COLUMN clarification_attempt_count INT UNSIGNED NOT NULL DEFAULT 0;`,
      `ALTER TABLE conversation_state ADD COLUMN last_response_category VARCHAR(60) NULL;`,
      `ALTER TABLE conversation_state ADD COLUMN last_reply_language VARCHAR(30) NULL;`,
    ];
    for (const sql of convStateCols) {
      try {
        await execute(sql);
      } catch (err: any) {
        if (err?.errno !== 1060 && err?.code !== 'ER_DUP_FIELDNAME') {
          throw err;
        }
      }
    }

    // 20. Execute legacy raw PII columns migration to ensure no raw text columns exist
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
