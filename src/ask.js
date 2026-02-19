import 'dotenv/config';
import { z } from 'zod';
import { parseRetryAfterMs, retryWithBackoff } from './utils/retryWithBackoff.js';
import { extractFirstJsonObject } from './utils/jsonExtractor.js';
import { search } from './search.js';


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


async function llmChat({ question, temperature = 0.2 }) {
    const baseUrl = process.env.LLM_BASE_URL;
    const apiKey = process.env.LLM_API_KEY;
    const model = process.env.LLM_MODEL;

    if (!baseUrl || !apiKey || !model) {
        throw new Error('LLM_BASE_URL, LLM_API_KEY, and LLM_MODEL must be set in the environment')
    }

    const enrichedQuery = `${question} (Bing Ads Customer Management Service)`;

    const { context, sources } = await search(enrichedQuery, { topK: Number(process.env.TOP_K ?? 5) });
    // console.log(`%c🪄 [llmChat] sources`, `background: #ff6b35; color: #fff; padding: 4px 8px; border-radius: 4px; font-weight: bold`, sources);
    // console.log(`%c🪄 [llmChat] context`, `background: #ff6b35; color: #fff; padding: 4px 8px; border-radius: 4px; font-weight: bold`, context);

    const system = `
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
- If the term is overloaded, give the definition in the current domain context and mention the scope.
- If context is insufficient, say so and set confidence to low.
- For definition questions: answer in 1 sentence, then 2–4 bullet points of key fields/attributes from context.
- Always include sources that support the answer (may be empty if insufficient).
- Be concise and precise.
`.trim();

    const maxRetries = Number(process.env.LLM_MAX_RETRIES ?? 3);
    const baseBackoffMs = Number(process.env.LLM_RETRY_BASE_MS ?? 500);
    const maxBackoffMs = Number(process.env.LLM_RETRY_MAX_MS ?? 10000);

    const t0 = Date.now();
    const res = await retryWithBackoff(
        async () => fetch(`${baseUrl}/chat/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model,
                temperature,
                messages: [
                    { role: 'system', content: system },
                    { role: 'user', content: `Question:\n${question}\n\nContext:\n${context}` }
                ],
            })
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
    const content = data?.choices[0]?.message?.content ?? '';
    const usage = data?.usage; // token usage vary against the provider

    let parsed;
    try {
        parsed = extractFirstJsonObject(content);
        if (!parsed) {
            throw new Error('No valid JSON object found in model response');
        }
    } catch (e) {
        throw new Error(`Failed to parse LLM response: ${e.message}`);
    }

    const validated = AnswerSchema.parse({ ...parsed, sources });

    if (validated.sources?.length) console.log('\nSources:', validated.sources);


    return {
        ...validated,
        meta: {
            latency_ms: t1 - t0,
            usage,
            model,
            temperature
        }
    }
}

async function main() {
    const question = process.argv.slice(2).join(' ').trim(); // get the question from the command line)
    if (!question) {
        console.log('Usage: node ask.js <question>');
        process.exit(1);
    }

    const temperatureInput = process.argv.slice(3).join(' ').trim();
    const defaultTemp = 0.2;
    const temperature = temperatureInput && Number(temperatureInput) > 0 && Number(temperatureInput) <= 1
        ? Number(temperatureInput) : Number(process.env.LLM_TEMPERATURE ?? defaultTemp);

    const out = await llmChat({ question, temperature });

    console.log('\nAnswer:\n', out.answer);
    console.log('\nConfidence:', out.confidence);
    if (out.assumptions?.length) console.log('Assumptions:', out.assumptions);
    console.log('\nMeta:', out.meta);
}


main().catch(e => {
    console.error(e);
    process.exit(1);
});
