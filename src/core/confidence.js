import { calibrateConfidenceScores } from '../utils/calibrateConfidence.js';

const ORDER = { low: 0, medium: 1, high: 2 };

export function minConfidence(a, b) {
  return ORDER[a] <= ORDER[b] ? a : b;
}

export function calibrateConfidence({ sources, hits, context, contextChars }) {
  // Backward-compatible: callers may still pass contextChars only.
  const safeContext = typeof context === 'string'
    ? context
    : (Number.isFinite(contextChars) ? 'x'.repeat(Math.max(0, Math.floor(contextChars))) : '');

  return calibrateConfidenceScores({
    sources,
    hits,
    context: safeContext,
  });
}
