# SourceLens-RAG

Production-focused RAG core with a lightweight AI orchestration runtime (planner + tools + policies + eval gates).

[![Eval Gate](https://github.com/fatihkurt/SourceLens/actions/workflows/eval-gate.yml/badge.svg)](https://github.com/fatihkurt/SourceLens/actions/workflows/eval-gate.yml)
[![CI](https://github.com/fatihkurt/SourceLens/actions/workflows/ci.yml/badge.svg)](https://github.com/fatihkurt/SourceLens/actions/workflows/ci.yml)
![Node](https://img.shields.io/badge/node-%3E%3D20-339933)
![License](https://img.shields.io/badge/license-MIT-black)

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

High-impact knobs:
- Retrieval quality/cost: `TOP_K`, `TOP_N`, `MAX_HITS_PER_SOURCE`, `MAX_CONTEXT_CHARS`
- No-answer safety: `NO_ANSWER_MIN_TOP_SCORE`, `NO_ANSWER_MIN_GAP`, `NO_ANSWER_MIN_CONTEXT_CHARS`
- Cache behavior: `CACHE_ENABLED`, `EMBED_CACHE_ENABLED`, `QUERY_CACHE_ENABLED`, `QUERY_CACHE_TTL_SEC`

Paths:
- Cache root: `CACHE_DIR` (default `./cache`)
- Index manifest: `data/index/index_manifest.json`
- Active index vectors: `data/index/index_<id>/vectors.jsonl`

## Design Choices

- Source cap (`MAX_HITS_PER_SOURCE`):
  prevents one document from dominating context and reduces token waste.
- Confidence calibration:
  combines model confidence with retrieval signal quality (scores/gaps/context).
- No-answer gate:
  abstains when evidence is weak, ambiguous, or fallback-heavy to reduce hallucinations.

## Project Docs

- Architecture: `docs/architecture.md`
- Branch protection: `docs/branch-protection.md`
- Critical checks: `docs/critical-flow-tests.md`
- Decisions and changelog notes: `docs/decision-log.md`
- Contribution guide: `CONTRIBUTING.md`
- Code of conduct: `CODE_OF_CONDUCT.md`

## Security Notes

- Never commit `.env` or secrets.
- Keep tool allowlist restricted in production (`TOOL_ALLOWLIST`).

## License

MIT (`LICENSE`)
