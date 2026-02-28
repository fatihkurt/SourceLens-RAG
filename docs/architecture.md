# SourceLens-RAG Architecture

## Goal
Keep the codebase easy to reason about by enforcing clear module boundaries, explicit contracts, and small changes.

## Layers

### `src/app/*` (Transport Layer)
- Responsibility: CLI and HTTP entrypoints only.
- Allowed:
  - Parse request/input.
  - Instantiate dependencies.
  - Call orchestration/runtime.
- Not allowed:
  - Business logic.
  - Retrieval logic.
  - Tool execution logic.

### `src/runtime/*` (Orchestration Layer)
- Responsibility: agent loop, planner coordination, context assembly, tool dispatch, policy checks, telemetry.
- Allowed:
  - Call `src/retrieval/*`.
  - Call `src/tools/*` through registry.
  - Use shared LLM client and utilities.
- Not allowed:
  - Direct storage-specific retrieval internals.
  - Transport-specific logic (HTTP/CLI specifics).

### `src/tools/*` (Tool Modules)
- Responsibility: tool manifest + handler.
- Allowed:
  - Input validation.
  - Perform one tool action.
- Not allowed:
  - Agent loop decisions.
  - Prompt construction.

### `src/retrieval/*` (Knowledge Layer)
- Responsibility: retrieve/rerank/cap/confidence.
- Allowed:
  - Search/index operations.
  - Scoring and calibration.
- Not allowed:
  - Tool policy decisions.
  - HTTP/CLI logic.

### `src/shared/*` (Cross-cutting Utilities)
- Responsibility: reusable infra helpers (LLM client, json/text/hash utils).
- Allowed:
  - Generic helper functions.
- Not allowed:
  - Runtime policy/agent decisions.

## Dependency Direction

Allowed flow:
`app -> runtime -> (retrieval, tools, shared)`

Disallowed flow:
- `retrieval -> runtime`
- `tools -> runtime/agent`
- `shared -> runtime business logic`

## Contract-First Files

These contracts should change rarely and intentionally:
- `src/runtime/agent/types.ts`
- `src/runtime/tools/types.ts`
- `src/retrieval/retrieve.ts`

When changing a contract:
1. Update docstring/comments.
2. Update tests touching that contract.
3. Add a short note in `docs/decision-log.md`.

## Change Rules

1. Prefer PRs touching 1-2 modules.
2. Avoid hidden env logic deep in functions.
3. Add tests for every new orchestration branch.
4. Do not mix refactor + feature + behavior change unless required.
