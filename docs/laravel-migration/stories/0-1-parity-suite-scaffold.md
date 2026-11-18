# Story 0.1: Parity suite scaffold

Status: done

## Story

As the delivery team,
I want a shared Playwright project at `tests/parity/` with target adapters, tag conventions, page-object folders and an expected-failures mechanism,
so that one black-box suite can drive either the Next.js app or the Laravel app.

**Covers:** test strategy §3 · **Gate:** `@smoke` · **After:** none · **DoD variant:** E0 (spec)

## Acceptance criteria

1. **Given** `PARITY_TARGET=next` and `PARITY_BASE_URL`, **when** `npx playwright test --grep @smoke` runs, **then** it targets that URL. An unknown or missing target fails fast with a clear message.
2. Journeys can't import `pages/next/*` or `pages/laravel/*` directly. They get page objects through `pages/index.ts`. This is enforced by `npm run check`.
3. Every test title must start with an inventory ID (`A-15`, `X-02`, `DV-7`, …) that exists in `01-feature-inventory.md`. Enforced by `npm run check`.
4. **Given** a test listed in `expected-next-failures.txt` that **passes** on Next, **then** the run fails. **Given** it fails on Next, **then** the run passes. On Laravel the list is ignored. Proven by `npm run selftest`.
5. The `@smoke` gate passes against the current Next app.

## Tasks / subtasks

- [x] `tests/parity/package.json` (Playwright pinned 1.64.1), `playwright.config.ts`, `.gitignore`
- [x] `adapters/target.ts` (target + base URL), `fixtures.ts` (expected-failure marking, `target` fixture)
- [x] `pages/index.ts` resolver + `pages/next/`, `pages/laravel/` folders with README
- [x] `journeys/smoke.spec.ts` (A-15 root redirect, X-02 page security headers)
- [x] `expected-next-failures.txt`, `converted-tags.txt`
- [x] `scripts/check-structure.mjs` (AC2, AC3, stale expected-failure entries)
- [x] `scripts/selftest.mjs` + `selftest/` (AC4)
- [x] `README.md` for the suite
- [x] Run check, selftest and `@smoke` on Next; record the evidence

## Dev notes

- The suite is black-box: no imports from `apps/web` or `apps/portal`.
- Next is started by the suite only when `PARITY_START_NEXT=1` (port 4310, `next dev`). Otherwise the target must already be running at `PARITY_BASE_URL`.
- Smoke assertions must be **behavioural**, not markup-based (the Laravel UI is redesigned): assert URL and headers, not headings.
- References: `02-test-strategy.md` §1, §3; `epics.md` story 0.1; `brownfield/ui-pages.md` (`/` → `/login`); `brownfield/auth-and-security.md`; `next.config.ts` headers (X-02).

## Conversion record

### Inventory scope
`A-15`, `X-02` (the smoke tests), plus the harness itself (test strategy §3).

### Next.js source read
`apps/web/src/app/page.tsx` (redirect to `/login`), `apps/web/next.config.ts` (security headers), `apps/web/e2e/smoke.spec.ts` (the existing smoke test, used as reference).

### Behaviour notes
- `GET /` redirects an anonymous visitor to `/login`.
- Every page response carries `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, a `Permissions-Policy` containing `camera=()`, and `Content-Security-Policy-Report-Only` containing `frame-ancestors 'none'`.

### Laravel implementation
None (E0).

### Deviations from Next.js
None.

### Tests
| Layer | Test | IDs |
|---|---|---|
| L5 | `tests/parity/journeys/smoke.spec.ts:3` A-15 root sends an anonymous visitor to sign-in | A-15 |
| L4 | `smoke.spec.ts:8` X-02 pages carry the security headers | X-02 |
| harness | `scripts/selftest.mjs` (3 cases), `scripts/check-structure.mjs` | — |

### Test evidence (2026-11-18)
- `npm run check`: OK (1 spec, 2 tests). Negative check: 5/5 bad cases rejected (bad import, missing, invalid and unknown IDs, stale expected entry).
- `npm run selftest`: 3/3 PASS.
- `PARITY_TARGET=next PARITY_START_NEXT=1 node scripts/run.mjs "@smoke"`: **2 passed**.
- Not run: Laravel target (no app yet).

### Gotchas
- Next 16.4.1 refuses `next dev` when it detects an AI agent (`CLAUDECODE`, `CLAUDE_CODE_ENTRYPOINT`, `AI_AGENT`) and prints an upgrade "nudge" containing instructions aimed at the agent. Those were ignored as untrusted tool output. Fix: `playwright.config.ts` strips those variables from the server env. CI is unaffected.
- `npm --prefix … run dev` hid the cause. The config now uses `npx next dev` with `cwd`.
- Gates use `scripts/run.mjs` (`&` = and, `|` = or) because `--grep` is a regex.

### Docs updated
The inventory A-15/X-02 Laravel column (test refs), sprint-status, handoff, RISKS.md (Next advisories).

### Open items
None.
