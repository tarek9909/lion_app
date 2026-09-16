import { z } from 'zod';

export const TaskRelationEnum = z.enum([
  'ANSWER_TO_PENDING_TASK',
  'CONTINUATION',
  'CORRECTION',
  'TOPIC_INTERRUPTION',
  'NEW_TASK',
  'SAFETY_INTERRUPTION',
  'UNCLEAR',
]);

export const DecisionActionEnum = z.enum([
  'CALL_TOOL',
  'CLARIFY',
  'RESPOND_DIRECTLY',
  'HANDOFF',
]);

export const ActionRiskEnum = z.enum([
  'SAFE_READ_ONLY',
  'CONVERSATIONAL',
  'MUTATION_REVERSIBLE',
  'DESTRUCTIVE_REVERSIBLE',
  'FINANCIAL_IRREVERSIBLE',
]);

export const StructuredDecisionSchema = z.object({
  reply_language: z.string().default('arabizi'),
  task_relation: TaskRelationEnum.default('NEW_TASK'),
  intent: z.string().optional().default('UNKNOWN'),
  primaryIntent: z.string().optional(),
  selectedCategory: z.string().optional(),
  response_category: z.string().default('NORMAL'),
  understood_goal: z.string().nullable().optional(),
  confidence: z.number().optional(),
  reasoning: z.string().optional(),
  resolved_references: z
    .array(
      z.object({
        text: z.string(),
        resolves: z.string(),
        source: z.string(),
      })
    )
    .default([]),
  required_entities: z.array(z.string()).default([]),
  missing_entities: z.array(z.string()).default([]),
  ambiguities: z.array(z.string()).default([]),
  decision: DecisionActionEnum,
  tool: z
    .object({
      name: z.string(),
      arguments: z.record(z.any()).default({}),
    })
    .nullable()
    .optional(),
  uncertainty: z
    .object({
      intent: z.number().min(0).max(1).default(1),
      reference_resolution: z.number().min(0).max(1).default(1),
      entity_completeness: z.number().min(0).max(1).default(1),
      grounding: z.number().min(0).max(1).default(1),
    })
    .default({
      intent: 1,
      reference_resolution: 1,
      entity_completeness: 1,
      grounding: 1,
    }),
  risk: ActionRiskEnum.default('SAFE_READ_ONLY'),
});

export const aiDecisionSchema = StructuredDecisionSchema;

export type StructuredDecision = z.infer<typeof StructuredDecisionSchema>;

export function validateStructuredDecision(data: unknown): {
  success: boolean;
  decision?: StructuredDecision;
  errors?: string[];
} {
  const parsed = StructuredDecisionSchema.safeParse(data);
  if (parsed.success) {
    return { success: true, decision: parsed.data };
  }
  return {
    success: false,
    errors: parsed.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`),
  };
}
