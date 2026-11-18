# Handoff: Laravel migration

## Now (overwrite this section at the end of every session)

- **Updated:** 2026-11-18 (night session; the owner is away and asked for autonomous progress with tracking)
- **Phase:** Epic 0 in progress. **0.1 done** (`tests/parity/`, @smoke 2/2 on Next).
- **Running:** sub-agents on 0.2, 0.6a and 0.6b in separate worktrees (branches `story/0-2`, `story/0-6a`, `story/0-6b`). The parent reviews and merges.
- **Next:** merge them → 0.3 (Next seams) → 0.4 → 0.5 → 0.7a–d → 0.8a–e → 0.9.
- **Run the suite:** `cd tests/parity && npm ci && PARITY_TARGET=next PARITY_START_NEXT=1 node scripts/run.mjs "@smoke"`.
- **Owner items:** unchanged (see the previous entry in the session log).

## Verify the baseline

Run these before starting. Record the results here when they change.

```bash
cd apps/web
npm run typecheck && npm run lint && npm run test      # 2026-11-18: 107 files (4 skipped), 722 passed / 20 skipped
npm run test:e2e                                        # last recorded: 5–6 Playwright tests passing
```

| Date | Next unit | Next E2E | Parity (Next) | Parity (Laravel) | Notes |
|---|---|---|---|---|---|
| 2026-11-18 | **107 files (103 passed, 4 skipped opt-in PG); 722 passed, 20 skipped.** typecheck ✓, lint ✓ (0 warnings) | not re-run (Playwright needs a dev server) | n/a (suite not built) | n/a | Re-verified for readiness m24. Earlier "95 files / 614" in TODO.md is stale |

## Session log (newest first, one line each)

- 2026-11-18: 0.1 done (parity scaffold, smoke green on Next). Next agent-nudge workaround.

- 2026-11-18: Readiness fixes applied. Epics v2. Sprint plan. Baseline re-verified (722 tests).

- 2026-11-18: PRD validation fixes. Epics and stories (74). Readiness check delegated.

- 2026-11-18: Hosting/backup/Cloudflare decisions. Architecture plus 28 ADRs. DV-13.

- 2026-11-18: Product brief and UX spec drafted. Design directions page. F-15/DV-12. Research delegated.

- 2026-11-18: Findings ruled → DV- deviations. Redesign added to scope (UX phase, behavioural parity, page objects).

- 2026-11-18: Phase 0 deep scan of apps/web, `brownfield/` docs, test-port ledger, inventory v2, findings F-1…F-14.

- 2026-11-18: Owner resolved D1–D8. Plan bumped to v0.2.

- 2026-11-18: Migration plan v0.1 drafted in `docs/laravel-migration/`.
