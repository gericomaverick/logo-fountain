# Handoff: Laravel migration

## Now (overwrite this section at the end of every session)

- **Updated:** 2026-11-18
- **Phase:** Pre-Phase 0. Plan drafted, waiting for the owner's decisions D1–D7 (`00-migration-plan.md` §7).
- **Done:** First draft of the plan, the feature inventory (A/K/C/D/N/X/O series), the test strategy, the documentation protocol, and the story-record template.
- **Next step:** Once D1–D7 are answered, run BMAD `document-project` (deep scan of `apps/web`), then do the Phase 0 sweep checklist at the bottom of `01-feature-inventory.md`, then build `test-port-ledger.md`.
- **Blockers:** Owner decisions D1–D7.
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

- 2026-11-18: Migration plan v0.1 drafted in `docs/laravel-migration/`.
