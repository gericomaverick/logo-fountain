# Handoff: Laravel migration

## Now (overwrite this section at the end of every session)

- **Updated:** 2026-11-18 (night session; the owner is away and asked for autonomous progress with tracking)
- **Phase:** Epic 0 in progress. **0.1 done** (@smoke 2/2 on Next). **0.3 done** (seams). **0.4 done** (seed). **0.6b done** (rule fixtures, 933 cases). **0.7b done** (client contracts: 175 pass / 3 fixme). **0.5 done** (webhook 20 tests, 11 Stripe fixtures). **0.7a done** (auth 27 + checkout 10). **0.7c done** (admin contracts 55 pass / 4 fixme). **0.6a done** (267-case upload corpus). **0.2 done** (stack: `cd tests/parity && npm run infra:up|probe|down`; ports PG 55432, Mailpit 58025/SMTP 51025, S3 58333, postmark-shim 58090, stripe-fake 58091; test-only creds in `infra/docker-compose.test.yml`; Next-on-stack recipe in `tests/parity/README.md`).
- **Running (sub-agents):** 0.8a page objects plus journeys 1–2, and the unified DB lock and seed API (compose project `lf08a`, Next 4360).
- **Next:** 0.7d authz matrix (after 0.7a–c) → 0.8a–e journeys → 0.9 coverage and baseline. Epic 1 only after Epic 0 (and the owner's ADR review).
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
