# SourceLens-RAG

Production-focused RAG core with a lightweight AI orchestration runtime (planner + tools + policies + eval gates).

## What It Includes

- Retrieval pipeline with semantic scoring, rerank, source-cap, and diversified selection.
- No-answer (abstain) gate when evidence is weak.
- Embedding cache + query/result cache (file-based).
- Index lifecycle (idempotent ingest, active index switch, rollback).
- Runtime agent loop (retrieve -> plan -> tool -> answer).
- Tool registry with manifest, schema validation, and final-response fast-path.
- Eval pipelines with report generation and gate checks.

## Quick Start

1. Install dependencies:

```bash
npm install
```

2. Configure environment:

```bash
cp .env.example .env
```

Set at minimum:
- `LLM_BASE_URL`
- `LLM_API_KEY`
- `LLM_MODEL`
- `EMBED_BASE_URL`
- `EMBED_MODEL`

3. Ingest documents:

```bash
npm run ingest
```

4. Ask from CLI:

```bash
npm run cli:ts -- "What is CustomerRole?"
```

5. Run HTTP server:

```bash
npm run server:ts
```

## Evaluation

Run answer eval:

```bash
npm run eval
```

Run eval + gate:

```bash
npm run eval:gate
```

## Cache and Index Lifecycle

Clear all cache:

```bash
npm run cache:clear
```

Index lifecycle:

```bash
npm run index:status
npm run index:rebuild
npm run index:rollback -- <indexId>
```

## Configuration

Use `.env.example` as reference. Key groups:
- LLM / planner
- embedding / retrieval
- no-answer gate
- cache
- eval + gate thresholds

## Project Docs

- Architecture: `docs/architecture.md`
- Critical checks: `docs/critical-flow-tests.md`
- Decisions and changelog notes: `docs/decision-log.md`
- Contribution guide: `CONTRIBUTING.md`

## Security Notes

- Never commit `.env` or secrets.
- Keep tool allowlist restricted in production (`TOOL_ALLOWLIST`).

## License

MIT (`LICENSE`)
