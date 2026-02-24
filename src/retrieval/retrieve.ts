import { search } from '../search.js';

export type SelectionReason =
  | 'strict_entity'
  | 'strict_operation'
  | 'fallback_entity'
  | 'fallback_free'
  | 'strict'
  | 'fallback';

export type RetrievedChunk = {
  source: string;
  chunk_index: number;
  text: string;
  section?: string[];
  score?: number;
  rerank_score?: number;
  selection_reason?: SelectionReason;
};

export type RetrievalResult = {
  query: string;
  context: string;
  chunks: RetrievedChunk[];
};

export type RetrieveOptions = {
  topK?: number;
  topN?: number;
  debug?: boolean;
  contextDebug?: boolean;
  entityCandidates?: string[];
};

export async function retrieve(query: string, options: RetrieveOptions = {}): Promise<RetrievalResult> {
  const out = await search(query, {
    topK: options.topK,
    topN: options.topN,
    debug: options.debug,
    contextDebug: options.contextDebug,
    entityCandidates: options.entityCandidates,
  });

  const chunks: RetrievedChunk[] = (out?.hits ?? []).map((h: any) => ({
    source: h?.metadata?.source ?? '',
    chunk_index: Number(h?.metadata?.chunk_index ?? 0),
    text: String(h?.metadata?.text ?? ''),
    ...(Array.isArray(h?.metadata?.section) ? { section: h.metadata.section } : {}),
    ...(Number.isFinite(h?.score) ? { score: Number(h.score) } : {}),
    ...(Number.isFinite(h?.rerank?.final) ? { rerank_score: Number(h.rerank.final) } : {}),
    ...(h?.metadata?.selection_reason ? { selection_reason: h.metadata.selection_reason } : {}),
  }));

  return {
    query,
    context: String(out?.context ?? ''),
    chunks,
  };
}

