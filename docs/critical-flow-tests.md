# Critical Flow Test Checklist

Use this checklist for every significant runtime/tool/retrieval change.

## Tool Intent Routing
- [ ] Input like `use echo: hello` sets tool intent.
- [ ] Retrieval is skipped for tool-only intent.
- [ ] `meta.retrievalSkipped=true` and `meta.retrievalReason=tool_intent`.
- [ ] `sources=[]` for tool-only flow.

## Fast-Path Final (`responseIsFinal`)
- [ ] Tool with `responseIsFinal=true` returns final answer without second planner turn.
- [ ] Trace has one `planner.decide` + one `tool.execute` in fast-path case.
- [ ] `confidence_reason=tool_ok` when tool succeeds.

## Non-Final Tool Flow
- [ ] Tool with `responseIsFinal=false` does not bypass planner finalization.
- [ ] Tool result is included in context for the next planner decision.

## Tool Registry + Validation
- [ ] Unknown tool returns structured error.
- [ ] Invalid args are rejected by registry validation.
- [ ] Valid args execute handler and produce `ToolResult`.

## Planner Contract
- [ ] Planner output parses into valid decision schema.
- [ ] Invalid planner JSON falls back safely (no crash).
- [ ] Tool name and args propagate to execution unchanged.

## Retrieval Integrity
- [ ] For non-tool-intent questions, retrieval still runs.
- [ ] `retrievalCount > 0` when retrieval is expected.
- [ ] Source formatting remains stable (`source#chunk_index` where applicable).

## Confidence Behavior
- [ ] Tool-only success: confidence high/expected and reason reflects tool path.
- [ ] Retrieval path: confidence uses retrieval/planner logic.
- [ ] Fallback/limit path sets conservative confidence.

## Smoke Commands
Run these before merge:

```bash
npm run typecheck
npm test
npm run cli:ts -- "use echo: hello"
```

