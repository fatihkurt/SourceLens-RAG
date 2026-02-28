# Contributing

## Setup

1. `npm install`
2. `cp .env.example .env`
3. Configure required env values.

## Development Checks

- Typecheck: `npm run typecheck`
- Tests: `npm test`
- Eval: `npm run eval`
- Eval + gate: `npm run eval:gate`

## PR Rules

- Keep commits small and focused.
- Update docs when behavior changes (`docs/decision-log.md` at minimum).
- Do not commit secrets (`.env`, API keys, private data).
- Include test coverage for scoring, selection, or planner/tool behavior changes.
