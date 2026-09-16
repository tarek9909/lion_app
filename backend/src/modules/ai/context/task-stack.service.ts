import { v4 as uuidv4 } from 'uuid';
import { query, execute } from '../../../database/db.js';

export type TaskStatus = 'ACTIVE' | 'PAUSED' | 'RESOLVED' | 'CANCELLED';

export interface ConversationTask {
  id: number;
  publicId: string;
  conversationId: number;
  taskType: string;
  status: TaskStatus;
  parentTaskId: number | null;
  nextRequiredAction: string | null;
  expectedEntityType: string | null;
  candidateEntities: string[];
  lastQuestion: string | null;
  clarificationAttempts: number;
  sourceTurn: number;
  resolvedTurn: number | null;
  context: Record<string, any>;
  createdAt: string;
  updatedAt: string;
}

export interface CreateTaskInput {
  taskType: string;
  nextRequiredAction?: string | null;
  expectedEntityType?: string | null;
  candidateEntities?: string[];
  lastQuestion?: string | null;
  sourceTurn?: number;
  context?: Record<string, any>;
  parentTaskId?: number | null;
}

export class TaskStackService {
  async getActiveTask(conversationId: number): Promise<ConversationTask | null> {
    if (!conversationId) return null;
    const rows = await query<any[]>(
      `SELECT * FROM conversation_tasks
       WHERE conversation_id = ? AND status = 'ACTIVE'
       ORDER BY id DESC LIMIT 1`,
      [conversationId]
    );
    if (!rows || rows.length === 0) return null;
    return this.mapRow(rows[0]);
  }

  async getTaskStack(conversationId: number): Promise<ConversationTask[]> {
    if (!conversationId) return [];
    const rows = await query<any[]>(
      `SELECT * FROM conversation_tasks
       WHERE conversation_id = ? AND status IN ('ACTIVE', 'PAUSED')
       ORDER BY id DESC`,
      [conversationId]
    );
    return (rows || []).map((r) => this.mapRow(r));
  }

  async pushTask(conversationId: number, input: CreateTaskInput): Promise<ConversationTask> {
    // If there is an active task, pause it before pushing a new active task
    await execute(
      `UPDATE conversation_tasks
       SET status = 'PAUSED', updated_at = NOW()
       WHERE conversation_id = ? AND status = 'ACTIVE'`,
      [conversationId]
    );

    const publicId = uuidv4();
    const candidateJson = input.candidateEntities ? JSON.stringify(input.candidateEntities) : null;
    const contextJson = input.context ? JSON.stringify(input.context) : null;

    const res: any = await execute(
      `INSERT INTO conversation_tasks (
        public_id, conversation_id, task_type, status, parent_task_id,
        next_required_action, expected_entity_type, candidate_entities_json,
        last_question, clarification_attempts, source_turn, context_json,
        created_at, updated_at
      ) VALUES (?, ?, ?, 'ACTIVE', ?, ?, ?, ?, ?, 0, ?, ?, NOW(), NOW())`,
      [
        publicId,
        conversationId,
        input.taskType,
        input.parentTaskId || null,
        input.nextRequiredAction || null,
        input.expectedEntityType || null,
        candidateJson,
        input.lastQuestion || null,
        input.sourceTurn || 1,
        contextJson,
      ]
    );

    const taskId = res.insertId;
    return {
      id: taskId,
      publicId,
      conversationId,
      taskType: input.taskType,
      status: 'ACTIVE',
      parentTaskId: input.parentTaskId || null,
      nextRequiredAction: input.nextRequiredAction || null,
      expectedEntityType: input.expectedEntityType || null,
      candidateEntities: input.candidateEntities || [],
      lastQuestion: input.lastQuestion || null,
      clarificationAttempts: 0,
      sourceTurn: input.sourceTurn || 1,
      resolvedTurn: null,
      context: input.context || {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  async pauseActiveTask(conversationId: number): Promise<void> {
    await execute(
      `UPDATE conversation_tasks
       SET status = 'PAUSED', updated_at = NOW()
       WHERE conversation_id = ? AND status = 'ACTIVE'`,
      [conversationId]
    );
  }

  async resumeTask(conversationId: number, taskId?: number): Promise<ConversationTask | null> {
    // Pause any currently active task first
    await this.pauseActiveTask(conversationId);

    let targetId = taskId;
    if (!targetId) {
      const paused = await query<any[]>(
        `SELECT id FROM conversation_tasks
         WHERE conversation_id = ? AND status = 'PAUSED'
         ORDER BY id DESC LIMIT 1`,
        [conversationId]
      );
      if (paused.length > 0) {
        targetId = paused[0].id;
      }
    }

    if (!targetId) return null;

    await execute(
      `UPDATE conversation_tasks
       SET status = 'ACTIVE', updated_at = NOW()
       WHERE id = ? AND conversation_id = ?`,
      [targetId, conversationId]
    );

    const rows = await query<any[]>(
      `SELECT * FROM conversation_tasks WHERE id = ? LIMIT 1`,
      [targetId]
    );
    return rows.length > 0 ? this.mapRow(rows[0]) : null;
  }

  async resolveActiveTask(conversationId: number, resolvedTurn?: number): Promise<void> {
    await execute(
      `UPDATE conversation_tasks
       SET status = 'RESOLVED', resolved_turn = ?, updated_at = NOW()
       WHERE conversation_id = ? AND status = 'ACTIVE'`,
      [resolvedTurn || null, conversationId]
    );

    // If there's a paused task, automatically resume the most recent one
    await this.resumeTask(conversationId);
  }

  async cancelActiveTask(conversationId: number): Promise<void> {
    await execute(
      `UPDATE conversation_tasks
       SET status = 'CANCELLED', updated_at = NOW()
       WHERE conversation_id = ? AND status = 'ACTIVE'`,
      [conversationId]
    );
  }

  async incrementClarificationAttempts(taskId: number): Promise<number> {
    await execute(
      `UPDATE conversation_tasks
       SET clarification_attempts = clarification_attempts + 1, updated_at = NOW()
       WHERE id = ?`,
      [taskId]
    );
    const rows = await query<any[]>(
      `SELECT clarification_attempts FROM conversation_tasks WHERE id = ? LIMIT 1`,
      [taskId]
    );
    return rows.length > 0 ? Number(rows[0].clarification_attempts) : 1;
  }

  async findPausedTask(conversationId: number, taskType?: string): Promise<ConversationTask | null> {
    let sql = `SELECT * FROM conversation_tasks WHERE conversation_id = ? AND status = 'PAUSED'`;
    const params: any[] = [conversationId];
    if (taskType) {
      sql += ` AND task_type = ?`;
      params.push(taskType);
    }
    sql += ` ORDER BY id DESC LIMIT 1`;
    const rows = await query<any[]>(sql, params);
    return rows.length > 0 ? this.mapRow(rows[0]) : null;
  }

  private mapRow(r: any): ConversationTask {
    return {
      id: Number(r.id),
      publicId: r.public_id,
      conversationId: Number(r.conversation_id),
      taskType: r.task_type,
      status: r.status as TaskStatus,
      parentTaskId: r.parent_task_id ? Number(r.parent_task_id) : null,
      nextRequiredAction: r.next_required_action || null,
      expectedEntityType: r.expected_entity_type || null,
      candidateEntities: this.safeParseJson(r.candidate_entities_json, []),
      lastQuestion: r.last_question || null,
      clarificationAttempts: Number(r.clarification_attempts || 0),
      sourceTurn: Number(r.source_turn || 1),
      resolvedTurn: r.resolved_turn ? Number(r.resolved_turn) : null,
      context: this.safeParseJson(r.context_json, {}),
      createdAt: new Date(r.created_at).toISOString(),
      updatedAt: new Date(r.updated_at).toISOString(),
    };
  }

  private safeParseJson(raw: any, fallback: any): any {
    if (!raw) return fallback;
    if (typeof raw === 'object') return raw;
    try {
      return JSON.parse(raw);
    } catch {
      return fallback;
    }
  }
}

export const taskStackService = new TaskStackService();
