import { z } from 'zod';

const finalAnswerDecision = z.object({
  type: z.literal('final_answer'),
  answer: z.string().min(1),
  confidence: z.enum(['low', 'medium', 'high']).optional(),
  rationale: z.string().optional(),
});

const toolCallDecision = z.object({
  type: z.literal('tool_call'),
  tool_name: z.string().min(1),
  args: z.record(z.string(), z.unknown()).default({}),
  rationale: z.string().optional(),
});

export const PlannerDecisionSchema = z.union([finalAnswerDecision, toolCallDecision]);

