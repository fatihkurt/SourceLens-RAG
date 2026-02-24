export type LLMRole = 'system' | 'user' | 'assistant';

export type LLMMessage = {
  role: LLMRole;
  content: string;
};

export type LLMUsage = {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
};

export type LLMChatParams = {
  messages: LLMMessage[];
  temperature?: number;
  maxTokens?: number;
  jsonMode?: boolean;
};

export type LLMChatResult = {
  content: string;
  usage?: LLMUsage;
  latencyMs: number;
  model: string;
};

export type LLMClient = {
  chat(params: LLMChatParams): Promise<LLMChatResult>;
};

