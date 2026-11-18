# Handoff: Laravel migration

## Now (overwrite this section at the end of every session)

- **Updated:** 2026-11-18
- **Phase:** **Planning complete. Implementation ready** (BMAD 4). Sprint plan in `stories/sprint-status.yaml` (94 stories, all backlog).
- **Done this session:** readiness check (READY WITH CONDITIONS, `reports/readiness-report.md`), and all critical and major findings applied: epics v2 (three DoD variants, layer-tag gates, splits, the new 2.7 mail pipeline, no forward dependencies), stripe-fake in place of live Stripe for the parity suite (C1), the Next seams scoped as O-09, BMAD config pointing at tracked folders, 26 stale statements fixed, and the baseline re-verified.
- **Next step:** BMAD `create-story` for **0.1 Parity suite scaffold** → `stories/0-1-parity-suite-scaffold.md` (with the conversion-record sections), then `dev-story`. 0.1, 0.2, 0.6a and 0.6b need no owner input. 0.3 (Next seams) proceeds unless the owner vetoes the O-09 exceptions.
- **Owner items, by the epic they block:** Epic 1: architecture review (ADRs Proposed → Accepted), the Sfizia app licence, PHP 8.5.13 (released 2026-11-19). Epics 6 and 7: key-screen approval, the one-project shortcut, turnaround copy. Epic 9: infrastructure, secrets, the Stripe live webhook. Optional: the Stripe test key for `@stripe-live-test`.
- **Half-finished:** none.
- **Remote worker:** MacBook (`ssh macbook`). Needs `claude setup-token`, the repo clone and Docker there (paused by the owner).

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

- 2026-11-18: Readiness fixes applied. Epics v2. Sprint plan. Baseline re-verified (722 tests).

- 2026-11-18: PRD validation fixes. Epics and stories (74). Readiness check delegated.

- 2026-11-18: Hosting/backup/Cloudflare decisions. Architecture plus 28 ADRs. DV-13.

- 2026-11-18: Product brief and UX spec drafted. Design directions page. F-15/DV-12. Research delegated.

- 2026-11-18: Findings ruled → DV- deviations. Redesign added to scope (UX phase, behavioural parity, page objects).

- 2026-11-18: Phase 0 deep scan of apps/web, `brownfield/` docs, test-port ledger, inventory v2, findings F-1…F-14.

- 2026-11-18: Owner resolved D1–D8. Plan bumped to v0.2.

- 2026-11-18: Migration plan v0.1 drafted in `docs/laravel-migration/`.
