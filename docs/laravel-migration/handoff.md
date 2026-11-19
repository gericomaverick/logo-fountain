# Handoff: Laravel migration

## Now (overwrite this section at the end of every session)

- **Updated:** 2026-11-18 (night session; the owner is away and asked for autonomous progress with tracking)
- **Phase:** Epic 0 in progress. **0.1 done** (@smoke 2/2 on Next). **0.3 done** (seams). **0.4 done** (seed). **0.6b done** (rule fixtures, 933 cases). **0.2 done** (stack: `cd tests/parity && npm run infra:up|probe|down`; ports PG 55432, Mailpit 58025/SMTP 51025, S3 58333, postmark-shim 58090, stripe-fake 58091; test-only creds in `infra/docker-compose.test.yml`; Next-on-stack recipe in `tests/parity/README.md`).
- **Running (sub-agents, separate worktrees):** 0.6a upload corpus · 0.5 Stripe scenarios (own PG 55530, Next 4340, shared stack) · 0.7a auth/checkout contracts (isolated compose project `lf07a`, Next 4350) · 0.7b client contracts (PG 55510, Next 4320) · 0.7c admin contracts (PG 55520, Next 4330, SeaweedFS 8343). The parent cherry-picks each after review.
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
