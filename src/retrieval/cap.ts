type Hit = {
  source?: string;
};

export function capBySource<T extends Hit>(hits: T[], maxHitsPerSource = 2): T[] {
  const counts = new Map<string, number>();
  const out: T[] = [];

  for (const hit of hits) {
    const source = String(hit.source ?? '');
    const count = counts.get(source) ?? 0;
    if (count >= maxHitsPerSource) continue;
    counts.set(source, count + 1);
    out.push(hit);
  }

  return out;
}

