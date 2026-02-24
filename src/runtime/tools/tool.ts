import type { ZodTypeAny } from 'zod';

export type ToolRisk = 'low' | 'medium' | 'high';

export type ToolExecutionContext = {
  sessionId: string;
  traceId?: string;
};

export type ToolDefinition<TArgs = unknown, TResult = unknown> = {
  name: string;
  description: string;
  risk: ToolRisk;
  responseIsFinal?: boolean;
  inputSchema: ZodTypeAny;
  execute(args: TArgs, context: ToolExecutionContext): Promise<TResult>;
};

export type ToolCall = {
  tool_name: string;
  args: Record<string, unknown>;
};

export type ToolResult = {
  ok: boolean;
  tool_name: string;
  result?: unknown;
  error?: string;
};
