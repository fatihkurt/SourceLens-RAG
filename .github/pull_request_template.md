## Summary

- What changed:
- Why:

## Validation

- [ ] `npm run typecheck`
- [ ] `npm test`
- [ ] `npm run build`
- [ ] `npm run eval:gate` (when model/embedding env is available)

## Risk Check

- [ ] No secrets committed (`.env`, API keys, private data)
- [ ] Backward compatibility considered (CLI/server/eval flows)
- [ ] If retrieval/planner/tool logic changed, related tests were added/updated

## Documentation

- [ ] Updated `README.md` if usage/config changed
- [ ] Updated `docs/decision-log.md` for behavior changes
