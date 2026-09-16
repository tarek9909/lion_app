import { query, execute } from '../../../database/db.js';
import { v4 as uuidv4 } from 'uuid';

export interface ApprovedCase {
  id: number;
  caseSetId: number;
  stage: string;
  intent: string;
  language: string;
  exampleInput: string;
  exampleReasoning: string | null;
  exampleToolCalls: any[];
  exampleResponse: string;
  targetReplyText: string;
}

export class ApprovedCaseRetrieverService {
  async retrieveApprovedCases(options: {
    stage?: string;
    intent?: string;
    language?: string;
    limit?: number;
  }): Promise<ApprovedCase[]> {
    return this.getRelevantCases(options);
  }

  async getRelevantCases(options: {
    stage?: string;
    intent?: string;
    language?: string;
    limit?: number;
  }): Promise<ApprovedCase[]> {
    const limit = options.limit || 3;
    try {
      // Find active case set
      const activeSets = await query<any[]>(
        `SELECT id FROM ai_case_sets WHERE is_active = 1 ORDER BY id DESC LIMIT 1`
      );
      if (!activeSets || activeSets.length === 0) return [];
      const caseSetId = activeSets[0].id;

      let sql = `
        SELECT m.*,
               COALESCE(c.target_reply_text, c.reviewer_corrected_reply, m.example_response, '') AS target_reply_text,
               COALESCE(c.target_intent, c.reviewer_corrected_intent, m.intent, 'ANY') AS effective_intent,
               COALESCE(c.user_message, m.example_input, '') AS effective_input
        FROM ai_case_set_members m
        LEFT JOIN ai_learning_cases c ON (m.case_id = c.id OR m.learning_case_id = c.id)
        WHERE m.case_set_id = ?
      `;
      const params: any[] = [caseSetId];

      if (options.stage && options.stage !== 'ANY') {
        sql += ` AND (m.stage = ? OR m.stage = 'ANY' OR m.stage IS NULL)`;
        params.push(options.stage);
      }
      if (options.language && options.language !== 'any') {
        sql += ` AND (m.language = ? OR m.language = 'any' OR m.language IS NULL)`;
        params.push(options.language);
      }
      if (options.intent && options.intent !== 'UNKNOWN' && options.intent !== 'ANY') {
        sql += ` AND (m.intent = ? OR m.intent = 'ANY' OR c.target_intent = ? OR c.reviewer_corrected_intent = ? OR m.intent IS NULL)`;
        params.push(options.intent, options.intent, options.intent);
      }

      sql += ` ORDER BY m.id DESC LIMIT ?`;
      params.push(limit);

      const rows = await query<any[]>(sql, params);
      return (rows || []).map((r) => ({
        id: Number(r.id),
        caseSetId: Number(r.case_set_id),
        stage: r.stage || 'ANY',
        intent: r.effective_intent || r.intent || 'ANY',
        language: r.language || 'arabizi',
        exampleInput: r.effective_input || r.example_input || '',
        exampleReasoning: r.example_reasoning || null,
        exampleToolCalls: this.safeParseJson(r.example_tool_calls_json, []),
        exampleResponse: r.target_reply_text || r.example_response || '',
        targetReplyText: r.target_reply_text || r.example_response || '',
      }));
    } catch {
      return [];
    }
  }

  formatCasesForPrompt(cases: ApprovedCase[]): string {
    if (!cases || cases.length === 0) return '';
    const blocks: string[] = ['[VERIFIED FEW-SHOT DIALOGUE EXAMPLES (AUTHORITATIVE STYLE & REASONING)]'];
    cases.forEach((c, idx) => {
      blocks.push(
        `Example ${idx + 1} (${c.language}, Stage: ${c.stage}, Intent: ${c.intent}):\n` +
        `Customer: "${c.exampleInput}"\n` +
        (c.exampleReasoning ? `Reasoning: ${c.exampleReasoning}\n` : '') +
        (c.exampleToolCalls.length > 0 ? `Tools: ${JSON.stringify(c.exampleToolCalls)}\n` : '') +
        `Assistant: "${c.exampleResponse}"`
      );
    });
    return blocks.join('\n\n');
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

export const approvedCaseRetrieverService = new ApprovedCaseRetrieverService();
