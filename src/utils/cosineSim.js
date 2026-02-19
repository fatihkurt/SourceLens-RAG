
export function cosineSim(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b)) return 0;

  const len = Math.min(a.length, b.length);
  if (len === 0) return 0;

  let dot = 0;
  let na = 0;
  let nb = 0;

  for (let i = 0; i < len; i++) {
    const av = Number(a[i]);
    const bv = Number(b[i]);
    if (!Number.isFinite(av) || !Number.isFinite(bv)) continue;

    dot += av * bv;
    na += av * av;
    nb += bv * bv;
  }

  if (na === 0 || nb === 0) return 0;

  const score = dot / (Math.sqrt(na) * Math.sqrt(nb));
  return Number.isFinite(score) ? score : 0;
}
