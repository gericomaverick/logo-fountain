# Handoff: Laravel migration

## Now (overwrite this section at the end of every session)

- **Updated:** 2026-11-20
- **Phase:** Epic 0 done. **Epic 1 in progress: 1.1a done** (Laravel 13 skeleton in `apps/portal`, Docker dev stack, pins; record `stories/1-1a-skeleton-compose-pins.md`).
- **Running:** 5 sub-agents in worktrees: **1.1b, 1.2, 1.3, 1.6, 1.7** (stack ports: `COMPOSE_PROJECT_NAME=lf-<story>`, `PORTAL_HTTP_PORT=1808n`). After a restart they're gone: check `git worktree list` and the `worktree-*` branches for their commits, and merge or finish them (RESUME.md §2). The parity CI workflow was pushed (`422cfc7`); its first GitHub run is unchecked (no `gh` here; see the repo's Actions tab).
- **Next:** stories that can now run in parallel (sub-agents in worktrees): **1.1b** (CI: laravel-ci, audit, log grep; pin image digests), **1.2** (`apps/portal/AGENTS.md` + project-context), **1.3** (config validation, canonical origin), **1.6** (error shape, headers), **1.7** (tokens/theming). Then 1.4/1.5 after 1.3. Run `create-story` for each first.
- **Portal dev:** `cd apps/portal && docker compose up -d` gives http://localhost:8080; `bin/test` runs Pint, Larastan level 9 and Pest. No host PHP.
- **Dated follow-up:** from 2026-11-23, bump Inertia to ^3.7 / react adapter 3.11.0.
- **Owner items (open):** key-screen approval and the one-project shortcut (before Epics 6/7), turnaround copy for empty states, brief reference uploads (post-launch?), launch date. MacBook worker paused.
- **Run the parity suite on Next:** `cd tests/parity && npm run infra:up && node scripts/next-stack.mjs ["<gate>"] [--repeat N] [-- playwright args]`. Run `@disruptive` separately with `-- --workers=1`.

## Verify the baseline

Run these before starting. Record the results here when they change.

```bash
cd apps/web
npm run typecheck && npm run lint && npm run test      # 2026-11-18: 107 files (4 skipped), 722 passed / 20 skipped
npm run test:e2e                                        # last recorded: 5–6 Playwright tests passing
```

| Date | Next unit | Next E2E | Parity (Next) | Parity (Laravel) | Notes |
|---|---|---|---|---|---|
| 2026-11-19 | **107 files passed, 4 skipped; 1013 passed, 20 skipped.** typecheck ✓ (after fixing the 0.4 test typing), lint ✓ | not re-run (superseded by the parity suite) | **Baseline: 3 consecutive green full runs, 727 passed + 1 skipped each (12.0–12.3 min), 0 unexpected failures; the 32 `@deviation` tests failed as expected. `@disruptive` ×3: 1/1/1 passed.** | n/a | Story 0.9. Command: `next-stack.mjs --repeat 3 -- --grep-invert "@disruptive\|@stripe-live-test"` |
| 2026-11-18 | **107 files (103 passed, 4 skipped opt-in PG); 722 passed, 20 skipped.** typecheck ✓, lint ✓ (0 warnings) | not re-run (Playwright needs a dev server) | n/a (suite not built) | n/a | Re-verified for readiness m24. Earlier "95 files / 614" in TODO.md is stale |

## Session log (newest first, one line each)

- 2026-11-20: Launched 1.1b, 1.2, 1.3, 1.6 and 1.7 in parallel worktrees. Compose ports are configurable (`8586e63`).

- 2026-11-20: **Story 1.1a done** (`7d34116`, `.gitkeep` fix). Fresh clone: `/up` 200; Pint, Larastan 9 and Pest 5/5 pass. Framework pinned ^13.40 (advisory on 13.39); Inertia on the 3.5.2/3.9.1 fallbacks until 2026-11-23. Replaced the skeleton's Boost AGENTS/CLAUDE files. CI workflow pushed (`422cfc7`).

- 2026-11-19: **Epic 0 done.** Baseline: 3 consecutive green runs (727/727/727). apps/web typecheck fixed (0.4 test typing). The CI workflow awaits the owner's OK to push.

- 2026-11-19: The lease fix cut a full run from 41 to 12.6 min (726 pass, 1 fail). The J4 image-cache flake was fixed (`ddd85fd`, 5/5 green). **Baseline restarted** (scratchpad `baseline4.log`).

- 2026-11-19: The baseline failed twice at the end of the queue (9 DB lease timeouts per run). Fixed: lease fixture timeout (`6178dea`); idle workers holding file-scoped shared leases (`bed6ea2`). **Baseline restarted** (scratchpad `baseline3.log`; same commands as below).

- 2026-11-19: Dry run 708 pass / 14 fail. Root causes fixed (`db9801f`): blocking spawn froze the webhook forwarder, unbounded networkidle waits, the J4 F-15 race. **3-run baseline started in the background** (log: session scratchpad `baseline.log`; if the session restarts, re-run with `node scripts/next-stack.mjs --repeat 3 -- --grep-invert "@disruptive|@stripe-live-test"`, then `"@disruptive" --repeat 3 -- --workers=1`).

- 2026-11-19: Added `RESUME.md` (restart checklist) and a repo-root `CLAUDE.md` pointer.

- 2026-11-19: The owner accepted the architecture: all 28 ADRs → Accepted.

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
