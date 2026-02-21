import { z } from 'zod';
import { parseRetryAfterMs, retryWithBackoff } from './utils/retryWithBackoff.js';
import { extractFirstJsonObject } from './utils/jsonExtractor.js';
import { search } from './search.js';
import { calibrateConfidence, minConfidence } from './core/confidence.js';
import { config } from './core/config.js';


const AnswerSchema = z.object({
    answer: z.string(),
    confidence: z.enum(['low', 'medium', 'high']),
    assumptions: z.array(z.string()).default([]),
    sources: z.array(z.object({
        source: z.string(),
        chunk_index: z.number(),
        score: z.number().optional(),
    })).default([]),
});

const SCHEMA_HINT = `{
  "answer": string,
  "confidence": "low" | "medium" | "high",
  "assumptions": string[],
  "sources": { "source": string, "chunk_index": number, "score"?: number }[]
}`;

class LLMParseError extends Error {
    constructor(message, rawContent = '') {
        super(message);
        this.name = 'LLMParseError';
        this.rawContent = rawContent;
        this.rawText = rawContent;
    }
}

function applyConfidenceCalibration({ validated, sources, context }) {
    const retrievalConfidence = calibrateConfidence({
        sources,
        contextChars: String(context ?? '').length,
    });
    const confidence = minConfidence(validated.confidence, retrievalConfidence);
    return {
        ...validated,
        confidence,
        _confidence_debug: {
            llm: validated.confidence,
            retrieval: retrievalConfidence,
            final: confidence,
        },
    };
}

async function repairToJson({ rawText, schemaHint, temperature = 0 }) {
    const { baseUrl, apiKey, model } = config.llm;

    const system = `
You are a JSON repair tool.
Convert the user's content into ONE valid JSON object that matches this schema exactly:
${schemaHint}

Rules:
- Output ONLY JSON. No markdown. No commentary.
- If information is missing, use empty strings/arrays and set confidence to "low".
`.trim();

    const maxRetries = config.llm.maxRetries;
    const baseBackoffMs = config.llm.retryBaseMs;
    const maxBackoffMs = config.llm.retryMaxMs;

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
                        { role: 'user', content: String(rawText ?? '') },
                    ],
                }),
            }),
        {
            retries: maxRetries,
            baseDelayMs: baseBackoffMs,
            maxDelayMs: maxBackoffMs,
            shouldRetry: (response) => response.status === 429 || response.status >= 500,
            getDelayMs: ({ result, defaultDelayMs }) =>
                parseRetryAfterMs(result.headers.get('retry-after')) ?? defaultDelayMs,
        }
    );

    if (!res.ok) {
        const t = await res.text().catch(() => '');
        throw new Error(`Repair call failed: ${res.status} ${res.statusText} ${t.slice(0, 200)}`);
    }

    const data = await res.json();
    return data?.choices?.[0]?.message?.content ?? '';
}

async function llmChatOnce({ question, context, sources, temperature = 0.2, strictJson = false }) {
    const { baseUrl, apiKey, model } = config.llm;

    const system = strictJson ? `
You are SourceLens Core.
You will receive:
- a user question
- retrieved context chunks from the knowledge base

Return ONLY valid JSON matching:
{
  "answer": string,
  "confidence": "low" | "medium" | "high",
  "assumptions": string[],
  "sources": { "source": string, "chunk_index": number, "score"?: number }[]
}

Rules:
- Use ONLY the provided context to answer.
- If context is insufficient, say so and set confidence to low.
- Always include sources that support the answer (may be empty if insufficient).
- Be concise and precise.
`.trim()
        : `
You are SourceLens Core.
Return ONLY valid JSON matching:
{
  "answer": string,
  "confidence": "low" | "medium" | "high",
  "assumptions": string[],
  "sources": { "source": string, "chunk_index": number, "score"?: number }[]
}

Rules:
- Use ONLY the provided context to answer.
- If context is insufficient, say so and set confidence to low.
- Always include sources that support the answer (may be empty if insufficient).
- Be concise and precise.
`.trim();

    const maxRetries = config.llm.maxRetries;
    const baseBackoffMs = config.llm.retryBaseMs;
    const maxBackoffMs = config.llm.retryMaxMs;

    const t0 = Date.now();
    const res = await retryWithBackoff(
        async () => fetch(`${baseUrl}/chat/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                model,
                temperature,
                messages: [
                    { role: 'system', content: system },
                    { role: 'user', content: `Question:\n${question}\n\nContext:\n${context}` },
                ],
            }),
        }),
        {
            retries: maxRetries,
            baseDelayMs: baseBackoffMs,
            maxDelayMs: maxBackoffMs,
            shouldRetry: (response) => response.status === 429 || response.status >= 500,
            getDelayMs: ({ result, defaultDelayMs }) =>
                parseRetryAfterMs(result.headers.get('retry-after')) ?? defaultDelayMs,
        }
    );

    if (!res.ok) {
        const bodyText = await res.text().catch(() => '');
        const bodySnippet = bodyText ? ` | body: ${bodyText.slice(0, 300)}` : '';
        throw new Error(`LLM request failed: ${res.status} ${res.statusText}${bodySnippet}`);
    }

    const t1 = Date.now();
    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content ?? '';
    const usage = data?.usage;

    let parsed;
    try {
        parsed = extractFirstJsonObject(content);
        if (!parsed) throw new LLMParseError('No valid JSON object found in model response', content);
    } catch (e) {
        if (e?.name === 'LLMParseError') throw e;
        throw new LLMParseError(`Failed to parse LLM response: ${e.message}`, content);
    }

    let validated;
    try {
        // We trust retrieval sources more than model self-reporting, so we overwrite
        validated = AnswerSchema.parse({ ...parsed, sources });
    } catch (e) {
        throw new LLMParseError(`Parsed JSON failed schema validation: ${e.message}`, content);
    }

    const calibrated = applyConfidenceCalibration({ validated, sources, context });

    return {
        answer: calibrated.answer,
        confidence: calibrated.confidence,
        assumptions: calibrated.assumptions,
        sources: calibrated.sources,
        meta: {
            latency_ms: t1 - t0,
            usage,
            model,
            temperature,
            strict_json: strictJson,
            llm_confidence: calibrated._confidence_debug,
        },
    };
}

async function llmChat({ question, context, sources, temperature = 0.2 }) {
    try {
        return await llmChatOnce({ question, context, sources, temperature, strictJson: false });
    } catch (e1) {
        if (e1?.name !== 'LLMParseError') throw e1;
    }

    try {
        return await llmChatOnce({ question, context, sources, temperature: 0, strictJson: true });
    } catch (e2) {
        if (e2?.name !== 'LLMParseError') throw e2;

        const repairedText = await repairToJson({
            rawText: e2.rawContent ?? e2.rawText ?? String(e2.message ?? ''),
            schemaHint: SCHEMA_HINT,
            temperature: 0,
        });

        const repairedObj = extractFirstJsonObject(repairedText);
        if (!repairedObj) throw new Error('Repair produced no JSON');

        const validated = AnswerSchema.parse({ ...repairedObj, sources });
        const calibrated = applyConfidenceCalibration({ validated, sources, context });
        return {
            answer: calibrated.answer,
            confidence: calibrated.confidence,
            assumptions: calibrated.assumptions,
            sources: calibrated.sources,
            meta: {
                model: config.llm.model,
                temperature,
                strict_json: true,
                repaired: true,
                confidence_debug: calibrated._confidence_debug,
            },
        };
    }
}


export async function ask(question, {
    temperature,
    topK,
    queryEnrichment,
} = {}) {
    const q = String(question ?? '').trim();
    if (!q) throw new Error('Question is empty');

    // optional deterministic enrichment
    const enriched = queryEnrichment
        ? `${q} (${queryEnrichment})`
        : q;

    const { context, sources } = await search(enriched, {
        topK: Number(topK ?? config.retrieval.topK),
    });

    const temp = Number.isFinite(Number(temperature))
        ? Number(temperature)
        : Number(config.llm.temperature);

    return llmChat({
        question: q,
        context,
        sources,
        temperature: temp,
    });
}
