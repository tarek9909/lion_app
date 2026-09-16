import { createHash } from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { query, execute } from '../../../database/db.js';

export interface PromptRecord {
  id: number;
  publicId: string;
  version: string;
  name: string;
  promptTemplate: string;
  contentSha256: string;
  status: 'DRAFT' | 'EVALUATED' | 'ACTIVE' | 'RETIRED';
  isActive: boolean;
  evalResults?: Record<string, any> | null;
  createdAt: string;
  updatedAt: string;
}

export class PromptExperimentService {
  async registerPromptVersion(input: {
    version: string;
    name: string;
    promptTemplate: string;
    createdBy?: number;
  }): Promise<PromptRecord> {
    const publicId = uuidv4();
    const sha256 = createHash('sha256').update(input.promptTemplate).digest('hex');

    const res: any = await execute(
      `INSERT INTO ai_prompt_registry (
        public_id, version, name, prompt_template, content_sha256,
        status, is_active, created_by, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, 'DRAFT', 0, ?, NOW(), NOW())`,
      [
        publicId,
        input.version,
        input.name,
        input.promptTemplate,
        sha256,
        input.createdBy || null,
      ]
    );

    return {
      id: res.insertId,
      publicId,
      version: input.version,
      name: input.name,
      promptTemplate: input.promptTemplate,
      contentSha256: sha256,
      status: 'DRAFT',
      isActive: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  async listPrompts(): Promise<PromptRecord[]> {
    const rows = await query<any[]>(
      `SELECT * FROM ai_prompt_registry ORDER BY id DESC`
    );
    return rows.map((r) => ({
      id: Number(r.id),
      publicId: r.public_id,
      version: r.version,
      name: r.name,
      promptTemplate: r.prompt_template,
      contentSha256: r.content_sha256,
      status: r.status,
      isActive: Boolean(r.is_active),
      evalResults: typeof r.eval_results_json === 'string' ? JSON.parse(r.eval_results_json) : r.eval_results_json,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }));
  }

  async activatePromptVersion(version: string): Promise<boolean> {
    // Demote currently active prompt
    await execute(
      `UPDATE ai_prompt_registry SET is_active = 0, status = 'RETIRED', updated_at = NOW() WHERE is_active = 1`
    );

    const res: any = await execute(
      `UPDATE ai_prompt_registry SET is_active = 1, status = 'ACTIVE', updated_at = NOW() WHERE version = ?`,
      [version]
    );

    return (res?.affectedRows || 0) > 0;
  }
}

export const promptExperimentService = new PromptExperimentService();
