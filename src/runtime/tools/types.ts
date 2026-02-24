export type JsonSchema = Record<string, unknown>;

export type ToolResult =
  | { ok: true; content: string; data?: unknown }
  | { ok: false; error: string; data?: unknown };

export type ToolContext = {
  sessionId: string;
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
};

