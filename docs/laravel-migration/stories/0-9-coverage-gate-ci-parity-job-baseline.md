# Story 0.9: Coverage gate, CI parity job, baseline

**Status:** done (2026-11-19) · **DoD variant:** E0 · **Epic:** 0

## Acceptance criteria (epics.md §0.9)
1. The coverage script fails for an inventory row (not O-series) with no parity test and no recorded Laravel-only destination, and for a DV row with no `@deviation` test.
2. The CI `parity` job runs on Next. `handoff.md` records the baseline from **3 consecutive green runs**. The "Verify the baseline" commands are re-run and recorded.

## Inventory scope
None of its own (the gate covers all 108 rows and 15 DVs).

## Next.js source read
`apps/web` dev-server behaviour only (`next dev` route compilation, `block-cross-site-dev.js`). There's no feature source.

## Behaviour notes
E0: the Next behaviour pinned here is operational:
- `next dev` compiles each route on first hit and can drop a connection while it does (A-15 flake). `scripts/next-stack.mjs` warms the routes up first.
- `next dev` can still reset a connection mid-run (`ECONNRESET`), seen once in 2,181 test executions (baseline run set 4, J10).
- Polling pages (status, concepts) never reach `networkidle`.
- Next re-signs concept image URLs on every poll (F-15).

## Laravel implementation
None (E0).

## What was built
| Piece | Where |
|---|---|
| Coverage gate (strict: a DV id must appear in a test title; Laravel-only destinations listed) | `tests/parity/scripts/coverage.mjs`, `fixtures/laravel-only-destinations.json` (`d1e7b0b`, `9bcc0ac`) |
| One-command Next runner: migrate → `next dev` on 127.0.0.1:4310 → webhook forwarder :4311 → stripe-fake `/__config` → warm-up → `--repeat N` | `tests/parity/scripts/next-stack.mjs` (`44f7049`) |
| CI job: apps/web unit tests, check/selftest/coverage, stack up and probe, suite (non-disruptive), then `@disruptive` serially | `.github/workflows/parity.yml` |
| J17 tagged `@disruptive` (it stops SeaweedFS), run alone with `--workers=1` | `9d4e22a` |

## Fixes found by the full runs
| Symptom | Cause | Fix |
|---|---|---|
| Exclusive tests starved; 600 s lock timeout | Unfair lock | FIFO ticket queue, 30 min `PARITY_LOCK_TIMEOUT_MS` (`e5a34a7`) |
| 10 purchases "never fulfilled" | `spawnSync` blocked the event loop of the in-process webhook forwarder; every stripe-fake delivery timed out at 30 s | Async `spawn` (`db9801f`) |
| J11 and J19 hung for 180 s | Unbounded `networkidle` waits on polling pages | Bounded to 10 s everywhere (`db9801f`) |
| J4 image not found (1) | F-15 re-signing changes the query string | Match by object path (`db9801f`) |
| 9 tail tests: `dbLease` fixture timeout | The 660 s fixture cap was shorter than the lock queue | Fixture timeout = lock timeout + 60 s (`6178dea`) |
| 9 tail tests: "timed out waiting for shared DB holders" (runs took 41 min) | An idle worker kept its file-scoped shared lease and never moved to another file | Fixture shared leases per test; `beforeAll` file leases released in `afterAll` (`bed6ea2`); runs now take about 12 min |
| J4 image not found (2) | The gallery thumbnail fetched the object first, and the concept view used the browser cache | Record responses before the gallery opens (`ddd85fd`, 5/5) |
| J13 alert read after the poll cleared it | Race | Read the message from the response (`e5a34a7`) |

## Test evidence
- `npm run check`: 59 specs, 266 tests, 32 expected Next failures. `npm run coverage`: 108/108 rows, 15/15 DVs, 21 Laravel-only destinations.
- Run set 4, after all fixes: full suite **727 / 727 / 726 passed** (1 skipped each, 12.0–12.3 min). The run-3 failure was J10 `ECONNRESET` from `next dev`. `@disruptive` ×3: **1/1/1 passed**.
- **Run set 5, the baseline (AC 2): 727 / 727 / 727 passed, 1 skipped each, 12.0–12.3 min, 0 unexpected failures.**
- "Verify the baseline" re-run: apps/web typecheck ✓ (after fixing `src/lib/__tests__/parity-seed-guard.test.ts` typing from 0.4), lint ✓, unit tests 107 files / 1013 passed / 20 skipped.
- Expected failures: the 32 `@deviation` tests failed as expected on Next in every run. Playwright reports them as passed (`test.fail`).

**Not run, and why:** `@stripe-live-test` (owner-run, needs the owner's Stripe test key). CI on GitHub: not yet run. `.github/workflows/parity.yml` is written but not committed, pending the owner's OK to push (the first push runs the suite on Actions).

## Gotchas
- Keep test-runner helpers non-blocking: the forwarder shares the runner's process.
- File-scoped DB leases must be released explicitly, because an idle worker never "moves on".
- Retries stay at 0 (`playwright.config.ts:25`), so that flakes stay visible.

## Docs updated
handoff (baseline table plus session log) · sprint-status · this record.

## Open items
- If `next dev` `ECONNRESET`s recur in CI, consider `next build && next start` for the Next target (owner: parent, Epic 1 CI work in 1.1b).
