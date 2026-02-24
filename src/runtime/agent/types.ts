import type { PlannerDecision } from '../planner/types.js';
import type { ToolResult } from '../tools/tool.js';
import type { TraceSpan } from '../telemetry/trace.js';

export type Turn = {
  turn: number;
  decision: PlannerDecision;
  toolResult?: ToolResult;
};

export type AgentRunInput = {
  question: string;
  sessionId?: string;
  topK?: number;
  topN?: number;
  systemPrompt?: string;
};

export type AgentRunResult = {
  answer: string;
  confidence: 'low' | 'medium' | 'high';
  confidence_reason?: string;
  turns: Turn[];
  sources: Array<{ source: string; chunk_index: number; score?: number }>;
  meta: {
    sessionId: string;
    toolCalls: number;
    retrievalCount: number;
    retrievalSkipped?: boolean;
    retrievalReason?: string;
    confidence_reason?: string;
    durationMs: number;
    traces: TraceSpan[];
  };
};
