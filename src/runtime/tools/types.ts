export type JsonSchema = Record<string, unknown>;

export type ToolResult =
  | { ok: true; content: string; data?: unknown }
  | { ok: false; error: string; data?: unknown };

export type ToolErrorCode =
  | 'tool_not_allowed'
  | 'tool_not_found'
  | 'arg_validation_failed'
  | 'tool_risk_high'
  | 'tool_execution_failed'
  | 'policy_blocked';

export type ToolErrorFeedback = {
  type: 'tool_error';
  code: ToolErrorCode;
  tool: string;
  message: string;
  retryable: boolean;
  provided_args?: unknown;
  expected_schema?: JsonSchema;
  allowed_tools?: string[];
};

export type ToolContext = {
  sessionId: string;
  // ileride: logger, secrets, identity, rateLimit vb.
};

export type ToolHandler = (args: unknown, ctx: ToolContext) => Promise<ToolResult>;

export type ToolManifest = {
  name: string;
  description: string;
  inputSchema?: JsonSchema;
  responseIsFinal?: boolean;
  readOnly?: boolean;
  timeoutMs?: number;
  risk?: 'low' | 'medium' | 'high';
};

export type ToolCall = {
  tool_name: string;
  args: unknown;
};

export type ToolExecutionRecord = {
  tool: string;
  result: ToolResult;
  feedback?: ToolErrorFeedback;
};
