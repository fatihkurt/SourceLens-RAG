import type { LLMUsage } from '../../shared/llm/types.js';

export type PlannerParseMode = 'deterministic_router' | 'direct_parse' | 'repair_parse' | 'fail_closed';

export type PlannerObservation = {
  inputChars: number;
  outputType: 'tool_call' | 'final_answer';
  parseStatus: 'ok' | 'repaired' | 'failed';
  parseMode: PlannerParseMode;
  latencyMs: number;
  usage?: LLMUsage;
  llmCalls: number;
};

export type PlannerAnswerDecision = {
  type: 'final_answer';
  answer: string;
  confidence?: 'low' | 'medium' | 'high';
  rationale?: string;
  planner_reason?: string;
  parse_mode?: PlannerParseMode;
};

export type PlannerToolDecision = {
  type: 'tool_call';
  tool_name: string;
  args: Record<string, unknown>;
  rationale?: string;
  planner_reason?: string;
  parse_mode?: PlannerParseMode;
};

export type PlannerDecision = PlannerAnswerDecision | PlannerToolDecision;
