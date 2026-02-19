import { retrievalConfig } from './retrievalConfig.js';

export function scoreWithBreakdown({ item, baseScore, query }) {
  const applied = [];
  let score = baseScore;

  for (const b of retrievalConfig.boosts) {
    let ok = false;
    try {
      ok = Boolean(
        b.test({
          source: item.metadata?.source ?? '',
          section: item.metadata?.section ?? [],
          query,
        })
      );
    } catch {
      ok = false;
    }

    if (ok) {
      score += b.weight;
      applied.push({ name: b.name, delta: b.weight });
    }
  }

  return {
    score,
    breakdown: {
      base: baseScore,
      boosts: applied,
      final: score,
    },
  };
}
