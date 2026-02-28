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

## 2026-02-25 - Planner hardening and deterministic routing

### Decisions
- Added deterministic pre-planner router for obvious tool invocations.
- Added planner parse hardening with multi-pass strategy:
  - direct parse
  - JSON repair pass
  - fail-closed fallback
- Added planner observability payload:
  - input size, output type, parse status/mode, latency, usage.
- Added planner debug metadata fields to runtime output:
  - `planner_reason`, `parse_mode`, `planner_observation`.

### Rationale
- Reduce planner flakiness from malformed JSON.
- Cut latency/cost by bypassing LLM planner on deterministic tool directives.
- Make regressions diagnosable from logs/reports without raw prompt dumps.

## 2026-02-25 - Tool-call guardrails and structured recovery feedback

### Decisions
- Enforced tool allowlist at policy layer (`TOOL_ALLOWLIST`).
- Standardized tool error feedback as structured `tool_error` payload:
  - `code`, `tool`, `message`, `retryable`, `provided_args`, optional schema/allowlist.
- Rendered `tool_error` into tool context so planner can correct next turn.
- Extended tool registry execution to return structured validation/execution failures.

### Rationale
- Keep tool execution predictable and policy-controlled.
- Enable clean planner recovery after arg/schema/policy errors.
- Improve debuggability and eval visibility for tool failures.

## 2026-02-25 - Runtime harness separation and single-turn controls

### Decisions
- Moved dev/test runner to `src/runtime/harness/runOnce.ts` with explicit non-production note.
- Added backward-compat shim `src/runtime/runner.ts` to avoid import breakage.
- Shared fast-path semantics via `src/runtime/tools/semantics.ts`.
- Added `Agent.run` controls:
  - `maxTurns`
  - `retrieval: 'auto' | 'always' | 'never'`
  - `userText` alias for `question`.
- Added harness tests to prevent behavior drift.

### Rationale
- Keep production orchestration (`Agent.run`) and test harness roles explicit.
- Prevent duplicated business rules across agent/harness.
- Support deterministic single-turn/eval scenarios without forking runtime logic.

## 2026-02-28 - Two-layer cache for RAG latency/cost control

### Decisions
- Added file-based embedding cache in `src/core/embedder.js`.
- Added file-based query/result cache in `src/search.js`.
- Added shared cache utility in `src/utils/fileCache.js`.
- Added cache config block in `src/core/config.js`.
- Added cache clear scripts:
  - `npm run cache:clear`
  - `npm run cache:clear:queries`
  - `npm run cache:clear:embeddings`
- Added automatic query-cache invalidation after successful ingest in `src/ingest.js`.

### Cache logic
- Embedding cache key:
  - `sha256("${EMBED_PROVIDER}:${EMBED_MODEL}\n${normalizedText}")`
- Embedding normalization:
  - `trim + whitespace collapse` (no forced lowercase).
- Embedding cache value:
  - provider/model metadata + embedding vector.
- Query cache key:
  - `sha256(JSON.stringify({ query, retrieval params, debug flags, entity/operation candidates }))`
- Query cache value:
  - `sources + context + hits + traces`.
- Storage:
  - file cache under `cache/<namespace>/<prefix>/<hash>.json`.

### TTL policy
- Embedding cache TTL: optional (default `0` = no expiry).
- Query cache TTL: enabled by default (default `600s`).

### Rationale
- Embedding cache removes repeated embedding cost during re-ingest/re-run.
- Query cache reduces repeated retrieval+rereank latency in CLI/REST demos.
- Explicit invalidate-on-ingest keeps query cache aligned with updated index.

### Tradeoffs
- File cache is simple but not distributed.
- Query cache key includes debug/entity inputs, so key space can grow quickly.
