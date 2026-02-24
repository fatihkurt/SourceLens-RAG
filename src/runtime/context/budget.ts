import type { RetrievedChunk } from '../../retrieval/retrieve.js';

export function capChunksByCharBudget(chunks: RetrievedChunk[], maxChars: number): RetrievedChunk[] {
  if (!Number.isFinite(maxChars) || maxChars <= 0) return chunks;

  let total = 0;
  const out: RetrievedChunk[] = [];
  for (const chunk of chunks) {
    const text = String(chunk.text ?? '');
    if (total + text.length > maxChars) break;
    out.push(chunk);
    total += text.length;
  }
  return out;
}

