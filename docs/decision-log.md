# Decision Log - SourceLens

## 2026-02-19 - RAG MVP v1 (JSONL + cosine similarity)

### Goal
Build a minimal, inspectable RAG loop to learn orchestration and system design.

### Decisions
- Store embeddings in local JSONL (`data/index/vectors.jsonl`).
- Store chunk text with metadata (no separate docstore yet).
- Use cosine similarity for first-pass retrieval.
- Control prompt size with `TOP_K` and `MAX_CONTEXT_CHARS`.
- Allow optional query enrichment for domain scoping.

### Tradeoffs
- JSONL retrieval is O(N) and not scalable.
- Chunking is heuristic.
- No ANN/vector DB yet.

### Next
- Add rerank, eval set, and regression checks.

## 2026-02-20 - Retrieval quality policy

### Decisions
- Added heading-aware chunking to reduce context drift.
- Added rerank boosts with breakdown tracing.
- Added entity extraction to improve filename/section matching.
- Added retrieval trace logs for debug and eval visibility.

### Retrieval policy v1
- Semantic similarity (cosine).
- Entity filename match (strong signal).
- Entity section match (medium signal).
- Entity text match (fallback lexical signal).
- Authority docs for definition-like queries.

### Notes
- Query enrichment should be selective.
- Entity-focused queries should avoid unnecessary enrichment.

## 2026-02-21 - Eval and response robustness

### Decisions
- Added answer eval runner with `hitRate` and `preferHitRate`.
- Added strict JSON retry + repair pass for parse stability.
- Added deterministic confidence calibration and confidence-violation checks.
- Added eval gate thresholds and report-based CI checks.

## 2026-02-24 - TypeScript orchestration runtime scaffold

### Decisions
- Introduced TS runtime structure:
  - `app/`, `runtime/`, `retrieval/`, `shared/`, `eval/`.
- Added planner, agent loop, tool registry, memory stub, policies, telemetry.
- Kept existing JS retrieval/search pipeline as adapter dependency.
- Added TS build/typecheck scripts (`tsx` + `typescript`).

### Rationale
- Separate orchestration concerns from transport and retrieval internals.
- Enable incremental migration without breaking existing JS behavior.

## 2026-02-24 - Planner config separation

### Decisions
- Added dedicated planner config block (`PLANNER_BASE_URL`, `PLANNER_MODEL`, etc.).
- Removed hard dependency on `OLLAMA_BASE_URL` fallback.
- Added base URL normalization to support missing `/v1` in OpenAI-compatible endpoints.

### Rationale
- Planner model can differ from answer/RAG model.
- Reduces endpoint misconfiguration errors.

## 2026-02-24 - Tool-intent routing and retrieval skip

### Decisions
- Detect tool-only intent from user query and registered tool names.
- Skip retrieval for tool-only requests.
- Return `sources=[]` for tool-driven answers.
- Add retrieval skip metadata: `retrievalSkipped`, `retrievalReason`.

### Rationale
- Avoid irrelevant retrieval cost/noise for pure tool commands.
- Keep source attribution meaningful.

## 2026-02-24 - Confidence reason and fast-path final

### Decisions
- Added `confidence_reason` to output/meta for debuggability.
- Added fast-path final when `responseIsFinal=true` and tool succeeds.
- Removed unnecessary second planner turn for finalizable tools (e.g. `echo`).

### Rationale
- Lower latency and token cost.
- Clearer confidence provenance.

## 2026-02-24 - Manifest-based tools (single registration contract)

### Decisions
- Refactored tools to `manifest + handler` model.
- Added central registry execution pipeline: register -> validate -> execute.
- Added standalone tool modules under `src/tools/*`.
- Kept runtime builtins as wrappers for compatibility.

### Rationale
- Tool addition becomes modular and predictable.
- Runtime behavior derives from manifest metadata.

## 2026-02-24 - Code ownership and architecture governance

### Decisions
- Added `docs/architecture.md` (boundaries and dependency direction).
- Added `.github/CODEOWNERS` (path-level ownership map).
- Added `docs/critical-flow-tests.md` (merge checklist for critical behavior).

### Rationale
- Improve maintainability and review discipline.
- Reduce hidden cross-layer coupling.

