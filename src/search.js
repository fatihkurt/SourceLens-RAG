import { readAll } from './core/vectorstore.js';
import { embedText } from './core/embedder.js';
import { cosineSim } from './utils/cosineSim.js';
import { extractEntityCandidates } from './core/entityExtract.js';
import { rerank } from './core/rerank.js';
import { config } from './core/config.js';

export function buildMergedContext(hits, { maxChars, debug = false } = {}) {
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
          .map((x) => Number(x?.rerank?.final ?? x.score))
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

export async function search(
  query,
  {
    topK = Number(config.retrieval.topK),
    topN = Number(config.retrieval.topN ?? 20),
    entityCandidates = undefined,
    debug = false,
    contextDebug = false,
  } = {}
) {
  console.log('[search] query', query);

  const qvec = await embedText(query);
  const items = await readAll();

  const resolvedEntityCandidates = Array.isArray(entityCandidates)
    ? entityCandidates
    : extractEntityCandidates(query);

  // 1) semantic scoring
  const semantic = items
    .map((it) => ({
      ...it,
      score: cosineSim(qvec, it.vector),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.max(topK, topN));

  // 2) rerank
  const rerankDebug = Boolean(debug || config.retrieval.debug);
  const { reranked, traces } = rerank(semantic, {
    query,
    entityCandidates: resolvedEntityCandidates,
    debug: rerankDebug,
  });

  // 3) dedupe by (source, chunk_index)
  const seen = new Set();
  const deduped = [];
  for (const h of reranked) {
    const key = h.id ?? `${h.metadata?.source ?? ''}::${h.metadata?.chunk_index ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(h);
  }

  // 4) final topK
  const top = deduped.slice(0, topK);

  const MAX_CONTEXT_CHARS = Number(config.retrieval.maxContextChars);
  const context = buildMergedContext(top, {
    maxChars: MAX_CONTEXT_CHARS,
    debug: Boolean(contextDebug || rerankDebug),
  });

  if (rerankDebug) {
    console.log('[search] entityCandidates=', resolvedEntityCandidates);
    console.log(`[search] index_items=${items.length} topK=${topK} topN=${topN} context_chars=${context.length}`);
    console.log(
      `[search] top_scores=${top.map((x) => Number((x?.rerank?.final ?? x.score ?? 0).toFixed(4))).join(', ')}`
    );

    for (const h of top) {
      const src = h.metadata?.source;
      const ci = h.metadata?.chunk_index;
      const r = h.rerank ?? { base: h.score ?? 0, boost: 0, final: h.score ?? 0, reasons: [] };
      const reasons = Array.isArray(r.reasons) && r.reasons.length ? r.reasons.join(' ') : '(none)';

      console.log(
        `[hit] ${src}#${ci} base=${Number(r.base ?? 0).toFixed(4)} boost=${Number(r.boost ?? 0).toFixed(4)} ` +
          `reasons=${reasons} final=${Number(r.final ?? 0).toFixed(4)}`
      );
    }

    if (traces?.length) {
      console.log(`[search] rerank_traces=${traces.length}`);
    }
  }

  const sources = top.map((h) => ({
    source: h.metadata?.source,
    chunk_index: h.metadata?.chunk_index,
    ...(h.metadata?.section ? { section: h.metadata.section } : {}),
    ...(Number.isFinite(h.score) ? { score: Number(h.score.toFixed(4)) } : {}), // semantic score for eval/calibration
    ...(Number.isFinite(h?.rerank?.final) ? { rerank_score: Number(h.rerank.final.toFixed(4)) } : {}),
    ...(h.rerank?.reasons?.length ? { rerank_reasons: h.rerank.reasons } : {}),
  }));

  return { sources, context, hits: top, traces };
}
