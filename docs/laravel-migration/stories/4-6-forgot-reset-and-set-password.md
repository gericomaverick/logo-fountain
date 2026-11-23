# Story 4.6: Forgot, reset and set password

**Status:** done (created from `origin/main` 03a12b4) · **DoD variant:** Laravel-only · **Epic:** 4 · **Covers:** A-07, A-08, FR3, FR4 · **Gate:** `@auth&@api` (forgot, reset) · **After:** 4.4 · **Stacks on:** `main` (dependencies done); in the SERIAL chain, the previous Epic 4 story's branch. Shared files: `routes/auth.php`, `app/Actions/Auth/`, `AuthProofs`, `CredentialFence`, `app/Support/Auth/PasswordRules.php`

> Created with the repo's create-story form. All `apps/web` `file:line` checked 2026-11-22.

## Story
As someone with a reset or setup link, I choose a new password and I'm told to sign in; a used or stale link does nothing.

## Acceptance criteria
1. **`POST /api/auth/reset-password {token,newPassword}`** serves both reset and setup links (`reset-password/route.ts:7`; `set-password` page posts here too, `set-password/page.tsx:40`). Success → `200 {ok:true}`, **no session, no cookie**.
2. **Password rules** (`validation.ts:30-43`, `service.ts:75`): 8 to 72 **bytes**; a failing password → `400 {error:{code:"WEAK_PASSWORD"}}` (the `AuthFailure(400,"WEAK_PASSWORD")` shape, message generic) before the proof is read.
3. **Limit** by token via `consumeAuth`; denied → `429 RATE_LIMITED` (`:6`).
4. **Under the fence** (`service.ts:77-87`): kind ∈ {reset, setup}, unexpired, version matches, else generic failure. Then: set the hash, `email_verified_at = now` if null, `credential_version + 1`, delete **all** proofs of the user, delete **all** sessions, write audit `auth.password_reset` with payload `{method: <proof kind>}`.
5. **All or nothing.** A forced failure after the password write rolls back the password, the proof deletion and the session deletion (`integration.test.ts:122`). Seam: an injectable step in the action.
6. **Setup may create a first credential only.** (Re-checked at request time in 4.4; here a setup proof used after a password exists still works only if its version matches, which it won't after any transition.)
7. **Reset/change race and reset/reset** covered in 4.2's L3; this story adds the same-token replay: second use fails.
8. **Forgot (request) is 4.4**; this story adds the rule that a reset for an account with no password is allowed and behaves as a setup of the credential (`service.ts:36-39`).
9. **Audit and logs.** The audit payload and logs carry no token or password.

## Inventory scope
A-07 (reset), A-08 (set), A-06 consumption half. Ledger `reset-password/route.test.ts` (3), `validation.test.ts` (password cases, 3 of 6 here, rest in 4.7), #66 cases 2, 4, 7.

## Next.js source read
`app/api/auth/reset-password/route.ts:4-10`; `lib/auth/service.ts:74-88`; `lib/auth/validation.ts:30-60`; `app/reset-password/page.tsx:29-48`; `app/set-password/page.tsx:29-48`; `integration.test.ts:60,89,122`.

## Behaviour notes
- Next's native reset also revokes sessions (`revokeSessionsOnPasswordReset`), repeated explicitly at `service.ts:85`.
- Next does not sign the user in after a reset; the pages redirect to `/login?password=updated`.
- Confirm-password matching is a client-side rule (`validation.ts:45`); the server doesn't see `confirm`.

## Laravel guidance
`app/Actions/Auth/ResetPassword.php`, `PasswordRules` shared with 4.7 (byte length, not `Str::length`). Audit through `Audit::record` (2.4).

## Planned deviations from Next.js
None. (Next's `WEAK_PASSWORD` code appears only in the thrown error; confirm the exact JSON with the L4 run, open question 1.)

## Tasks
1. `PasswordRules`. 2. `ResetPassword` action + controller/route. 3. Tests incl. rollback seam. 4. Record, inventory, ledger, sprint-status.

## Test plan
| Layer | Test | Covers |
|---|---|---|
| L1 | `tests/Unit/Support/Auth/PasswordRulesTest.php`: 7/8/72/73 bytes, multibyte | A-07 |
| L2 `@auth&@api` | `tests/Feature/Auth/ResetPasswordTest.php`: AC 1–4, 6, 7, 9 | A-07, A-08 |
| L3 `@pg-race` | `tests/Concurrency/ResetRollbackTest.php` (AC 5) | #66 case 7 |
| L4 parity | `contract/auth-links.spec.ts` (reset) | A-07, A-08 |

## Definition of done (Laravel-only, `epics.md:35`)
`bin/test` green (Pint, Larastan level 9, Pest) with the tests below; the Conversion record filled; inventory Laravel/Tests columns, ledger rows, `sprint-status.yaml` → `review`, and one line each in DECISIONS / RISKS / ASSUMPTIONS where something was decided. No `apps/web` change. L4/L5 parity is run by the gate named in the header only where the story says so.

## Open questions (with recommendations)
1. **Exact WEAK_PASSWORD body.** Next's wrapper maps `AuthFailure` to `{error:{code,message:generic}}` (`http.ts:42`). *Recommendation:* same; confirm against the contract suite.
2. **Owner items: none.**

**Decided (owner, 2026-11-23):** Q (generic message in the WEAK_PASSWORD body) as built.

## Conversion record

### Inventory scope
A-08 (reset, set), A-07 consumption half, A-06 consumption half. Ledger reset-password/route.test.ts (3), validation.test.ts password cases, #66 cases 2, 4, 7.
### Next.js source read
`reset-password/route.ts`, `lib/auth/service.ts:74-88`, `lib/auth/validation.ts:30-43`, `integration.test.ts:108-125`.
### Behaviour notes
Order: rate limit by token, then WEAK_PASSWORD (before any proof read), then one fence: kind reset or setup, unexpired, version matches; set hash, verify mailbox, version+1, delete all proofs and sessions, audit `auth.password_reset {method}`. No session, no cookie even on success. Min length counts UTF-16 units as JS does; max is 72 bytes.
### Laravel implementation
`app/Actions/Auth/ResetPassword.php`, `PasswordResetController`, `app/Support/Auth/PasswordRules.php`, `ErrorCodes::WEAK_PASSWORD`, route in `routes/auth.php`; `OmitSessionCookieOnFailure` takes a `:always` argument for this route.
### Deviations from Next.js
| Behaviour | Next.js | Laravel | Why | Decision ref |
|---|---|---|---|---|
| None | | | | |
### Tests
| Layer | Test file / title | Inventory IDs |
|---|---|---|
| L1 | `tests/Unit/Support/Auth/PasswordRulesTest.php` | A-07 |
| L2 | `tests/Feature/Auth/ResetPasswordTest.php` | A-07, A-08 |
| L3 `@pg-race` | `tests/Concurrency/ResetRollbackTest.php` (#66 case 7: audit trigger fault rolls back password, proof, sessions) | A-08 |
### Test evidence
`bin/test` green: Pint, Larastan 9, Pest 1822 passed (5130 assertions), after renaming test-file global constants that collided with `AuthJsonBoundaryTest`; `tests/Feature/Auth` + ResetRollbackTest 120 passed before it. L4 parity not run.
### Gotchas
`audit_events.actor_id` has an FK to `profiles`, so tests need a Profile row. Pest global helper names must not collide with PHP built-ins (`reset`). Laravel adds the session cookie to every response, hence the `:always` omit.
### Docs updated
Inventory A-08, ledger #29, #66, #72, DECISIONS, sprint-status.
### Open items
Q1 built as recommended (generic message in the WEAK_PASSWORD body), decided (owner, 2026-11-23); exact JSON to confirm against L4. Confirm-password stays client-side.

**L4 parity run (2026-11-23, workbench/parity-4-5):** @auth 37 tests: Next 37 pass; Laravel 15 pass / 11 fail / 11 not reached. @checkout 28: Next 28 pass; Laravel 1 / 20 / 7. @entitlements 10: Next 10 pass; Laravel 0 / 10 / 0. Failures are the unwired Stripe/Postmark/Mailpit infra on the Laravel stack and not-yet-built pages/routes, listed with titles in `docs/laravel-migration/parity-run-2026-11-23.md`. This story's parity tests are not shown to match: stays at `review`.
