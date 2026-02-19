import { retrievalConfig } from './retrievalConfig.js';

export function computeScore({ item, baseScore, query }) {
  let score = baseScore;

  for (const boost of retrievalConfig.boosts) {
    try {
      if (boost.test({
        source: item.metadata?.source ?? '',
        section: item.metadata?.section ?? [],
        query
      })) {
        score += boost.weight;
      }
    } catch {}
  }

  return score;
}
