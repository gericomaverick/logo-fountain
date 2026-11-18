# Handoff: Laravel migration

## Now (overwrite this section at the end of every session)

- **Updated:** 2026-11-18
- **Phase:** Phase 0 (brownfield capture), starting.
- **Done:** Plan v0.2. Owner decisions D1–D8 are resolved (`00-migration-plan.md` §7) and logged in `DECISIONS.md`.
- **Next step:** BMAD `document-project`, a deep scan of `apps/web` with output in `docs/laravel-migration/brownfield/`. Then the Phase 0 sweep checklist (`01-feature-inventory.md`), then `test-port-ledger.md`.
- **Blockers:** none.
- **Half-finished:** none.

## Verify the baseline

Run these before starting. Record the results here when they change.

```bash
cd apps/web
npm run typecheck && npm run lint && npm run test      # last recorded (TODO.md): 95 files / 614 passed
npm run test:e2e                                        # last recorded: 5–6 Playwright tests passing
```

| Date | Next unit | Next E2E | Parity (Next) | Parity (Laravel) | Notes |
|---|---|---|---|---|---|
| 2026-11-18 | not re-run | not re-run | n/a (suite not built) | n/a | Figures above are from `docs/TODO.md`, not re-verified in this session |

## Session log (newest first, one line each)

- 2026-11-18: Owner resolved D1–D8. Plan bumped to v0.2.

- 2026-11-18: Migration plan v0.1 drafted in `docs/laravel-migration/`.
