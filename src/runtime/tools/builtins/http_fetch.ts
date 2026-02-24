import { z } from 'zod';
import type { ToolDefinition } from '../tool.js';

const HttpFetchInput = z.object({
  url: z.string().url(),
  method: z.enum(['GET']).default('GET'),
});

export const httpFetchTool: ToolDefinition<{ url: string; method?: 'GET' }, { status: number; body: string }> = {
  name: 'http_fetch',
  description: 'Fetches public HTTP content with GET method only.',
  risk: 'medium',
  responseIsFinal: false,
  inputSchema: HttpFetchInput,
  async execute(args) {
    const parsed = HttpFetchInput.parse(args);
    const response = await fetch(parsed.url, { method: 'GET' });
    const body = await response.text();
    return { status: response.status, body: body.slice(0, 4000) };
  },
};
