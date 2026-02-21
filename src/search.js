import { readAll } from './core/vectorstore.js';
import { embedText } from './core/embedder.js';
import { cosineSim } from './utils/cosineSim.js';
import { scoreWithBreakdown } from './core/score.js';
import { extractEntityCandidates } from './core/entityExtract.js';
import { config } from './core/config.js';

function buildMergedContext(hits, { maxChars, debug = false } = {}) {
    const order = [];
    const groups = new Map();

    for (const h of hits) {
        const source = h.metadata?.source ?? 'unknown';
        if (!groups.has(source)) {
            groups.set(source, { source, items: [] });
            order.push(source);
        }
        groups.get(source).items.push(h);
    }

    const blocks = [];
    let docIdx = 1;
    let totalChars = 0;

    for (const source of order) {
        const g = groups.get(source);
        const items = g.items;

        const best = debug
            ? items
                .map((x) => Number(x.score))
                .filter((x) => Number.isFinite(x))
                .sort((a, b) => b - a)[0]
            : null;

        const header = debug
            ? `[#${docIdx}] source=${source}${Number.isFinite(best) ? ` best_score=${best.toFixed(4)}` : ''}`
            : `[#${docIdx}] source=${source}`;

        const body = items
            .map((h) => {
                if (!debug) return String(h.metadata?.text ?? '').trim();

                const chunk = h.metadata?.chunk_index;
                const section = Array.isArray(h.metadata?.section) ? h.metadata.section.join(' > ') : null;
                const labelParts = [];
                if (Number.isFinite(chunk)) labelParts.push(`chunk=${chunk}`);
                if (section) labelParts.push(`section=${section}`);
                const label = labelParts.length ? `(${labelParts.join(', ')})` : '';
                return `${label}\n${h.metadata?.text ?? ''}`.trim();
            })
            .join(debug ? '\n\n---\n\n' : '\n\n');

        const block = `${header}\n${body}`.trim();

        if (Number.isFinite(maxChars) && maxChars > 0 && totalChars + block.length > maxChars) {
            if (blocks.length === 0) {
                blocks.push(block.slice(0, maxChars));
            }
            break;
        }

        blocks.push(block);
        totalChars += block.length;
        docIdx += 1;
    }

    return blocks.join('\n\n\n');
}

export async function search(query, { topK = Number(config.retrieval.topK), contextDebug = false } = {}) {
    console.log('[search] query', query);

    const qvec = await embedText(query);
    const items = await readAll();

    const entityCandidates = extractEntityCandidates(query);

    // 1) score everything
    const scoredAll = items
        .map((it) => {
            const base = cosineSim(qvec, it.vector);
            const { score, breakdown } = scoreWithBreakdown({ 
                item: it, 
                baseScore: base, 
                query,
                extra: { entityCandidates }
             });
            return { ...it, score, breakdown };
        })
        .sort((a, b) => b.score - a.score);

    // 2) dedupe by (source, chunk_index)
    const seen = new Set();
    const deduped = [];
    for (const h of scoredAll) {
        const key = h.id ?? `${h.metadata.source}::${h.metadata.chunk_index}`;
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

    const MAX_CONTEXT_CHARS = Number(config.retrieval.maxContextChars);
    const context = buildMergedContext(top, {
        maxChars: MAX_CONTEXT_CHARS,
        debug: Boolean(contextDebug),
    });

    if (config.retrieval.debug) {
        console.log('🧩 [search] entityCandidates=', entityCandidates);
        console.log(`[search] index_items=${items.length} topK=${topK} context_chars=${context.length}`);
        console.log(`[search] top_scores=${top.map((x) => Number((x.score ?? 0).toFixed(4))).join(', ')}`);

        for (const h of top) {
            const src = h.metadata?.source;
            const ci = h.metadata?.chunk_index;
            const b = h.breakdown ?? { base: h.score ?? 0, boosts: [], final: h.score ?? 0 };
            const boosts = b.boosts.length
                ? b.boosts.map((x) => `${x.name}:+${x.delta}`).join(' ')
                : '(none)';

            console.log(
                `[hit] ${src}#${ci} base=${Number(b.base).toFixed(4)} boosts=${boosts} final=${Number(b.final).toFixed(4)}`
            );
        }
    }

    const sources = top.map((h) => ({
        source: h.metadata.source,
        chunk_index: h.metadata.chunk_index,
        ...(h.metadata?.section ? { section: h.metadata.section } : {}),
        ...(Number.isFinite(h.score) ? { score: Number(h.score.toFixed(4)) } : {}),
    }));

    return { sources, context, hits: top };
}
