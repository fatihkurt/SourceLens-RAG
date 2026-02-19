import 'dotenv/config';
import { z } from 'zod';
import { retryWithBackoff } from '../utils/retryWithBackoff.js';
import { parseRetryAfterMs } from '../utils/retryWithBackoff.js';

const EmbeddingVecSchema = z.array(z.number()).min(2);

function requireEnv(name, value) {
  if (!value) throw new Error(`${name} must be set in the environment`);
  return value;
}

async function postJson(url, { headers, body }, { retries = 3 } = {}) {
  const baseBackoffMs = Number(process.env.LLM_RETRY_BASE_MS ?? 500);
  const maxBackoffMs = Number(process.env.LLM_RETRY_MAX_MS ?? 10000);

  const res = await retryWithBackoff(
    async () =>
      fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(headers ?? {}) },
        body: JSON.stringify(body),
      }),
    {
      retries,
      baseDelayMs: baseBackoffMs,
      maxDelayMs: maxBackoffMs,
      shouldRetry: (r) => r.status === 429 || r.status >= 500,
      getDelayMs: ({ result, defaultDelayMs }) =>
        parseRetryAfterMs(result.headers.get('retry-after')) ?? defaultDelayMs,
    }
  );

  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`Embedding request failed: ${res.status} ${res.statusText} | body: ${t.slice(0, 300)}`);
  }
  return res.json();
}

async function embedWithOllama(text) {
  const baseUrl = requireEnv('EMBED_BASE_URL', process.env.EMBED_BASE_URL);
  const model = requireEnv('EMBED_MODEL', process.env.EMBED_MODEL);

  // Ollama embeddings endpoint (most common)
  // POST /api/embeddings { model, prompt }
  const data = await postJson(`${baseUrl}/api/embeddings`, {
    body: { model, prompt: text },
  }, { retries: Number(process.env.LLM_MAX_RETRIES ?? 3) });

  // Expected: { embedding: number[] }
  const vec = data?.embedding;
  return EmbeddingVecSchema.parse(vec);
}

async function embedWithOpenAI(text) {
  const baseUrl = process.env.EMBED_BASE_URL ?? 'https://api.openai.com/v1';
  const apiKey = requireEnv('EMBED_API_KEY', process.env.EMBED_API_KEY);
  const model = requireEnv('EMBED_MODEL', process.env.EMBED_MODEL);

  // OpenAI embeddings endpoint
  // POST /v1/embeddings { model, input }
  const data = await postJson(`${baseUrl}/embeddings`, {
    headers: { Authorization: `Bearer ${apiKey}` },
    body: { model, input: text },
  }, { retries: Number(process.env.LLM_MAX_RETRIES ?? 3) });

  // Expected: { data: [{ embedding: number[] }] }
  const vec = data?.data?.[0]?.embedding;
  return EmbeddingVecSchema.parse(vec);
}

export async function embedText(text) {
  const provider = (process.env.EMBED_PROVIDER ?? 'ollama').toLowerCase();

  if (provider === 'ollama') return embedWithOllama(text);
  if (provider === 'openai') return embedWithOpenAI(text);

  throw new Error(`Unknown EMBED_PROVIDER: ${provider} (use "ollama" or "openai")`);
}
