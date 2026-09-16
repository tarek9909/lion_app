import { v4 as uuidv4 } from 'uuid';
import { query, execute } from '../../../database/db.js';

export interface CatalogAliasCandidate {
  id: number;
  publicId: string;
  aliasTerm: string;
  targetType: 'PRODUCT' | 'MERCHANT';
  targetId: number;
  targetName: string;
  language: string;
  distinctCustomerCount: number;
  status: 'CANDIDATE' | 'APPROVED' | 'REJECTED';
  createdAt: string;
}

export class CatalogAliasService {
  /**
   * Observe unknown or localized search term.
   * Increments distinct customer count. Promotes only when >= 3 distinct customers observed or operator approved.
   */
  async recordAliasObservation(options: {
    aliasTerm: string;
    targetType: 'PRODUCT' | 'MERCHANT';
    targetId: number;
    targetName: string;
    customerId: number;
    language?: string;
  }): Promise<{ candidate: CatalogAliasCandidate; promoted: boolean }> {
    const term = options.aliasTerm.trim().toLowerCase();
    const language = options.language || 'arabizi';

    const existing = await query<any[]>(
      `SELECT * FROM catalog_alias_candidates
       WHERE alias_term = ? AND target_type = ? AND target_id = ? LIMIT 1`,
      [term, options.targetType, options.targetId]
    );

    let candidateId: number;
    let publicId: string;
    let count = 1;
    let customerIds: number[] = [options.customerId];
    let status: 'CANDIDATE' | 'APPROVED' | 'REJECTED' = 'CANDIDATE';

    if (existing.length > 0) {
      const row = existing[0];
      candidateId = Number(row.id);
      publicId = row.public_id;
      status = row.status;

      try {
        const parsedIds: number[] = typeof row.customer_ids_json === 'string'
          ? JSON.parse(row.customer_ids_json)
          : (row.customer_ids_json || []);
        if (!parsedIds.includes(options.customerId)) {
          parsedIds.push(options.customerId);
        }
        customerIds = parsedIds;
        count = customerIds.length;
      } catch {}

      // Section 10.6 Quorum Rule: >= 3 distinct consenting customers unlocks approval
      let newStatus = status;
      if (count >= 3 && status === 'CANDIDATE') {
        newStatus = 'APPROVED';
      }

      await execute(
        `UPDATE catalog_alias_candidates
         SET distinct_customer_count = ?,
             customer_ids_json = ?,
             status = ?,
             updated_at = NOW()
         WHERE id = ?`,
        [count, JSON.stringify(customerIds), newStatus, candidateId]
      );
      status = newStatus;
    } else {
      publicId = uuidv4();
      const res: any = await execute(
        `INSERT INTO catalog_alias_candidates (
          public_id, alias_term, target_type, target_id, target_name,
          language, distinct_customer_count, customer_ids_json, status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, 1, ?, 'CANDIDATE', NOW(), NOW())`,
        [
          publicId,
          term,
          options.targetType,
          options.targetId,
          options.targetName,
          language,
          JSON.stringify(customerIds),
        ]
      );
      candidateId = res.insertId;
    }

    return {
      candidate: {
        id: candidateId,
        publicId,
        aliasTerm: term,
        targetType: options.targetType,
        targetId: options.targetId,
        targetName: options.targetName,
        language,
        distinctCustomerCount: count,
        status,
        createdAt: new Date().toISOString(),
      },
      promoted: status === 'APPROVED',
    };
  }

  async getApprovedAliases(language?: string): Promise<Record<string, { targetType: string; targetId: number; targetName: string }>> {
    let sql = `SELECT alias_term, target_type, target_id, target_name FROM catalog_alias_candidates WHERE status = 'APPROVED'`;
    const params: any[] = [];
    if (language) {
      sql += ` AND (language = ? OR language = 'any')`;
      params.push(language);
    }
    const rows = await query<any[]>(sql, params);
    const map: Record<string, { targetType: string; targetId: number; targetName: string }> = {};
    for (const r of rows) {
      map[r.alias_term.toLowerCase()] = {
        targetType: r.target_type,
        targetId: Number(r.target_id),
        targetName: r.target_name,
      };
    }
    return map;
  }
}

export const catalogAliasService = new CatalogAliasService();
