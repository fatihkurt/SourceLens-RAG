const ORDER = { low: 0, medium: 1, high: 2 };

export function minConfidence(a, b) {
  return ORDER[a] <= ORDER[b] ? a : b;
}

export function calibrateConfidence({ sources, contextChars }) {
  const n = Array.isArray(sources) ? sources.length : 0;
  if (n === 0) return 'low';

  const scores = sources
    .map((s) => s?.score)
    .filter((x) => typeof x === 'number')
    .filter((x) => Number.isFinite(x))
    .sort((a, b) => b - a);

  // If no numeric scores, be conservative
  if (scores.length === 0) return 'medium';

  const top1 = scores[0];
  const top2 = scores[1] ?? null;
  const gap = top2 === null ? 1 : (top1 - top2);

  // --- thresholds (tune later, start simple)
  // With your data: scores ~0.65-0.80, so these are reasonable starters.
  if (top1 < 0.62) return 'low';
  if (top1 < 0.70) return 'medium';

  // strong score but ambiguous
  if (gap < 0.015) return 'medium';

  // optional: very small context -> less confident
  if (Number.isFinite(contextChars) && contextChars < 400) return 'medium';

  return 'high';
}
