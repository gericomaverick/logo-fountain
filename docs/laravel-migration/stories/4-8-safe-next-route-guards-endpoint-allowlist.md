# Story 4.8: Safe-next, route guards, endpoint allowlist

**Status:** review (created from `origin/main` 03a12b4) · **DoD variant:** Laravel-only · **Epic:** 4 · **Covers:** A-13, A-14, A-15, A-16 · **Gate:** `@authz&@api` (auth part), `@unit` · **After:** 4.1, 0.6b (done) · **Stacks on:** `main` (dependencies done); in the SERIAL chain, the previous Epic 4 story's branch. Shared files: `app/Support/Auth/SafeNext.php`, `routes/auth.php`, `routes/web.php`, `tests/Arch/AuthTest.php`, `tests/Fixtures`

> Created with the repo's create-story form. All `apps/web` `file:line` checked 2026-11-22.

## Story
As the portal, I only ever redirect to my own paths, I only expose the documented auth routes, and a visitor with no session is sent to sign in.

## Acceptance criteria
1. **`SafeNext::path(?string $raw, string $fallback='/dashboard')`** ports `safe-next.ts:22-42` exactly, passing every case in `tests/parity/fixtures/rules/safe-next.json` (0.6b). `/%2f%2fevil.com`, `//x`, `/\x`, control chars, double-encoded `%252f`, and non-slash starts → `/dashboard`; query and fragment survive on accepted paths; the original, not the decoded, value is returned.
2. **Used everywhere.** 4.4's links and 4.9b's pages call it; a grep test fails on a redirect built from `request('next')` without it.
3. **Endpoint allowlist (A-14).** `route:list` auth routes equal exactly: `GET session`, `POST login|logout|password|magic-link|magic-link/verify|forgot-password|reset-password`. No register, OAuth, Fortify, remember-me or password-confirm routes. An arch/feature test snapshots the list.
4. **No native-auth leftover (A-15).** No route under `/api/auth/native` exists (Next's Better Auth catch-all is not carried; `server.ts:34` basePath) — a request there is 404.
5. **Route guards (A-16).** An unauthenticated request to a page behind auth redirects to `/login?next=<SafeNext>`; `/` redirects to `/login` (`app/page.tsx:3-5`). A signed-in non-admin to an admin path gets 403/redirect as the authz table says (`_authz-table.ts`; matrix owned by Epic 5+/10; here the middleware aliases `auth.verified`, `admin` are defined and unit-tested).
6. **Roles from the DB** on each request (A-04), never from the session payload.
7. **Responses** to guarded API routes: 401 `UNAUTHORIZED`/403 `FORBIDDEN` in the shared error shape with `nextStep` (`require.ts:33,43`).

## Inventory scope
A-13, A-14, A-15, A-16. Ledger `safe-next.test.ts` (2 cases + fixtures), `authz` rows touching the auth part.

## Next.js source read
`lib/auth/safe-next.ts:1-42`; `app/page.tsx:3-5`; `lib/auth/require.ts:29-47`; `lib/auth/admin.ts`; `lib/auth/server.ts:34`; brownfield §5, §7.

## Behaviour notes
- Next gates pages in each page's server component/proxy; Laravel gates with route middleware, a reviewable single place.
- `next` is validated at issue time (4.4) and again at redirect time (client), both with this function.

## Laravel guidance
`SafeNext` is pure PHP; middleware `RequireVerifiedUser`, `RequireAdmin` in `bootstrap/app.php` aliases. The fixture is the single source of truth for both stacks.

## Planned deviations from Next.js
None.

## Tasks
1. `SafeNext` + fixture test. 2. Middleware + redirects. 3. Route-list snapshot + arch test. 4. Record, inventory, ledger, sprint-status.

## Test plan
| Layer | Test | Covers |
|---|---|---|
| L1 `@unit` | `tests/Unit/Support/Auth/SafeNextTest.php` driven by `safe-next.json` | A-13 |
| L2 `@authz&@api` | `tests/Feature/Auth/RouteGuardTest.php`: AC 5–7 | A-16 |
| Arch | `tests/Arch/AuthTest.php`: route allowlist, no native-auth route | A-14, A-15 |

## Definition of done (Laravel-only, `epics.md:35`)
`bin/test` green (Pint, Larastan level 9, Pest) with the tests below; the Conversion record filled; inventory Laravel/Tests columns, ledger rows, `sprint-status.yaml` → `review`, and one line each in DECISIONS / RISKS / ASSUMPTIONS where something was decided. No `apps/web` change. L4/L5 parity is run by the gate named in the header only where the story says so.

## Open questions (with recommendations)
1. **Guard for pages not yet built.** *Recommendation:* guard the `/dashboard` placeholder only; later epics attach middleware to their own routes.
2. **Owner items: none.**

## Conversion record

> Fill at implementation, from `templates/story-conversion-record.md`. Write *Behaviour notes* before converting.

### Inventory scope
_(stub)_
### Next.js source read
_(stub)_
### Behaviour notes
_(stub)_
### Laravel implementation
_(stub)_
### Deviations from Next.js
| Behaviour | Next.js | Laravel | Why | Decision ref |
|---|---|---|---|---|
### Tests
| Layer | Test file / title | Inventory IDs |
|---|---|---|
### Test evidence
_(commands, pass/fail counts, what was not run and why)_
### Gotchas
### Docs updated
### Open items

**L4 parity run (2026-11-23, workbench/parity-4-5):** @auth 37 tests: Next 37 pass; Laravel 15 pass / 11 fail / 11 not reached. @checkout 28: Next 28 pass; Laravel 1 / 20 / 7. @entitlements 10: Next 10 pass; Laravel 0 / 10 / 0. Failures are the unwired Stripe/Postmark/Mailpit infra on the Laravel stack and not-yet-built pages/routes, listed with titles in `docs/laravel-migration/parity-run-2026-11-23.md`. This story's parity tests are not shown to match: stays at `review`.
