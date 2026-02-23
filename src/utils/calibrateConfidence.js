function pickNumber(...vals) {
  for (const v of vals) {
    if (v === null || v === undefined || v === '') continue;
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function downshift(conf) {
  if (conf === 'high') return 'medium';
  if (conf === 'medium') return 'low';
  return 'low';
}

/**
 * Normalize hit score: prefer rerank score if present, otherwise semantic score.
 * Supports both:
 *  - hit.rerank.final
 *  - hit.metadata.rerank_score OR hit.rerank_score (depending on your wiring)
 *  - hit.score (semantic)
 */
export function getConfidenceScore(hit) {
  return pickNumber(
    hit?.rerank?.final,
    hit?.rerank_score,
    hit?.metadata?.rerank_score,
    hit?.score
  );
}

export function calibrateConfidenceScores({ sources, hits, context } = {}) {
  // sources: typically the objects returned to caller
  // hits: internal scored hits (may include rerank.final)
  const list = (Array.isArray(hits) && hits.length ? hits : sources) ?? [];

  if (!Array.isArray(list) || list.length === 0) return 'low';

  // IMPORTANT: Use rerank-aware confidence score
  const scores = list
    .map(getConfidenceScore)
    .filter((n) => Number.isFinite(n))
    .sort((a, b) => b - a);

  if (scores.length === 0) return 'medium';

  const top = scores[0];
  const second = scores[1] ?? null;
  const gap = second != null ? top - second : top;

  const contextLen = typeof context === 'string' ? context.length : 0;

  // Conservative defaults. If you tune thresholds, keep score-source logic unchanged.
  let calculatedConfidence;
  if (top < 0.55) calculatedConfidence = 'low';
  else if (top < 0.70) calculatedConfidence = 'medium';
  else if (gap < 0.03) calculatedConfidence = 'medium';
  else if (contextLen > 0 && contextLen < 300) calculatedConfidence = 'medium';
  else calculatedConfidence = 'high';

  const usedFallbackInHits =
    Array.isArray(hits) &&
    hits.some((h) => h?.metadata?.selection_reason === 'fallback');
  const usedFallbackInSources =
    Array.isArray(sources) &&
    sources.some((s) => s?.selection_reason === 'fallback' || s?.metadata?.selection_reason === 'fallback');
  const usedFallback = usedFallbackInHits || usedFallbackInSources;

  if (usedFallback) return downshift(calculatedConfidence);
  return calculatedConfidence;
}
