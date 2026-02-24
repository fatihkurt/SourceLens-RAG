import type { MemoryItem } from '../memory/types.js';
import type { ToolResult } from '../tools/tool.js';
import type { RetrievedChunk } from '../../retrieval/retrieve.js';

export type ContextBuildInput = {
  question: string;
  systemPrompt: string;
  memory: MemoryItem[];
  retrieved: RetrievedChunk[];
  toolResults: ToolResult[];
  maxChars?: number;
};

export type RenderedContext = {
  system: string;
  user: string;
  retrieval: string;
  tools: string;
  memory: string;
  full: string;
};

