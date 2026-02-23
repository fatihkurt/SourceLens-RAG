import { config, requireLLMConfig } from './config.js';
import { extractFirstJsonObject } from '../utils/jsonExtractor.js';
import { parseRetryAfterMs, retryWithBackoff } from '../utils/retryWithBackoff.js';

function trimText(v, max = 260) {
  const s = String(v ?? '').replace(/\s+/g, ' ').trim();
  return s.length > max ? `${s.slice(0, max)}...` : s;
}

function toCandidateLine(hit, idx) {
  const source = hit?.metadata?.source ?? 'unknown';
  const chunk = hit?.metadata?.chunk_index;
  const section = Array.isArray(hit?.metadata?.section) ? hit.metadata.section.join(' > ') : '';
  const text = trimText(hit?.metadata?.text ?? '');
  const chunkPart = Number.isFinite(chunk) ? ` chunk=${chunk}` : '';
  const sectionPart = section ? ` section=${section}` : '';
  return `[${idx + 1}] source=${source}${chunkPart}${sectionPart}\n${text}`;
}

function normalizeSelectedIndices(raw, maxIndex) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  const seen = new Set();
  for (const v of raw) {
    const n = Number(v);
    if (!Number.isInteger(n)) continue;
    if (n < 1 || n > maxIndex) continue;
    if (seen.has(n)) continue;
    seen.add(n);
    out.push(n);
  }
  return out;
}

export async function llmRerankHits({ query, hits, topK, temperature = 0, debug = false } = {}) {
  if (!Array.isArray(hits) || hits.length === 0) {
    return { reorderedTop: [], meta: { applied: false, reason: 'empty_hits' } };
  }

  try {
    requireLLMConfig();
  } catch (e) {
    return { reorderedTop: [], meta: { applied: false, reason: 'missing_llm_config', error: e.message } };
  }

  const { baseUrl, apiKey, model, maxRetries, retryBaseMs, retryMaxMs } = config.llm;
  const k = Math.max(1, Math.min(Number(topK) || 1, hits.length));
  const candidateText = hits.map((h, i) => toCandidateLine(h, i)).join('\n\n');

  const system = `
You are a retrieval reranker.
Select the most relevant chunks for the question.
Return ONLY valid JSON:
{
  "selected": number[]
}
Rules:
- selected uses 1-based candidate indexes.
- Keep order from most to least relevant.
- Include at most ${k} indexes.
- Output JSON only.
`.trim();

  const user = `Question:\n${String(query ?? '')}\n\nCandidates:\n${candidateText}`;

  try {
    const res = await retryWithBackoff(
      async () =>
        fetch(`${baseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model,
            temperature,
            messages: [
              { role: 'system', content: system },
              { role: 'user', content: user },
            ],
          }),
        }),
      {
        retries: maxRetries,
        baseDelayMs: retryBaseMs,
        maxDelayMs: retryMaxMs,
        shouldRetry: (response) => response.status === 429 || response.status >= 500,
        getDelayMs: ({ result, defaultDelayMs }) =>
          parseRetryAfterMs(result.headers.get('retry-after')) ?? defaultDelayMs,
      }
    );

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      return {
        reorderedTop: [],
        meta: {
          applied: false,
          reason: 'request_failed',
          status: res.status,
          body: body.slice(0, 120),
        },
      };
    }

    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content ?? '';
    const parsed = extractFirstJsonObject(content);
    const selected = normalizeSelectedIndices(parsed?.selected, hits.length).slice(0, k);

    if (!selected.length) {
      return { reorderedTop: [], meta: { applied: false, reason: 'no_valid_selection' } };
    }

    const reorderedTop = selected.map((i) => hits[i - 1]).filter(Boolean);
    const meta = { applied: true, selected };
    if (debug) {
      meta.usage = data?.usage ?? null;
    }
    return { reorderedTop, meta };
  } catch (e) {
    return { reorderedTop: [], meta: { applied: false, reason: 'exception', error: String(e?.message ?? e) } };
  }
}

