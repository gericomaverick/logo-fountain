# Story 4.5: Magic-link confirm

**Status:** ready-for-dev (created from `origin/main` 03a12b4) · **DoD variant:** Laravel-only · **Epic:** 4 · **Covers:** A-05, A-18, FR2 · **Gate:** `@auth&@api` (verify) · **After:** 4.4 · **Stacks on:** `main` (dependencies done); in the SERIAL chain, the previous Epic 4 story's branch. Shared files: `routes/auth.php`, `IssueSession`, `AuthProofs`

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
