export type PlannerAnswerDecision = {
  type: 'final_answer';
  answer: string;
  confidence?: 'low' | 'medium' | 'high';
  rationale?: string;
};

export type PlannerToolDecision = {
  type: 'tool_call';
  tool_name: string;
  args: Record<string, unknown>;
  rationale?: string;
};

export type PlannerDecision = PlannerAnswerDecision | PlannerToolDecision;

