const STOP = new Set([
  'what', 'is', 'are', 'the', 'a', 'an', 'define', 'definition', 'explain', 'how', 'does',
  'do', 'in', 'on', 'of', 'for', 'to', 'and', 'or', 'with', 'about', 'meaning'
]);

export function extractEntityCandidates(query) {
  const q = String(query ?? '').trim();
  if (!q) return [];

  // Quoted phrase wins: "Client Link".
  const quoted = q.match(/"([^\"]+)"/);
  if (quoted?.[1]) return [quoted[1].trim()];

  // Prefer PascalCase/CamelCase-like tokens (ClientLink, AccountInfo, adGroupId).
  const camelLike = q.match(/\b(?:[A-Z][a-z0-9]+(?:[A-Z][A-Za-z0-9]+)+|[a-z]+(?:[A-Z][A-Za-z0-9]+)+)\b/g);
  if (camelLike?.length) return [...new Set(camelLike)].slice(0, 2);

  // Fallback: keep meaningful words and prefer longer ones.
  const words = q
    .toLowerCase()
    .replace(/[^a-z0-9_\- ]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .filter((w) => !STOP.has(w))
    .filter((w) => w.length >= 3);

  const freq = new Map();
  for (const w of words) {
    freq.set(w, (freq.get(w) ?? 0) + 1);
  }

  return [...freq.keys()]
    .sort((a, b) => {
      const byFreq = (freq.get(b) ?? 0) - (freq.get(a) ?? 0);
      if (byFreq !== 0) return byFreq;
      return b.length - a.length;
    })
    .slice(0, 2);
}
