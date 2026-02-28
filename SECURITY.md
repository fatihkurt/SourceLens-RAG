# Security Policy

## Supported Versions

Security fixes are applied to the latest `main` branch state.

## Reporting a Vulnerability

Please report vulnerabilities through GitHub Security Advisories:

- `Security` tab -> `Report a vulnerability`

If unavailable, open a private maintainer contact via repository channels and avoid posting exploit details in public issues.

## Threat Model (Mini)

SourceLens-RAG is a RAG + tool orchestration system. Main risks:

- Prompt injection from untrusted retrieved content
- Tool misuse via unsafe planner decisions
- Data exfiltration via unrestricted tool/network access
- Secret leakage in logs or committed files

## Safe Defaults

- Keep `TOOL_ALLOWLIST` minimal in production.
- Keep `NO_ANSWER_GATE_ENABLED=1` to avoid unsupported claims.
- Prefer conservative retrieval limits (`TOP_K`, `MAX_CONTEXT_CHARS`) to reduce attack surface.
- Do not ingest untrusted/private documents into shared indexes.
- Never commit `.env` or secrets.

## Operational Guidance

- Rotate API keys if accidentally exposed.
- Review traces/logs for suspicious tool calls.
- Pin Node version (`.nvmrc`) and use `npm ci` for deterministic installs.
