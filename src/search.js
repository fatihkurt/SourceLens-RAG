import { readAll } from './core/vectorstore.js';
import { embedText } from './core/embedder.js';
import { cosineSim } from './utils/cosineSim.js';
import { extractEntityCandidates } from './core/entityExtract.js';
import { rerank } from './core/rerank.js';
import { llmRerankHits } from './core/llmRerank.js';
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

function normalizeEntity(e) {
  return String(e ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function getFileStem(source) {
  const file = String(source ?? '').split(/[\\/]/).pop() ?? '';
  return file.replace(/\.md$/i, '').toLowerCase();
}

function hasEntityInText(haystack, entityCandidates) {
  const hay = String(haystack ?? '').toLowerCase();
  return (entityCandidates ?? []).some((e) => {
    const ent = normalizeEntity(e);
    if (!ent) return false;
    const entNoSpace = ent.replace(/\s+/g, '');
    return hay.includes(ent) || hay.includes(entNoSpace);
  });
}

function hasOperationInText(haystack, operationCandidates) {
  const hay = String(haystack ?? '').toLowerCase();
  return (operationCandidates ?? []).some((op) => {
    const candidate = normalizeEntity(op);
    if (!candidate) return false;
    const compact = candidate.replace(/\s+/g, '');
    return hay.includes(candidate) || hay.includes(compact);
  });
}

export function extractOperationCandidates(query) {
  const q = String(query ?? '');
  const matched = q.match(/\b[A-Z][a-z]+(?:[A-Z][a-z0-9]+)+\b/g);
  if (!matched) return [];
  return [...new Set(matched)].slice(0, 2);
}

/**
 * Select hits with:
 * - per-source cap
 * - prefer diversity, but do not leave topK empty
 * - strict phase:
 *   - if entity candidates exist: new source must match entity
 *   - else if operation candidates exist: new source must match operation
 * - fallback phase:
 *   - if entity matches: fallback_entity
 *   - else if operation matches (or no candidates): fallback_free
 *
 * Adds metadata flags:
 *  - h.metadata.selection_reason =
 *    'strict_entity' | 'strict_operation' | 'fallback_entity' | 'fallback_free'
 */
export function selectDiversifiedHits(
  hits,
  { topK, maxHitsPerSource = 2, entityCandidates = [], operationCandidates = [], query = '' } = {}
) {
  const counts = new Map();
  const selected = [];
  const selectedSources = new Set();
  const hasEntities = Array.isArray(entityCandidates) && entityCandidates.length > 0;
  const hasOps = Array.isArray(operationCandidates) && operationCandidates.length > 0;
  const operationIntent = /\b(operation|call|endpoint|method)\b/i.test(String(query));

  const canTake = (h) => {
    const src = h?.metadata?.source ?? '';
    const c = counts.get(src) ?? 0;
    return c < maxHitsPerSource;
  };

  const take = (h, reason) => {
    const src = h?.metadata?.source ?? '';
    const c = counts.get(src) ?? 0;
    counts.set(src, c + 1);
    selectedSources.add(src);

    h.metadata = h.metadata ?? {};
    h.metadata.selection_reason = reason;

    selected.push(h);
  };

  const getMatchInfo = (h) => {
    const sectionText = Array.isArray(h?.metadata?.section) ? h.metadata.section.join(' ') : '';
    const text = h?.metadata?.text ?? '';
    const hay = `${getFileStem(h?.metadata?.source ?? '')}\n${sectionText}\n${text}`.toLowerCase();
    return {
      entity: hasEntities && hasEntityInText(hay, entityCandidates),
      operation: hasOps && hasOperationInText(hay, operationCandidates),
    };
  };

  const softMatch = (h) => {
    const match = getMatchInfo(h);
    if (match.entity) return { ok: true, reason: 'fallback_entity' };
    if (match.operation) return { ok: true, reason: 'fallback_free' };
    if (!hasEntities && !hasOps) return { ok: true, reason: 'fallback_free' };
    return { ok: false, reason: null };
  };

  // ---- Phase 1: strict
  for (const h of hits) {
    if (selected.length >= topK) break;
    if (!canTake(h)) continue;

    const src = h?.metadata?.source ?? '';
    const isNewSource = !selectedSources.has(src);
    const match = getMatchInfo(h);

    const preferOperation = operationIntent && hasOps;
    if (isNewSource) {
      if (preferOperation) {
        if (!match.operation) continue;
      } else if (hasEntities) {
        if (!match.entity) continue;
      } else if (hasOps) {
        if (!match.operation) continue;
      }
    }

    const strictReason =
      (preferOperation || (!hasEntities && hasOps) || (!match.entity && match.operation))
        ? 'strict_operation'
        : 'strict_entity';
    take(h, strictReason);
  }

  // ---- Phase 2: fallback fill
  if (selected.length < topK) {
    for (const h of hits) {
      if (selected.length >= topK) break;
      if (selected.includes(h)) continue;
      if (!canTake(h)) continue;

      const soft = softMatch(h);
      if (!soft.ok) continue;
      take(h, soft.reason);
    }

    // ---- Phase 3: hard fallback fill (guarantee topK if possible)
    if (selected.length < topK) {
      for (const h of hits) {
        if (selected.length >= topK) break;
        if (selected.includes(h)) continue;
        if (!canTake(h)) continue;
        take(h, 'fallback_free');
      }
    }
  }

  return selected;
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
  const operationCandidates = extractOperationCandidates(query);

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

  // 3.5) optional true rerank by LLM on top pool
  let ranked = deduped;
  let llmRerankMeta = null;
  if (config.retrieval.llmRerankEnabled) {
    const poolSize = Math.max(topK, Number(config.retrieval.llmRerankPool));
    const pool = deduped.slice(0, poolSize);
    const llm = await llmRerankHits({
      query,
      hits: pool,
      topK,
      temperature: Number(config.retrieval.llmRerankTemperature),
      debug: rerankDebug,
    });
    llmRerankMeta = llm?.meta ?? null;

    if (Array.isArray(llm?.reorderedTop) && llm.reorderedTop.length) {
      const keyOf = (h) => h?.id ?? `${h?.metadata?.source ?? ''}::${h?.metadata?.chunk_index ?? ''}`;
      const selectedKeys = new Set(llm.reorderedTop.map((h) => keyOf(h)));
      const rest = deduped.filter((h) => !selectedKeys.has(keyOf(h)));
      ranked = [...llm.reorderedTop, ...rest];
    }
  }

  // 4) source-cap + entity/operation-aware diversify before topK
  const top = selectDiversifiedHits(ranked, {
    topK,
    maxHitsPerSource: Number(config.retrieval.maxHitsPerSource),
    entityCandidates: resolvedEntityCandidates,
    operationCandidates,
    query,
  });

  const MAX_CONTEXT_CHARS = Number(config.retrieval.maxContextChars);
  const context = buildMergedContext(top, {
    maxChars: MAX_CONTEXT_CHARS,
    debug: Boolean(contextDebug || rerankDebug),
  });

  if (rerankDebug) {
    console.log('[search] entityCandidates=', resolvedEntityCandidates);
    console.log('[search] operationCandidates=', operationCandidates);
    console.log(
      `[search] index_items=${items.length} topK=${topK} topN=${topN} ` +
      `max_hits_per_source=${config.retrieval.maxHitsPerSource} context_chars=${context.length}`
    );
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
    if (llmRerankMeta) {
      console.log(`[search] llm_rerank=${JSON.stringify(llmRerankMeta)}`);
    }
  }

  const sources = top.map((h) => ({
    source: h.metadata?.source,
    chunk_index: h.metadata?.chunk_index,
    ...(h.metadata?.section ? { section: h.metadata.section } : {}),
    ...(Number.isFinite(h.score) ? { score: Number(h.score.toFixed(4)) } : {}), // semantic score for eval/calibration
    ...(Number.isFinite(h?.rerank?.final) ? { rerank_score: Number(h.rerank.final.toFixed(4)) } : {}),
    ...(h.rerank?.reasons?.length ? { rerank_reasons: h.rerank.reasons } : {}),
    ...(h.metadata?.selection_reason ? { selection_reason: h.metadata.selection_reason } : {}),
  }));

  return { sources, context, hits: top, traces };
}
