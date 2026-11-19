# Handoff: Laravel migration

## Now (overwrite this section at the end of every session)

- **Updated:** 2026-11-18 (night session; the owner is away and asked for autonomous progress with tracking)
- **Phase:** Epic 0 in progress. **0.1 done** (@smoke 2/2 on Next). **0.3 done** (seams). **0.4 done** (seed). **0.6b done** (rule fixtures, 933 cases). **0.8e done** (12 DV plus 5 abuse tests). DV-15 tests added. **0.8d done** (admin journeys 12–18, 4 new scenarios). **0.8c done** (journeys 7–11, DV-14 test). **0.8b done** (journeys 3–6). **0.8a done** (page objects, J1/J2, unified DB lock: `test.use({ db })`). **0.7d done** (authz 224-cell matrix, origin guard 237, concept-status 26, 16 deviation tests). **0.7b done** (client contracts: 175 pass / 3 fixme). **0.5 done** (webhook 20 tests, 11 Stripe fixtures). **0.7a done** (auth 27 + checkout 10). **0.7c done** (admin contracts 55 pass / 4 fixme). **0.6a done** (267-case upload corpus). **0.2 done** (stack: `cd tests/parity && npm run infra:up|probe|down`; ports PG 55432, Mailpit 58025/SMTP 51025, S3 58333, postmark-shim 58090, stripe-fake 58091; test-only creds in `infra/docker-compose.test.yml`; Next-on-stack recipe in `tests/parity/README.md`).
- **Running:** none. The parent is finishing 0.9 (lock fairness, flake fixes, 3-run baseline, CI workflow).
- **Next:** 0.8b–e journeys (after 0.8a) → 0.9 coverage gate and 3-run baseline. **Owner decisions:** F-16 → DV-15 approved, and DV-14 confirmed (both 2026-11-19). DV-15 deviation tests to be added after 0.8e merges. Epic 1 after Epic 0 plus the owner's ADR review.
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

- 2026-11-19: 0.9: FIFO DB lock queue (30 min timeout), J13 race fix, dev warm-up. Full-suite dry run in progress.

- 2026-11-19: 0.8e merged. DV-15 tests written. Coverage 108/108 rows, 15/15 DVs (strict).

- 2026-11-19: Owner approved DV-15 (F-16 webhook hopeless-retry fix) and confirmed DV-14.

- 2026-11-19: 0.9 started. `npm run coverage` (`tests/parity/scripts/coverage.mjs`) gives 104/108 rows and 5/14 DV rows. 19 Laravel-only destinations are in `fixtures/laravel-only-destinations.json`. Open: K-13 and the DVs (0.8e), and D-04, D-10, X-16 (0.9 tests).

- 2026-11-19: 0.8d merged. All 18 journeys are green on Next. 4 new scenarios (draft-concept, finals-ready-no-approval, stale-hold, admin-queue).

- 2026-11-19: 0.8c merged (journeys 7–11). All customer journeys J1–J11 are green on Next.

- 2026-11-19: 0.8b merged (journeys 3–6). Sub-agent branch pushes are denied by permissions, so work goes via main.

- 2026-11-19: 0.8b/c/d cut off by the usage limit again, then resumed with instructions to push their story branches as they go.

- 2026-11-19: 0.8a merged. One DB lock for all specs; combined 12-worker run 433 passed, 0 failed.

- 2026-11-19: 0.7d merged (all 0.7 contract suites done). The DV-7 wording now uses the route's own missing-concept response.

- 2026-11-19: 0.7d and 0.8a were cut off by an account usage limit, then resumed after it reset.

- 2026-11-19: 0.7b merged. **F-17: admin replies return 500 in Next** (trigger blocks the `isAdmin` upsert) → DV-14 fix in Laravel.

- 2026-11-19: 0.5 merged. F-16 raised (webhook retries forever on some failures; owner decision before 5.5).

- 2026-11-19: 0.7a merged. 4 auth corrections added to `brownfield/auth-and-security.md`. Gotcha: `next dev --webpack` is needed in worktrees.

- 2026-11-19: 0.7c merged. 6 Next-vs-doc corrections added to `brownfield/api-admin.md`.

- 2026-11-19: 0.6a merged (267 upload cases, 268 Next tests; Laravel ZIP cap differences recorded).

- 2026-11-19: All 5 running agents (0.5, 0.6a, 0.7a, 0.7b, 0.7c) were cut off by an account usage limit and resumed after it reset. If any story looks half-done, check its worktree under `.claude/worktrees/`.

- 2026-11-19: 0.2 merged (offline stack; SeaweedFS conditional PUT verified).

- 2026-11-18: 0.6b merged (rule fixtures, 933 cases).
- 2026-11-18: 0.4 done (seed verified: login, snapshot, tenancy 404).
- 2026-11-18: 0.3 done (Next seams a–c, inert unless PARITY_MODE=1).
- 2026-11-18: 0.1 done (parity scaffold, smoke green on Next). Next agent-nudge workaround.

- 2026-11-18: Readiness fixes applied. Epics v2. Sprint plan. Baseline re-verified (722 tests).

- 2026-11-18: PRD validation fixes. Epics and stories (74). Readiness check delegated.

- 2026-11-18: Hosting/backup/Cloudflare decisions. Architecture plus 28 ADRs. DV-13.

- 2026-11-18: Product brief and UX spec drafted. Design directions page. F-15/DV-12. Research delegated.

- 2026-11-18: Findings ruled → DV- deviations. Redesign added to scope (UX phase, behavioural parity, page objects).

- 2026-11-18: Phase 0 deep scan of apps/web, `brownfield/` docs, test-port ledger, inventory v2, findings F-1…F-14.

- 2026-11-18: Owner resolved D1–D8. Plan bumped to v0.2.

- 2026-11-18: Migration plan v0.1 drafted in `docs/laravel-migration/`.
