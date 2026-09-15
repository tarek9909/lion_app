import fs from 'fs';
import path from 'path';
import { z } from 'zod';
import Ajv from 'ajv';
import { CANONICAL_INTENTS, SUPPORTED_LANGUAGES, CLARIFICATION_TYPES } from '../contract/behavior.contract.js';

export interface ValidationSummary {
  totalRecords: number;
  byFile: Record<string, number>;
  bySplit: Record<string, number>;
  byLanguage: Record<string, number>;
  byIntent: Record<string, number>;
  leakageViolations: string[];
  schemaErrors: string[];
  humanReviewIntegrityErrors: string[];
  humanReviewTargetStatus: string;
}

const TurnRecordSchema = z.object({
  id: z.string().min(1),
  conversation_id: z.string().min(1),
  customer_id: z.string().min(1),
  split: z.enum(['train', 'val', 'test', 'locked_safety']),
  turn_index: z.number().int().min(1),
  history: z.array(
    z.object({
      role: z.enum(['user', 'assistant', 'tool']),
      text: z.string(),
    })
  ),
  state_before: z.record(z.any()),
  customer_message: z.string().min(1),
  language: z.enum(['en', 'ar', 'ar_lb', 'arabizi', 'mixed']),
  intent: z.enum(CANONICAL_INTENTS as any),
  entities: z.record(z.any()),
  needs_clarification: z.boolean(),
  clarification_type: z.string().nullable().optional(),
  expected_tool: z.string().nullable().optional(),
  expected_tool_arguments: z.record(z.any()).nullable().optional(),
  expected_state_change: z.record(z.any()).nullable().optional(),
  required_reply_facts: z.array(z.string()),
  forbidden_actions: z.array(z.string()),
  provenance: z.enum(['SYNTHETIC_SEED', 'CUSTOMER_LOG', 'EDGE_CASE']),
  human_review_status: z.enum(['SYNTHETIC_UNREVIEWED', 'HUMAN_APPROVED', 'REJECTED', 'PENDING']),
});

const VoiceRecordSchema = z.object({
  id: z.string().min(1),
  audio_fixture: z.string().min(1),
  expected_transcript: z.string().min(1),
  detected_language: z.string().min(1),
  entities: z.record(z.any()),
  expected_downstream_tool: z.string().min(1),
  provenance: z.enum(['SYNTHETIC_SEED', 'CUSTOMER_LOG', 'EDGE_CASE']),
  human_review_status: z.enum(['SYNTHETIC_UNREVIEWED', 'HUMAN_APPROVED', 'REJECTED', 'PENDING']),
});

const ImageRecordSchema = z.object({
  id: z.string().min(1),
  image_fixture: z.string().min(1),
  candidate_queries: z.array(z.string().min(1)).min(1),
  confidence: z.number().min(0).max(1),
  needs_clarification: z.boolean(),
  provenance: z.enum(['SYNTHETIC_SEED', 'CUSTOMER_LOG', 'EDGE_CASE']),
  human_review_status: z.enum(['SYNTHETIC_UNREVIEWED', 'HUMAN_APPROVED', 'REJECTED', 'PENDING']),
});

const ManagementAiRecordSchema = z.object({
  id: z.string().min(1),
  question: z.string().min(1),
  paraphrases: z.array(z.string().min(1)),
  canonical_metric: z.string().min(1),
  requires_read_only_fn: z.union([z.boolean(), z.string().min(1)]),
  provenance: z.enum(['SYNTHETIC_SEED', 'CUSTOMER_LOG', 'EDGE_CASE']),
  human_review_status: z.enum(['SYNTHETIC_UNREVIEWED', 'HUMAN_APPROVED', 'REJECTED', 'PENDING']),
});

export function validateDatasets(baseDir?: string): ValidationSummary {
  const dir =
    baseDir ||
    (fs.existsSync(path.resolve(process.cwd(), '../datasets/v1'))
      ? path.resolve(process.cwd(), '../datasets/v1')
      : path.resolve(process.cwd(), 'datasets/v1'));

  const summary: ValidationSummary = {
    totalRecords: 0,
    byFile: {},
    bySplit: {},
    byLanguage: {},
    byIntent: {},
    leakageViolations: [],
    schemaErrors: [],
    humanReviewIntegrityErrors: [],
    humanReviewTargetStatus: 'PENDING_HUMAN_REVIEW (target: 3,000–5,000 human-reviewed turns)',
  };

  const convToSplits = new Map<string, Set<string>>();
  const custToSplits = new Map<string, Set<string>>();

  // The checked-in JSON Schema is executable validation, not documentation.
  const schemaPath = path.join(dir, 'schemas', 'turn-schema.json');
  let validateTurnJson: ((record: unknown) => boolean) & { errors?: any[] };
  if (!fs.existsSync(schemaPath)) {
    summary.schemaErrors.push(`Dataset schema missing: ${schemaPath}`);
    validateTurnJson = Object.assign(() => false, { errors: [{ message: 'schema missing' }] });
  } else {
    const ajv = new Ajv({ allErrors: true, strict: false });
    validateTurnJson = ajv.compile(JSON.parse(fs.readFileSync(schemaPath, 'utf8'))) as typeof validateTurnJson;
  }

  // All 7 dataset files (Core Requirement 5)
  const allFiles = [
    'single_turn_nlu.jsonl',
    'multi_turn_traces.jsonl',
    'clarification_examples.jsonl',
    'safety_adversarial.jsonl',
    'voice_transcription.jsonl',
    'image_candidates.jsonl',
    'management_ai.jsonl',
  ];

  for (const filename of allFiles) {
    const filePath = path.join(dir, filename);
    if (!fs.existsSync(filePath)) {
      summary.schemaErrors.push(`Dataset file missing: ${filename}`);
      continue;
    }

    const lines = fs
      .readFileSync(filePath, 'utf8')
      .split('\n')
      .filter((l) => l.trim().length > 0);

    summary.byFile[filename] = lines.length;

    for (let idx = 0; idx < lines.length; idx++) {
      let record: any;
      try {
        record = JSON.parse(lines[idx]);
      } catch (err) {
        summary.schemaErrors.push(`${filename}:${idx + 1}: Invalid JSON line`);
        continue;
      }

      summary.totalRecords++;

      const metadata = z.object({
        provenance: z.enum(['SYNTHETIC_SEED', 'CUSTOMER_LOG', 'EDGE_CASE']),
        human_review_status: z.enum(['SYNTHETIC_UNREVIEWED', 'HUMAN_APPROVED', 'REJECTED', 'PENDING']),
      }).safeParse(record);
      if (!metadata.success) {
        for (const issue of metadata.error.issues) {
          summary.schemaErrors.push(`${filename}:${idx + 1}: ${issue.path.join('.') || 'root'}: ${issue.message}`);
        }
      }

      if (record.provenance === 'SYNTHETIC_SEED' && record.human_review_status === 'HUMAN_APPROVED') {
        summary.humanReviewIntegrityErrors.push(
          `${filename}:${idx + 1}: Synthetic record falsely claims HUMAN_APPROVED status without human annotation.`
        );
      }

      // 1. Voice transcription file schema validation
      if (filename === 'voice_transcription.jsonl') {
        const parsed = VoiceRecordSchema.safeParse(record);
        if (!parsed.success) {
          for (const issue of parsed.error.issues) {
            summary.schemaErrors.push(`${filename}:${idx + 1}: ${issue.path.join('.') || 'root'}: ${issue.message}`);
          }
        }
        continue;
      }

      // 2. Image candidates file schema validation
      if (filename === 'image_candidates.jsonl') {
        const parsed = ImageRecordSchema.safeParse(record);
        if (!parsed.success) {
          for (const issue of parsed.error.issues) {
            summary.schemaErrors.push(`${filename}:${idx + 1}: ${issue.path.join('.') || 'root'}: ${issue.message}`);
          }
        }
        continue;
      }

      // 3. Management AI file schema validation
      if (filename === 'management_ai.jsonl') {
        const parsed = ManagementAiRecordSchema.safeParse(record);
        if (!parsed.success) {
          for (const issue of parsed.error.issues) {
            summary.schemaErrors.push(`${filename}:${idx + 1}: ${issue.path.join('.') || 'root'}: ${issue.message}`);
          }
        }
        continue;
      }

      // 4. Turn record exhaustive schema validation (single_turn, multi_turn, clarification, safety)
      if (!validateTurnJson(record)) {
        for (const issue of validateTurnJson.errors || []) {
          summary.schemaErrors.push(`${filename}:${idx + 1}: JSON Schema ${issue.instancePath || '/'}: ${issue.message}`);
        }
      }
      const parsed = TurnRecordSchema.safeParse(record);
      if (!parsed.success) {
        for (const issue of parsed.error.issues) {
          summary.schemaErrors.push(`${filename}:${idx + 1}: ${issue.path.join('.') || 'root'}: ${issue.message}`);
        }
      }

      // Clarification type semantic validity
      if (record.clarification_type && !CLARIFICATION_TYPES.includes(record.clarification_type)) {
        summary.schemaErrors.push(
          `${filename}:${idx + 1}: Unknown clarification type '${record.clarification_type}'`
        );
      }

      // Track aggregates
      const split = record.split || 'unknown';
      summary.bySplit[split] = (summary.bySplit[split] || 0) + 1;

      const lang = record.language || 'unknown';
      summary.byLanguage[lang] = (summary.byLanguage[lang] || 0) + 1;

      const intent = record.intent || 'unknown';
      summary.byIntent[intent] = (summary.byIntent[intent] || 0) + 1;

      // Track split leakage by conversation_id
      if (record.conversation_id) {
        if (!convToSplits.has(record.conversation_id)) {
          convToSplits.set(record.conversation_id, new Set());
        }
        convToSplits.get(record.conversation_id)!.add(split);
      }

      // Track split leakage by customer_id
      if (record.customer_id) {
        if (!custToSplits.has(record.customer_id)) {
          custToSplits.set(record.customer_id, new Set());
        }
        custToSplits.get(record.customer_id)!.add(split);
      }
    }
  }

  // Detect conversation leakage
  for (const [convId, splits] of convToSplits.entries()) {
    if (splits.size > 1) {
      summary.leakageViolations.push(
        `Conversation Leakage: Conversation ${convId} appears in multiple splits: ${Array.from(splits).join(', ')}`
      );
    }
  }

  // Detect customer identity leakage
  for (const [custId, splits] of custToSplits.entries()) {
    if (splits.size > 1) {
      summary.leakageViolations.push(
        `Customer Identity Leakage: Customer ${custId} appears in multiple splits: ${Array.from(splits).join(', ')}`
      );
    }
  }

  return summary;
}

if (process.argv[1] && process.argv[1].endsWith('dataset-validator.ts')) {
  const res = validateDatasets();
  console.log('Dataset Validation Results:', JSON.stringify(res, null, 2));
  if (
    res.schemaErrors.length > 0 ||
    res.leakageViolations.length > 0 ||
    res.humanReviewIntegrityErrors.length > 0
  ) {
    process.exit(1);
  }
}
