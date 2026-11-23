# Story 4.5: Magic-link confirm

**Status:** done (created from `origin/main` 03a12b4) · **DoD variant:** Laravel-only · **Epic:** 4 · **Covers:** A-05, A-18, FR2 · **Gate:** `@auth&@api` (verify) · **After:** 4.4 · **Stacks on:** `main` (dependencies done); in the SERIAL chain, the previous Epic 4 story's branch. Shared files: `routes/auth.php`, `IssueSession`, `AuthProofs`

> Created with the repo's create-story form. All `apps/web` `file:line` checked 2026-11-22.

## Story
As someone who clicked a sign-in link, I press one button to sign in, so mail scanners that open links can't use it up.

## Acceptance criteria
1. **`POST /api/auth/magic-link/verify {token}`.** Valid proof → `200 {ok:true}`, a session issued via `IssueSession` (cookie set), proof deleted (`verify/route.ts:7`, `service.ts:98`). Destination is decided client-side; the server returns no URL.
2. **Nothing consumed by GET.** `GET /auth/callback` renders the confirm page and touches no proof (A-18; `app/auth/callback/page.tsx:25`). Test: a GET with a valid fragment-less URL leaves the proof row.
3. **Shape first.** A token not matching `/^[A-Za-z0-9_-]{20,256}$/` → generic failure before any DB read (`service.ts:69`).
4. **Single use.** The second confirm of the same token fails; under 10 parallel confirms exactly one succeeds (`integration.test.ts:79`; L3).
5. **Validity.** Kind must be `magic`; unexpired; `credential_version` equal to the user's now. A setup/reset token presented here fails (`service.ts:94`).
6. **Marks the mailbox verified.** Success sets `email_verified_at` if null, but a magic sign-in never counts as first-password proof (`integration.test.ts:79`): the user still has no password afterwards.
7. **Limit.** `consumeAuth(path, address, token)` first; denied → `429 {error:{code:"RATE_LIMITED"}}` (`:6`).
8. **Failure.** Any other failure → the generic `AUTH_FAILED` 400 with no cookie (`http.ts:42`).
9. **Runs under the fence** (`service.ts:91`) and regenerates the session id.

## Inventory scope
A-05 (confirm half), A-18. Ledger `verify/route.test.ts` (3), #66 case 3.

## Next.js source read
`app/api/auth/magic-link/verify/route.ts:4-9`; `lib/auth/service.ts:68-73,89-101`; `app/auth/callback/page.tsx:8-30`; `lib/auth/client.ts:6-13`; `integration.test.ts:79`; brownfield §2.

## Behaviour notes
- Next checks `Location` and `Set-Cookie` from Better Auth to detect success; Laravel simply issues the session in the same transaction.
- Verifying marks `emailVerified` through Better Auth's magic-link plugin (not in the service code): confirmed by `integration.test.ts:79`.

## Laravel guidance
`app/Actions/Auth/ConfirmMagicLink.php`, `Auth/MagicLinkController@verify`. The callback page is 4.9b; here a placeholder route returns the Inertia component name only if 4.9b is not yet built (no, don't add one: GET `/auth/callback` is owned by 4.9b; test AC 2 at the controller level).

## Planned deviations from Next.js
None.

## Tasks
1. Action + controller + route. 2. L2 and L3 tests. 3. Record, inventory, ledger, sprint-status.

## Test plan
| Layer | Test | Covers |
|---|---|---|
| L2 `@auth&@api` | `tests/Feature/Auth/MagicLinkVerifyTest.php`: AC 1, 3, 5–9 | A-05 |
| L3 `@pg-race` | `tests/Concurrency/MagicLinkSingleUseTest.php`: AC 4 | A-05, #66 case 3 |
| L4 parity | `contract/auth-links.spec.ts` (verify) | A-05, A-18 |

## Definition of done (Laravel-only, `epics.md:35`)
`bin/test` green (Pint, Larastan level 9, Pest) with the tests below; the Conversion record filled; inventory Laravel/Tests columns, ledger rows, `sprint-status.yaml` → `review`, and one line each in DECISIONS / RISKS / ASSUMPTIONS where something was decided. No `apps/web` change. L4/L5 parity is run by the gate named in the header only where the story says so.

## Open questions (with recommendations)
1. **Where does a failed confirm send the person?** Client side only (4.9b shows "request a fresh link"). *Recommendation:* no server redirect.
2. **Owner items: none.**

## Conversion record

### Inventory scope
A-05 (confirm half), A-18 (server half: no GET consumes). Ledger `verify/route.test.ts` (3), #66 case 3.
### Next.js source read
`magic-link/verify/route.ts:4-9`, `lib/auth/service.ts:68-101`, `app/auth/callback/page.tsx`, `integration.test.ts:79`.
### Behaviour notes
Rate limit first (`consumeAuth(path, address, token)`), then shape (no DB), then one fence: validate kind `magic`/expiry/version, delete proof, set `email_verified_at` if null, `IssueSession`. Any failure is generic `AUTH_FAILED` 400 with the session cookie omitted. No password is set, so a magic sign-in is not first-password proof. No server redirect (Q1).
### Laravel implementation
`app/Actions/Auth/ConfirmMagicLink.php`, `app/Http/Controllers/Auth/MagicLinkController.php` (verify), route in `routes/auth.php` (same middleware as login/4.4). Race child mode `confirm` in `tests/Concurrency/Children/race.php` runs the real action.
### Deviations from Next.js
| Behaviour | Next.js | Laravel | Why | Decision ref |
|---|---|---|---|---|
| None | | | | |
### Tests
| Layer | Test file / title | Inventory IDs |
|---|---|---|
| L2 | `tests/Feature/Auth/MagicLinkVerifyTest.php` (AC 1-3, 5-9) | A-05, A-18 |
| L3 `@pg-race` | `tests/Concurrency/MagicLinkSingleUseTest.php` (AC 4, #66 case 3) | A-05 |
### Test evidence
`bin/test` once: Pint + Larastan 9 green; Pest 1793 passed, 1 failed (4.5 run; at 4.6 the full run is 1822 passed, 5130 assertions) (route-list assertion in `SessionEndpointTest`, my route not listed): fixed, that file + MagicLinkVerifyTest re-run 22 passed; Pint re-run clean. Not run: full suite again, L4 parity contract. AC 2 is proven only as 'no GET route consumes' (GET `/auth/callback` is 4.9b), so the GET test asserts the proof row survives a GET to that path.
### Gotchas
A failed request still writes an anonymous session row (cookie omitted): assert `user_id IS NOT NULL` rows, not the table count. The route-list test in `SessionEndpointTest` must list each new auth route.
### Docs updated
Inventory A-05/A-18, ledger #27 and #66, DECISIONS, sprint-status.
### Open items
Built as recommended (Q1: no server redirect), decided (owner, 2026-11-23). Destination/failed-link page is 4.9b. L4 parity not run.

**L4 parity run (2026-11-23, workbench/parity-4-5):** @auth 37 tests: Next 37 pass; Laravel 15 pass / 11 fail / 11 not reached. @checkout 28: Next 28 pass; Laravel 1 / 20 / 7. @entitlements 10: Next 10 pass; Laravel 0 / 10 / 0. Failures are the unwired Stripe/Postmark/Mailpit infra on the Laravel stack and not-yet-built pages/routes, listed with titles in `docs/laravel-migration/parity-run-2026-11-23.md`. This story's parity tests are not shown to match: stays at `review`.
