import { v4 as uuidv4 } from 'uuid';
import { query, execute } from '../../../database/db.js';

export interface ConversationSummary {
  id: number;
  publicId: string;
  conversationId: number;
  summaryVersion: number;
  customerGoal: string | null;
  confirmedConstraints: string[];
  decisions: string[];
  corrections: string[];
  unresolved: string[];
  sourceTurnStart: number;
  sourceTurnEnd: number;
  languageProfile: string;
  summaryText: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SummaryUpdateInput {
  customerGoal?: string | null;
  addConfirmedConstraints?: string[];
  addDecisions?: string[];
  addCorrections?: string[];
  setUnresolved?: string[];
  sourceTurn?: number;
  languageProfile?: string;
  summaryText?: string | null;
}

export class ConversationSummaryService {
  async getLatestSummary(conversationId: number): Promise<ConversationSummary | null> {
    if (!conversationId) return null;
    const rows = await query<any[]>(
      `SELECT * FROM conversation_summaries
       WHERE conversation_id = ?
       ORDER BY summary_version DESC LIMIT 1`,
      [conversationId]
    );
    if (!rows || rows.length === 0) return null;
    return this.mapRow(rows[0]);
  }

  async updateSummary(conversationId: number, input: SummaryUpdateInput): Promise<ConversationSummary> {
    const current = await this.getLatestSummary(conversationId);
    const publicId = uuidv4();
    const nextVersion = current ? current.summaryVersion + 1 : 1;

    const goal = input.customerGoal !== undefined ? input.customerGoal : (current?.customerGoal || null);
    const confirmedConstraints = Array.from(new Set([
      ...(current?.confirmedConstraints || []),
      ...(input.addConfirmedConstraints || []),
    ]));
    const decisions = Array.from(new Set([
      ...(current?.decisions || []),
      ...(input.addDecisions || []),
    ]));
    const corrections = Array.from(new Set([
      ...(current?.corrections || []),
      ...(input.addCorrections || []),
    ]));
    const unresolved = input.setUnresolved !== undefined ? input.setUnresolved : (current?.unresolved || []);
    const sourceTurnStart = current ? current.sourceTurnStart : (input.sourceTurn || 1);
    const sourceTurnEnd = Math.max(current?.sourceTurnEnd || 1, input.sourceTurn || 1);
    const languageProfile = input.languageProfile || current?.languageProfile || 'arabizi';

    let summaryText = input.summaryText;
    if (!summaryText) {
      const parts: string[] = [];
      if (goal) parts.push(`Goal: ${goal}`);
      if (confirmedConstraints.length > 0) parts.push(`Constraints: ${confirmedConstraints.join(', ')}`);
      if (decisions.length > 0) parts.push(`Decisions: ${decisions.join(', ')}`);
      if (corrections.length > 0) parts.push(`Corrections: ${corrections.join(', ')}`);
      if (unresolved.length > 0) parts.push(`Unresolved: ${unresolved.join(', ')}`);
      summaryText = parts.join(' | ');
    }

    const res: any = await execute(
      `INSERT INTO conversation_summaries (
        public_id, conversation_id, summary_version, customer_goal,
        confirmed_constraints_json, decisions_json, corrections_json,
        unresolved_json, source_turn_start, source_turn_end,
        language_profile, summary_text, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
      [
        publicId,
        conversationId,
        nextVersion,
        goal,
        JSON.stringify(confirmedConstraints),
        JSON.stringify(decisions),
        JSON.stringify(corrections),
        JSON.stringify(unresolved),
        sourceTurnStart,
        sourceTurnEnd,
        languageProfile,
        summaryText,
      ]
    );

    return {
      id: res.insertId,
      publicId,
      conversationId,
      summaryVersion: nextVersion,
      customerGoal: goal,
      confirmedConstraints,
      decisions,
      corrections,
      unresolved,
      sourceTurnStart,
      sourceTurnEnd,
      languageProfile,
      summaryText,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  formatSummaryForPrompt(summary: ConversationSummary | null): string {
    if (!summary) return '';
    const lines: string[] = ['[CONVERSATION GROUNDED SUMMARY]'];
    if (summary.customerGoal) lines.push(`- Goal: ${summary.customerGoal}`);
    if (summary.confirmedConstraints.length > 0) {
      lines.push(`- Confirmed constraints: ${summary.confirmedConstraints.join('; ')}`);
    }
    if (summary.decisions.length > 0) {
      lines.push(`- Decisions made: ${summary.decisions.join('; ')}`);
    }
    if (summary.corrections.length > 0) {
      lines.push(`- Customer corrections: ${summary.corrections.join('; ')}`);
    }
    if (summary.unresolved.length > 0) {
      lines.push(`- Pending unresolved items: ${summary.unresolved.join('; ')}`);
    }
    lines.push(`- Source turn range: [${summary.sourceTurnStart} - ${summary.sourceTurnEnd}]`);
    return lines.join('\n');
  }

  private mapRow(r: any): ConversationSummary {
    return {
      id: Number(r.id),
      publicId: r.public_id,
      conversationId: Number(r.conversation_id),
      summaryVersion: Number(r.summary_version || 1),
      customerGoal: r.customer_goal || null,
      confirmedConstraints: this.safeParseJson(r.confirmed_constraints_json, []),
      decisions: this.safeParseJson(r.decisions_json, []),
      corrections: this.safeParseJson(r.corrections_json, []),
      unresolved: this.safeParseJson(r.unresolved_json, []),
      sourceTurnStart: Number(r.source_turn_start || 1),
      sourceTurnEnd: Number(r.source_turn_end || 1),
      languageProfile: r.language_profile || 'arabizi',
      summaryText: r.summary_text || null,
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

export const conversationSummaryService = new ConversationSummaryService();
