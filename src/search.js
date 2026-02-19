import { readAll } from './core/vectorstore.js';
import { embedText } from './core/embedder.js';
import { cosineSim } from './utils/cosineSim.js';

export async function search(query, { topK = Number(process.env.TOP_K ?? 3) } = {}) {
    console.log('🔎 [search] query', query);

    const qvec = await embedText(query);
    const items = await readAll();

    // 1) score everything
    const scoredAll = items
        .map((it) => ({
            ...it,
            score: cosineSim(qvec, it.vector),
        }))
        .sort((a, b) => b.score - a.score);

    // 2) dedupe by (source, chunk_index) (and keep best score)
    const seen = new Set();
    const deduped = [];
    for (const h of scoredAll) {
        const key = `${h.metadata?.source ?? ''}::${h.metadata?.chunk_index ?? ''}`;
        if (seen.has(key)) continue;
        seen.add(key);
        deduped.push(h);
        if (deduped.length >= topK * 3) {
            // small early stop: we only need a bit more than topK after dedupe
            // (keeps performance reasonable)
            break;
        }
    }

    // 3) take topK after dedupe
    const top = deduped.slice(0, topK);

    // 4) context length limit (chars)
    const MAX_CONTEXT_CHARS = Number(process.env.MAX_CONTEXT_CHARS ?? 3500);
    let totalChars = 0;

    const contextParts = [];
    for (let i = 0; i < top.length; i++) {
        const h = top[i];
        const section =
            Array.isArray(h.metadata?.section) && h.metadata.section.length
                ? ` section="${h.metadata.section.join(' > ')}"`
                : '';

        const block =
            `[#${i + 1}] source=${h.metadata.source} chunk=${h.metadata.chunk_index}${section}\n` +
            `${h.metadata.text}`;

        if (totalChars + block.length > MAX_CONTEXT_CHARS) break;

        contextParts.push(block);
        totalChars += block.length;
    }

    const context = contextParts.join('\n\n');

    const sources = top.map((h) => ({
        source: h.metadata.source,
        chunk_index: h.metadata.chunk_index,
        ...(Number.isFinite(h.score) ? { score: Number(h.score.toFixed(4)) } : {}),
    }));

    if (process.env.DEBUG_RAG === '1') {
        console.log(`🧠 [search] index_items=${items.length} topK=${topK} context_chars=${context.length}`);
        console.log(`🧠 [search] top_scores=${top.map(x => Number(x.score.toFixed(4))).join(', ')}`);
    }

    return { sources, context, hits: top };
}
