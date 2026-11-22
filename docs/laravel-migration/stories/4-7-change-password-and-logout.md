# Story 4.7: Change password and logout

**Status:** ready-for-dev (created from `origin/main` 03a12b4) · **DoD variant:** Laravel-only · **Epic:** 4 · **Covers:** A-02, A-09, FR5, FR6 · **Gate:** `@auth&@api`, `@settings&@api` · **After:** 4.3 · **Stacks on:** `main` (dependencies done); in the SERIAL chain, the previous Epic 4 story's branch. Shared files: `routes/auth.php`, `PasswordRules`, `CredentialFence`, `Controllers/Auth/`

> Created with the repo's create-story form. All `apps/web` `file:line` checked 2026-11-22.

## Story
As a signed-in person, I can change my password (which signs me out everywhere) and sign out, and I'm told the truth about whether it worked.

## Acceptance criteria
1. **Logout `POST /api/auth/logout`.** Origin guard first, then the proxy check, then sign-out (`logout/route.ts:6-8`). Success → `200 {ok:true}` and a clearing `Set-Cookie`. Failure → `503 {error:{code:"LOGOUT_FAILED",message:"Could not sign out. Please retry."}}` (`:14`). Logout with no session is `200 {ok:true}` (recommended behaviour; open question 1 only asks for confirmation).
2. **Confirmed.** After logout, `GET /api/auth/session` returns `{authenticated:false}` (contract `auth-session.spec.ts:81`; client helper `lib/auth/logout.ts:2-12`, ported in 4.9b).
3. **Change `POST /api/auth/password {currentPassword,newPassword}`.** Anonymous → `401 UNAUTHORIZED` before the limiter (`password/route.ts:9-10`; `route.test.ts:32`).
4. **Limit** `consumeAuth(path, address, userId)`; sixth attempt → `429 {error:{code:"RATE_LIMITED"}}` (contract `auth-session.spec.ts:100`).
5. **Validation.** Empty current, new == current, or a new password failing the rules → `400 INVALID_PASSWORD_CHANGE` (`service.ts:103`). Wrong current → `400 CURRENT_PASSWORD_INVALID` (`:112`), distinct from the invalid-change code because the caller is authenticated.
6. **Under the fence, original session re-read** and compared (same session id, verified mailbox, inside the 7-day cap; `service.ts:106-109`), else `401 UNAUTHORIZED`.
7. **Effects.** New hash; **all** sessions deleted including the current; all proofs deleted; `credential_version + 1`; audit `auth.password_changed` payload `{method:"settings"}` (`:116-119`).
8. **Response.** `200 {ok:true,signedOut:true}` with a clearing cookie; a request with the old cookie afterwards is anonymous (contract `:123`).
9. **Wrapper** (Origin, JSON, 8 KB) is the common pipeline from 1.6.

## Inventory scope
A-02, A-09. Ledger `logout/route.test.ts` (2), `password/route.test.ts` (4), `validation.test.ts` change cases, #66 case 6 (change half).

## Next.js source read
`app/api/auth/logout/route.ts:5-15`; `app/api/auth/password/route.ts:7-16`; `lib/auth/service.ts:102-121`; `lib/auth/logout.ts:2-12`; `lib/auth/validation.ts:62-87`; contract `auth-session.spec.ts:81-138`.

## Behaviour notes
- Next's `signOut` deletes only the current session; the password path deletes the rest explicitly.
- The change rate limit is per user id, not per address.

## Laravel guidance
`app/Actions/Auth/ChangePassword.php`, `Logout` action, controllers. Use `Auth::logout()` + `session()->invalidate()` for the current session and a `DELETE FROM sessions WHERE user_id` for the rest.

## Planned deviations from Next.js
None.

## Tasks
1. Logout. 2. ChangePassword. 3. Tests. 4. Record, inventory, ledger, sprint-status.

## Test plan
| Layer | Test | Covers |
|---|---|---|
| L2 `@auth&@api` | `tests/Feature/Auth/LogoutTest.php`: AC 1, 2, 9 | A-02 |
| L2 `@auth&@settings&@api` | `ChangePasswordTest.php`: AC 3–8 | A-09 |
| L3 `@pg-race` | reset/change race (shared with 4.2) | A-10 |
| L4 parity | `contract/auth-session.spec.ts:81,94,100,123` | A-02, A-09 |

## Definition of done (Laravel-only, `epics.md:35`)
`bin/test` green (Pint, Larastan level 9, Pest) with the tests below; the Conversion record filled; inventory Laravel/Tests columns, ledger rows, `sprint-status.yaml` → `review`, and one line each in DECISIONS / RISKS / ASSUMPTIONS where something was decided. No `apps/web` change. L4/L5 parity is run by the gate named in the header only where the story says so.

## Open questions (with recommendations)
1. **Logout with no session.** Next's `signOut` on no cookie returns ok. *Recommendation:* `200 {ok:true}`; confirm on L4.
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
