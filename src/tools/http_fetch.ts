import type { ToolHandler, ToolManifest } from '../runtime/tools/types.js';

export const manifest: ToolManifest = {
  name: 'http_fetch',
  description: 'Fetches public HTTP content with GET method only.',
  responseIsFinal: false,
  readOnly: true,
  timeoutMs: 4000,
  risk: 'medium',
  inputSchema: {
    type: 'object',
    properties: {
      url: { type: 'string' },
      method: { type: 'string' },
    },
    required: ['url'],
    additionalProperties: false,
  },
};

export const handler: ToolHandler = async (args) => {
  const a = args as { url?: unknown; method?: unknown };
  if (typeof a?.url !== 'string') {
    return { ok: false, error: 'url must be a string' };
  }

  let parsed: URL;
  try {
    parsed = new URL(a.url);
  } catch {
    return { ok: false, error: 'url must be valid' };
  }

  const method = typeof a.method === 'string' ? a.method.toUpperCase() : 'GET';
  if (method !== 'GET') {
    return { ok: false, error: 'only GET is supported' };
  }

  const response = await fetch(parsed.toString(), { method: 'GET' });
  const body = await response.text();
  return {
    ok: true,
    content: body.slice(0, 1200),
    data: { status: response.status, url: parsed.toString() },
  };
};

