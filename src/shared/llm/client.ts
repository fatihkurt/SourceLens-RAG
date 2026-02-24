import { parseRetryAfterMs, retryWithBackoff } from '../../utils/retryWithBackoff.js';
import { config } from '../../core/config.js';
import type { LLMChatParams, LLMChatResult, LLMClient } from './types.js';

type ClientOptions = {
  baseUrl?: string;
  apiKey?: string;
  model?: string;
  retries?: number;
  retryBaseMs?: number;
  retryMaxMs?: number;
};

function normalizeOpenAIBaseUrl(raw: string): string {
  const value = String(raw ?? '').trim();
  if (!value) return '';

  const cleaned = value.replace(/\/+$/, '');
  try {
    const url = new URL(cleaned);
    const path = url.pathname.replace(/\/+$/, '');
    if (!path || path === '/') {
      url.pathname = '/v1';
    }
    return url.toString().replace(/\/+$/, '');
  } catch {
    return cleaned;
  }
}

function escapeRegex(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function extractAllowedTools(messages: LLMChatParams['messages']): string[] {
  const systemText = messages
    .filter((m) => m.role === 'system')
    .map((m) => m.content)
    .join('\n');

  const out = new Set<string>();
  for (const line of systemText.split('\n')) {
    const match = line.match(/^\s*-\s*([a-zA-Z0-9_:-]+)\s+\(risk=/);
    if (match?.[1]) out.add(match[1]);
  }
  return [...out];
}

function findLastUserMessage(messages: LLMChatParams['messages']): string {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i]?.role === 'user') return String(messages[i]?.content ?? '');
  }
  return '';
}

function tryParseObject(payload: string): Record<string, unknown> | null {
  const trimmed = String(payload ?? '').trim();
  if (!trimmed) return null;
  if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) return null;
  try {
    const parsed = JSON.parse(trimmed);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function parseKeyValuePayload(payload: string): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const matches = String(payload ?? '').match(/\b[a-zA-Z_][a-zA-Z0-9_]*\s*=\s*[^\s]+/g) ?? [];
  for (const m of matches) {
    const idx = m.indexOf('=');
    if (idx <= 0) continue;
    const k = m.slice(0, idx).trim();
    const v = m.slice(idx + 1).trim().replace(/^['"]|['"]$/g, '');
    out[k] = v;
  }
  return out;
}

function extractFirstUrl(text: string): string | null {
  const match = String(text ?? '').match(/https?:\/\/[^\s)]+/i);
  return match?.[0] ?? null;
}

function inferArgs(toolName: string, payload: string, fullUserText: string): Record<string, unknown> {
  const jsonObj = tryParseObject(payload);
  if (jsonObj) return jsonObj;

  const kv = parseKeyValuePayload(payload);
  if (Object.keys(kv).length) return kv;

  const url = extractFirstUrl(payload || fullUserText);
  if (url && /fetch|http|url/i.test(toolName)) {
    return { url, method: 'GET' };
  }

  if (payload) {
    if (/echo|repeat|say/i.test(toolName)) return { text: payload };
    return { input: payload };
  }

  return {};
}

function findToolDirective(
  userText: string,
  allowedTools: string[]
): { toolName: string; payload: string } | null {
  const user = String(userText ?? '');

  for (const toolName of allowedTools) {
    const escaped = escapeRegex(toolName);
    const colonPattern = new RegExp(`\\b${escaped}\\s*:\\s*([\\s\\S]+)$`, 'i');
    const colonMatch = user.match(colonPattern);
    if (colonMatch?.[1]) {
      return { toolName, payload: colonMatch[1].trim() };
    }

    const verbPattern = new RegExp(`\\b(?:use|call|run)\\s+${escaped}\\b(?:\\s*[:\\-]\\s*([\\s\\S]+))?$`, 'i');
    const verbMatch = user.match(verbPattern);
    if (verbMatch) {
      return { toolName, payload: (verbMatch[1] ?? '').trim() };
    }
  }

  return null;
}

function buildMockPlannerContent(messages: LLMChatParams['messages']): string {
  const userText = findLastUserMessage(messages);
  const allowedTools = extractAllowedTools(messages);
  const directive = findToolDirective(userText, allowedTools);

  if (directive) {
    const args = inferArgs(directive.toolName, directive.payload, userText);
    return JSON.stringify({
      type: 'tool_call',
      tool_name: directive.toolName,
      args,
      rationale: 'mock_planner_directive',
    });
  }

  const fetchTool = allowedTools.find((t) => /fetch|http|url/i.test(t));
  const url = extractFirstUrl(userText);
  if (fetchTool && url) {
    return JSON.stringify({
      type: 'tool_call',
      tool_name: fetchTool,
      args: { url, method: 'GET' },
      rationale: 'mock_planner_url_detected',
    });
  }

  return JSON.stringify({
    type: 'final_answer',
    answer: 'Mock planner final answer.',
    confidence: 'low',
    rationale: 'mock_planner_default',
  });
}

export function createLLMClient(options: ClientOptions = {}): LLMClient {
  const baseUrl = normalizeOpenAIBaseUrl(options.baseUrl ?? config.planner.baseUrl ?? config.llm.baseUrl ?? '');
  const apiKey = options.apiKey ?? config.planner.apiKey ?? config.llm.apiKey ?? '';
  const model = options.model ?? config.planner.model ?? config.llm.model ?? '';
  const retries = Number(options.retries ?? config.llm.maxRetries ?? 2);
  const retryBaseMs = Number(options.retryBaseMs ?? config.llm.retryBaseMs ?? 500);
  const retryMaxMs = Number(options.retryMaxMs ?? config.llm.retryMaxMs ?? 10000);

  return {
    async chat(params: LLMChatParams): Promise<LLMChatResult> {
      if (config.llm.mockPlanner) {
        return {
          content: buildMockPlannerContent(params.messages),
          usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
          latencyMs: 0,
          model: model || 'mock-planner',
        };
      }

      if (!baseUrl || !model) {
        throw new Error(
          'Planner LLM config missing. Set PLANNER_BASE_URL/PLANNER_MODEL (or LLM_BASE_URL/LLM_MODEL).'
        );
      }

      const t0 = Date.now();
      const response = await retryWithBackoff(
        async () =>
          fetch(`${baseUrl}/chat/completions`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
            },
            body: JSON.stringify({
              model,
              temperature: params.temperature ?? config.planner.temperature ?? 0,
              max_tokens: params.maxTokens,
              response_format: params.jsonMode ? { type: 'json_object' } : undefined,
              messages: params.messages,
            }),
          }),
        {
          retries,
          baseDelayMs: retryBaseMs,
          maxDelayMs: retryMaxMs,
          shouldRetry: (res) => res.status === 429 || res.status >= 500,
          getDelayMs: ({ result, defaultDelayMs }) =>
            parseRetryAfterMs(result.headers.get('retry-after')) ?? defaultDelayMs,
        }
      );

      if (!response.ok) {
        const body = await response.text().catch(() => '');
        throw new Error(`LLM request failed: ${baseUrl} ${response.status} ${response.statusText} ${body.slice(0, 200)}`);
      }

      const data = await response.json();
      const t1 = Date.now();
      return {
        content: data?.choices?.[0]?.message?.content ?? '',
        usage: data?.usage,
        latencyMs: t1 - t0,
        model,
      };
    },
  };
}
