# Handoff: Laravel migration

## Now (overwrite this section at the end of every session)

- **Updated:** 2026-11-21
- **Machine:** the work moved to the **owner's Mac**. Docker is OrbStack (`export PATH="$HOME/.orbstack/bin:$PATH"`). Baseline re-verified here (table below). The `_bmad/bmm`/`core` symlinks dangle (no BMAD install on the Mac): follow the story files and `templates/`. Governance logs are now `docs/governance/{DECISIONS,RISKS,ASSUMPTIONS}.md`.
- **Phase:** Epics 0 and 1 done. **Epic 2 is handed to Workbench** (the owner's agent harness, `~/Code/workbench`) as a trial: brief `briefs/workbench-epic-2.md`; Workbench profile `~/Code/workbench/projects/logo-fountain.json` + `logo-fountain.setup.sh` (each builder gets its own portal stack `lf-wbN`, ports 18080+N etc.; tested end to end: `bin/test` 318/318 in a builder copy).
- **2.1** is at **`review`** on branch `workbench/schema` (Workbench builder "schema"; base main `129a599`): 22-table schema migrations, `php artisan db:grants`, admin-flag trigger, email checks, `pgsql_limits` validator, owner-migrating test harness. `bin/test` 403/403 on a fresh `lf-wb1` volume (Concurrency suite 33). CI not yet run on the branch (needs a PR or a manual dispatch). Record: story 2.1 → Conversion record. 2.2–2.7 backlog.
- **Running:** nothing. The owner's stack `lf-portal` is up (port 8080).
- **Next:** the owner starts Workbench (`cd ~/Code/workbench && npm start`, choose Logo Fountain) and points the lead at the brief. Workbench delivers 2.1 → 2.2–2.5 → 2.6/2.7 on stacked `workbench/*` branches; the owner merges in order. **If Workbench isn't used,** a Claude Code session runs the same brief with its own sub-agents.
- **Blockers (owner):**
  - **Disk:** 21 GB free after clearing Table Trove's Xcode build output (2026-11-21). Two builder stacks may run (brief §5: more than 10 GB). The Next parity stack (`npm ci` in `apps/web` and `tests/parity`, plus its images) should now fit, which unblocks 2.6's Next-side comparison; re-check `df -h` first.
  - **Push works** (fixed 2026-11-21): `gh` is signed in as gericomaverick, and this repo's `origin` is HTTPS with a **repo-local** credential helper. The global git config is untouched; the owner's work SSH key (`~/.ssh/id_ed25519`) stays the default for `github.com`.
- **Dated follow-up:** from 2026-11-23, bump Inertia to ^3.7 / `@inertiajs/react` 3.11.0 (update AGENTS.md §4 and `project-context.md`). Not in Workbench's brief.
- **Owner items (open):** banner copy (`resources/js/lib/status.ts` `BANNER_COPY`); Sfizia EULA (WOFF2); NFR-P2 throttling (RISKS 2026-11-20); key-screen approval and the one-project shortcut (before Epics 6/7); empty-state turnaround copy; brief reference uploads; launch date.
- **Run the suites:** **Portal:** `cd apps/portal && docker compose up -d && bin/test && bin/ui-test && bin/browser-test`. **Parity on Next:** `cd tests/parity && npm ci && npm run infra:up && node scripts/next-stack.mjs ["<gate>"]` (needs disk). **Parity on Laravel:** `node tests/parity/scripts/laravel-stack.mjs "<gate>" [--only <regex>]`.

## Verify the baseline

Run these before starting. Record the results here when they change.

```bash
cd apps/web
npm run typecheck && npm run lint && npm run test      # 2026-11-18: 107 files (4 skipped), 722 passed / 20 skipped
npm run test:e2e                                        # last recorded: 5–6 Playwright tests passing
```

| Date | Next unit | Next E2E | Parity (Next) | Parity (Laravel) | Notes |
|---|---|---|---|---|---|
| 2026-11-21 (Mac) | not run (no `node_modules`; disk) | n/a | not run (disk) | not run | **Portal on the Mac, main `53077a6`:** `bin/test` Pest 318 passed (959 assertions); `bin/ui-test` 217/217; `bin/browser-test` 260 passed, 8 skipped (phone-only). Builder copy `lf-wb1`: Pest 318/318, `/up` 200 |
| 2026-11-19 | **107 files passed, 4 skipped; 1013 passed, 20 skipped.** typecheck ✓ (after fixing the 0.4 test typing), lint ✓ | not re-run (superseded by the parity suite) | **Baseline: 3 consecutive green full runs, 727 passed + 1 skipped each (12.0–12.3 min), 0 unexpected failures; the 32 `@deviation` tests failed as expected. `@disruptive` ×3: 1/1/1 passed.** | n/a | Story 0.9. Command: `next-stack.mjs --repeat 3 -- --grep-invert "@disruptive\|@stripe-live-test"` |
| 2026-11-18 | **107 files (103 passed, 4 skipped opt-in PG); 722 passed, 20 skipped.** typecheck ✓, lint ✓ (0 warnings) | not re-run (Playwright needs a dev server) | n/a (suite not built) | n/a | Re-verified for readiness m24. Earlier "95 files / 614" in TODO.md is stale |

## Session log (newest first, one line each)

- 2026-11-21: **Workbench builder "schema": story 2.1 → review** on `workbench/schema` (was `workbench/2.1`). Migrations, `db:grants`, DB guards, harness; `bin/test` 403 passed; stack `lf-wb1` removed after the gates. See story 2.1 Conversion record.
- 2026-11-21: **"schema": critic review fixes for 2.1** (still `review`): AGENTS §2 migrate row adds `db:grants`; admin-flag trigger hardened against a temporary `pg_class` (deviation from Next, DECISIONS) + `RuntimeRoleTest` asserts no `TEMP`; AC 7 code corrected to `23001`; ASSUMPTIONS narrowed; O-06 notes the Epic 9 deploy step. `bin/test` 403 passed (1161 assertions), split 370 + 33. CI not dispatched (owner's call); `composer.json` `setup` still migrates without `db:grants` (open item).

- 2026-11-21: **Moved to the owner's Mac; Epic 2 handed to Workbench.** OrbStack installed (a full disk had corrupted the first builds); portal baseline matches (318/217/260). Story 2.1 decisions: Laravel conventions (owner). Fixed Linux paths (`_bmad/*.json|yaml`, protocol, RESUME). Workbench profile and builder-stack setup rewritten for the portal and tested; brief `briefs/workbench-epic-2.md`. Push fixed: `gh` signed in as gericomaverick, `origin` HTTPS, repo-local credential helper (global git config untouched).

- 2026-11-21: **Story 2.1 created (ready-for-dev).** `stories/2-1-schema-migrations-and-roles.md`: 22-table checklist from the Next SQL, trigger/checks/grants, `db:grants`, owner-migrating test harness, 10 open questions with recommendations.

- 2026-11-20: **Story 1.9 merged; Epic 1 done.** Shells (TabNav as a nav of links, More overflow on phones), design lint (pixel font size, gradients), ESLint 9, CI `ui` and `lighthouse` jobs. First CI run: the `ui` axe check flaked on a fading dialog, so every axe run now waits for animations (`b353a1c`, 280/280 over 10 repeats). All portal jobs green.

- 2026-11-20: CI green on the 1.8c merge (portal: laravel-ci + audit; parity: next + laravel). Launched 1.9, the last Epic 1 story.

- 2026-11-20: **Story 1.8c merged** (route, route-test and contrast conflicts kept both sides). Card/Panel, Tabs (Radix 1.2.1), concept card/gallery/viewer, PrivateImage, FileCard, UploadDropzone (Next's real limits), Thread, DataTable, PropertiesPanel, `usePolling` (backoff, hidden-tab pause). Merged main: Pest 317, ui-test 215/215, browser 208/208.

- 2026-11-20: **Story 1.8b merged.** TurnBanner (11 states + 3 celebrations), StatusPill, StageTracker (Next's `buildTimeline`, 84/84 fixture), AllowanceMeter, EmptyState, Skeleton; `/dev/ui/status`. Merged main: Pest 316, ui-test 150/150, browser 144/144. **Owner:** review the banner copy (`resources/js/lib/status.ts` `BANNER_COPY`).

- 2026-11-20: parity.yml skips docs-only pushes and cancels superseded runs (`9221417`). Card/Panel and Tabs added to 1.8c (`1b12199`). Launched 1.8b and 1.8c in parallel, each with its own catalogue sub-page so the baselines don't clash. Parity on the 1.4 merge: next and laravel both green.

- 2026-11-20: **Story 1.8a merged** (routes conflict: both dev routes in one local/testing block; the production test now also checks `/dev/client-address` is absent). 16 primitives (Radix for Dialog/Sheet/Menu/Select only), `/dev/ui` catalogue, lazy page chunks, 32 baselines. Merged main: Pest 315, ui-test 98/98, browser 96/96.

- 2026-11-20: **Story 1.4 merged.** Global origin guard, `/api/*` out of CSRF, arch tests, `laravel-stack.mjs`, a `laravel` job in parity.yml (X-01 cells 180/180; `converted-tags.txt` empty until endpoints exist). On merge: TrustedClientAddress moved before the guard (`72909a1`). Also fixed: 1.5's invalid YAML step name (`ae8314d`). Merged main: Pest 313 passed. The arch test found Laravel's local-disk `serve` route; turned off.

- 2026-11-20: **Story 1.5 merged.** Full client-address port (7/7 Next cases, Node `isIP`/`trim` parity), `TrustProxies` removed (verified: it trusts `*` on `*.on-forge.com`), dev nginx overwrites `CF-Connecting-IP`. Merged main: Pest 238 passed, ui-test 55/55.

- 2026-11-20: Launched 1.4, 1.5 and 1.8a in parallel worktrees. CI green on GitHub (parity + portal, `afc3317`).

- 2026-11-20: `gh` is installed and authed (gericomaverick), so the parent can watch CI. First GitHub runs: `parity.yml` 10/11 green (1 J11 redirect race); `portal.yml` audit failed (no `.env`, so APP_ENV=production and the 1.3 boot validator refused). Fixed in `afc3317`; portal.yml now green (laravel-ci + audit).

- 2026-11-20: **Story 1.7 merged** (README/TestCase conflicts resolved). Tokens light/dark, no-flash theme, self-hosted Inter/Geist Mono/Sfizia (woff2), DisplayTitle, design lint. Also fixed: `@viteReactRefresh` was missing (no page had ever rendered in dev), Vite port for parallel stacks. Merged main: Pest 192, ui-test 55/55, browser 18/18. **All five parallel stories are merged.**

- 2026-11-20: **Story 1.1b merged.** `portal.yml` (laravel-ci, audit, log grep), `security:check`, digest pins. On merge: the 1.3 env scan false-positived on 1.1b's regex string; narrowed it (still catches `'x'.env()`). Per-project php image tag; `expose_php=Off`, `server_tokens off`. Merged main: Pest 190 passed. First `portal.yml` GitHub run unchecked.

- 2026-11-20: **Story 1.6 merged** (ErrorCodes conflict resolved as the union of both lists). Security headers, error envelope, `auth.json` boundary, log scrubber. Merged main: Pest 180 passed. Parity smoke is blocked until `/login` exists (Epic 4).

- 2026-11-20: Cleanup (owner OK): removed 13 Epic 0 worktrees and 26 `story/*` / `worktree-agent-*` branches, each checked with `git cherry` (0.2 and 0.6a are in main as `7079975` / `094dfd1`). Untouched: `workbench/*`, `design/*`, `logo-fountain-test`.

- 2026-11-20: **Story 1.3 merged.** Canonical origin, `RequireCanonicalOrigin` (503 `PUBLIC_SITE_URL_REQUIRED`), `EnsureAuthAvailable` (503 `AUTH_UNAVAILABLE`), production boot fails on a shared DB role, `proxy:preflight`. Merged main: Pest 126 passed. Follow-ups: 1.4 (Origin/Referer), 1.5 (full client-address table), Epic 4 (middleware order), Epic 9 (preflight in deploy), 5.1 (price IDs).

- 2026-11-20: **Story 1.2 merged.** `apps/portal/AGENTS.md` (every §5 rule, the DoD variants, how to run things), `project-context.md`, and the `bin/check-agents-guide` drift check in `bin/test`.

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
