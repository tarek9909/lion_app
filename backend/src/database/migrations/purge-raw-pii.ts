import { query, execute } from '../db.js';
import { PiiRedactor } from '../../modules/ai/telemetry/pii-redactor.js';

export interface MigrationResult {
  migrated: boolean;
  purgedColumns: string[];
  rowsPurged: number;
}

/**
 * Migration to purge and drop legacy raw PII columns from training_curation_queue.
 * Guarantees raw_user_message and model_response columns are completely removed.
 * Fails fatally if migration cannot complete.
 */
export async function migratePurgeRawPiiColumns(): Promise<MigrationResult> {
  const result: MigrationResult = {
    migrated: false,
    purgedColumns: [],
    rowsPurged: 0,
  };

  try {
    // Check which columns exist on training_curation_queue
    const existingCols = await query<any[]>(
      `SELECT COLUMN_NAME
       FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'training_curation_queue'`
    );

    const colNames = (existingCols || []).map((c: any) => c.COLUMN_NAME.toLowerCase());
    const hasRawUser = colNames.includes('raw_user_message');
    const hasRawModel = colNames.includes('model_response');

    if (!hasRawUser && !hasRawModel) {
      // Table is already clean
      return result;
    }

    console.log(`[Migration] Found legacy raw columns in training_curation_queue: raw_user_message=${hasRawUser}, model_response=${hasRawModel}`);

    // If raw columns have data that needs sanitized backfill
    if (hasRawUser || hasRawModel) {
      const selectCols = ['id'];
      if (hasRawUser) selectCols.push('raw_user_message');
      if (hasRawModel) selectCols.push('model_response');
      selectCols.push('sanitized_user_message', 'sanitized_model_response');

      const rows = await query<any[]>(
        `SELECT ${selectCols.join(', ')} FROM training_curation_queue`
      );

      for (const row of rows || []) {
        let needsUpdate = false;
        let sanitizedUser = row.sanitized_user_message;
        let sanitizedModel = row.sanitized_model_response;

        if (hasRawUser && (!sanitizedUser || sanitizedUser.trim() === '')) {
          sanitizedUser = PiiRedactor.redactText(row.raw_user_message || '');
          needsUpdate = true;
        }

        if (hasRawModel && (!sanitizedModel || sanitizedModel.trim() === '')) {
          sanitizedModel = PiiRedactor.redactText(row.model_response || '');
          needsUpdate = true;
        }

        if (needsUpdate) {
          await execute(
            `UPDATE training_curation_queue
             SET sanitized_user_message = ?, sanitized_model_response = ?
             WHERE id = ?`,
            [sanitizedUser, sanitizedModel, row.id]
          );
          result.rowsPurged++;
        }
      }

      // Purge values before dropping
      if (hasRawUser) {
        await execute(`UPDATE training_curation_queue SET raw_user_message = '[PURGED]'`);
      }
      if (hasRawModel) {
        await execute(`UPDATE training_curation_queue SET model_response = '[PURGED]'`);
      }

      // Drop columns
      if (hasRawUser) {
        await execute(`ALTER TABLE training_curation_queue DROP COLUMN raw_user_message`);
        result.purgedColumns.push('raw_user_message');
        console.log('[Migration] Successfully dropped column: raw_user_message');
      }
      if (hasRawModel) {
        await execute(`ALTER TABLE training_curation_queue DROP COLUMN model_response`);
        result.purgedColumns.push('model_response');
        console.log('[Migration] Successfully dropped column: model_response');
      }
    }

    // Verify columns no longer exist
    const postCols = await query<any[]>(
      `SELECT COLUMN_NAME
       FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'training_curation_queue'
         AND COLUMN_NAME IN ('raw_user_message', 'model_response')`
    );

    if (postCols && postCols.length > 0) {
      throw new Error(`Migration verification failed: Legacy columns still exist: ${postCols.map((c: any) => c.COLUMN_NAME).join(', ')}`);
    }

    result.migrated = true;

    // Record audit event
    await execute(
      `INSERT INTO ai_audit_events (event_type, entity_type, entity_id, details_json, created_at)
       VALUES ('LEGACY_RAW_PII_COLUMNS_DROPPED', 'SCHEMA_MIGRATION', 'training_curation_queue', ?, NOW())`,
      [JSON.stringify(result)]
    );

    console.log('[Migration] Legacy raw PII columns purged and dropped successfully.');
    return result;
  } catch (err: any) {
    console.error('[Migration Error] Fatal failure during legacy PII migration:', err);
    throw err;
  }
}
