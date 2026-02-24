import type { ToolHandler, ToolManifest } from '../runtime/tools/types.js';

export const manifest: ToolManifest = {
  name: 'echo',
  description: 'Echo back the provided text.',
  responseIsFinal: true,
  readOnly: true,
  timeoutMs: 2000,
  risk: 'low',
  inputSchema: {
    type: 'object',
    properties: { text: { type: 'string' } },
    required: ['text'],
    additionalProperties: false,
  },
};

export const handler: ToolHandler = async (args) => {
  const a = args as { text?: unknown };
  if (typeof a?.text !== 'string' || !a.text.trim()) {
    return { ok: false, error: 'text must be a non-empty string' };
  }
  return { ok: true, content: a.text };
};

