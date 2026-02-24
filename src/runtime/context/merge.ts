import type { RetrievedChunk } from '../../retrieval/retrieve.js';

export function mergeChunksBySource(chunks: RetrievedChunk[]): RetrievedChunk[] {
  const seen = new Set<string>();
  const out: RetrievedChunk[] = [];

  for (const chunk of chunks) {
    const key = `${chunk.source}::${chunk.chunk_index}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(chunk);
  }

  return out;
}

