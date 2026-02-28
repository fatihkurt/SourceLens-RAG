function pickNumber(...vals) {
  for (const v of vals) {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function scoreOfHit(hit) {
  return pickNumber(
    hit?.rerank?.final,
    hit?.rerank_score,
    hit?.metadata?.rerank_score,
    hit?.score
  );
}

function collectScores({ hits, sources }) {
  const list = Array.isArray(hits) && hits.length ? hits : (Array.isArray(sources) ? sources : []);
  return list
    .map(scoreOfHit)
    .filter((x) => Number.isFinite(x))
    .sort((a, b) => b - a);
}

function detectFallbackUsed({ sources, hits }) {
  const fromSources = Array.isArray(sources) ? sources : [];
  const fromHits = Array.isArray(hits) ? hits.map((h) => h?.metadata ?? {}) : [];
  const all = [...fromSources, ...fromHits];
  return all.some((x) => String(x?.selection_reason ?? '').startsWith('fallback'));
}

export function evaluateNoAnswerGate(
  { sources, hits, context, confidence, isTool = false } = {},
  {
    minTopScore = 0.55,
    minGap = 0.02,
    minContextChars = 400,
    abstainOnLowConfidence = true,
    abstainOnFallback = true,
  } = {}
) {
  const reasons = [];
  const srcs = Array.isArray(sources) ? sources : [];
  const scores = collectScores({ hits, sources: srcs });
  const topScore = scores[0] ?? null;
  const secondScore = scores[1] ?? null;
  const gap = secondScore === null ? null : topScore - secondScore;
  const contextChars = typeof context === 'string' ? context.length : 0;
  const fallbackUsed = detectFallbackUsed({ sources: srcs, hits });

  if (srcs.length === 0) reasons.push('no_sources');
  if (topScore !== null && topScore < Number(minTopScore)) reasons.push('low_top_score');

  if (
    gap !== null &&
    gap < Number(minGap) &&
    Number(contextChars) < Number(minContextChars)
  ) {
    reasons.push('small_gap_short_context');
  }

  if (!isTool && abstainOnLowConfidence && String(confidence) === 'low') {
    reasons.push('low_confidence');
  }

  if (!isTool && abstainOnFallback && fallbackUsed) {
    reasons.push('fallback_used');
  }

  return {
    abstain: reasons.length > 0,
    reasons,
    metrics: {
      sourcesCount: srcs.length,
      topScore,
      secondScore,
      gap,
      contextChars,
      fallbackUsed,
      confidence: String(confidence ?? ''),
    },
  };
}

export function buildNoAnswerMessage({
  sources = [],
  reasons = [],
  maxNearbySources = 2,
  withSuggestion = true,
} = {}) {
  const head = "I can't confidently verify this from the retrieved sources.";
  const near = (Array.isArray(sources) ? sources : [])
    .slice(0, Math.max(0, Number(maxNearbySources)))
    .map((s) => `${s?.source ?? 'unknown'}#${s?.chunk_index ?? '?'}`);

  const nearLine = near.length
    ? `These sources look related but do not directly support the answer: ${near.join(', ')}.`
    : '';

  const reasonLine = reasons.length ? `No-answer reasons: ${reasons.join(', ')}.` : '';
  const suggestion = withSuggestion
    ? 'Could you narrow the question? (for example: exact entity or operation name)'
    : '';

  return [head, nearLine, reasonLine, suggestion].filter(Boolean).join('\n\n');
}
