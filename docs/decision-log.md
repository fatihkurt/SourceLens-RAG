# Decision Log — SourceLens

## 2026-02-19 — RAG MVP v1 (JSONL + cosine similarity)

### Goal
Build a minimal, inspectable RAG loop to learn AI orchestration and system design.

### Decisions
- Store embeddings in a local JSONL file (`data/index/vectors.jsonl`) for simplicity.
- Store chunk text alongside metadata to enable prompt context (no separate docstore yet).
- Use cosine similarity over embeddings for retrieval.
- Limit retrieval with `TOP_K` and `MAX_CONTEXT_CHARS` to control latency and prompt noise.
- Add query enrichment for domain-scoped retrieval (e.g., “(Bing Ads Customer Management Service)”).

### Rationale
- JSONL enables fast iteration and easy debugging without infra.
- Embeddings provide semantic search beyond keyword matching.
- Chunking with overlap reduces context loss across boundaries.
- Context size limits improve response time and reduce hallucination risk.

### Known tradeoffs
- JSONL retrieval is O(N) and won’t scale to large corpora.
- Chunking is heuristic; definitions can straddle chunk boundaries.
- No reranking yet; topK may include semantically close but non-answer chunks.

### Next
- Add rerank (optional) and an evaluation dataset (10–50 questions) with regression checks.


“Heading-aware chunking added to reduce context drift and improve definitional queries.”

“Added reranking rule based boosts to improve retrieval quality.”


