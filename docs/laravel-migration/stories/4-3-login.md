# Story 4.3: Login

**Status:** ready-for-dev (created from `origin/main` 03a12b4) · **DoD variant:** Laravel-only · **Epic:** 4 · **Covers:** A-01, FR1 · **Gate:** `@auth&@api` (login) · **After:** 4.1, 4.2, 2.5 (done) · **Stacks on:** `main` (all listed dependencies are done); in the SERIAL chain it builds on the previous Epic 4 story's branch.

> Created with the repo's create-story form. All `apps/web` `file:line` checked 2026-11-22.

## Story
As a client or admin, I sign in with my email and password, and every kind of failure looks the same, so nobody can learn which accounts exist.

## Acceptance criteria
1. **Success.** `POST /api/auth/login {email,password}` with a verified account and the right password returns `200 {ok:true}`, issues a session through 4.1's `IssueSession` (id regenerated, `issued_at` set) and sets the cookie (`login/route.ts:18`).
2. **One failure.** Wrong password, unknown account, account with no password, unverified mailbox, and rate-limited all return **byte-identical** `400 {error:{code:"INVALID_CREDENTIALS",message:"Email or password is incorrect, or mailbox verification is required."}}` with no `Set-Cookie` (`:6,11,14,16`; contract `auth-session.spec.ts:40`).
3. **Pre-checks.** Email is trimmed and lowercased; an empty email, an empty password or a password over **72 bytes** returns the same 400 before any limiter work (`:9-11`).
4. **Limiter.** Reserved **before** the password check with `RateLimits::reserveLogin(address, email)`: address bucket 20 per 15 min (only with a trusted address) and failure bucket 5 keyed `login:failures:{email}:{address|unknown-address}`; on success `clearLoginFailures` (`rate-limit.ts:46-54`; `RateLimits` from 2.5). The sixth attempt after five failures gets the same 400 even with the right password; a limited attempt **skips the password check** (`route.test.ts:42`).
5. **Fence.** When the user exists, the password check and session creation run under `CredentialFence` (`service.ts:66`), so a login can't interleave with a change/reset (4.2's login/reset race).
6. **Production fail-closed.** No trusted client address → `503 AUTH_UNAVAILABLE` **before** the failure bucket is reserved (`route.test.ts:51`, already `EnsureAuthAvailable`).
7. **Ordering.** Proxy check, Origin guard, JSON boundary, then the body, as Next's wrapper (`http.ts:18-43`; already built in 1.3/1.6; this story adds a test that login uses them).
8. **No remember-me, no registration, no `/register` route.**
9. **Timing (proposed DV-19, pending owner):** an unknown, unverified or password-less account costs one hash comparison against a fixed dummy hash, so response time doesn't reveal existence. Build it; owner may veto. (Next behaviour unverified; see Deviations.)

## Inventory scope
A-01. Ledger #24 (`login/route.test.ts`, 10 tests: those about origin/wrapper are covered by 1.3/1.4/1.6 and re-asserted here for the login route), #66 case 11, #56 (`auth-shell.test.ts`, Keep TS) untouched.

## Next.js source read
`apps/web/src/app/api/auth/login/route.ts:7-20`; `lib/auth/service.ts:62-67`; `lib/auth/rate-limit.ts:5-54`; `lib/auth/http.ts`; `lib/auth/validation.ts:20-28,33`; brownfield §4, §8, §9; `integration.test.ts:196`; contract `auth-session.spec.ts:26-80`.

## Behaviour notes
- Next runs the password check unfenced when the user doesn't exist (`service.ts:66`) — that cheap path is the timing gap in AC 9. Better Auth also refuses unverified mailboxes at sign-in (`requireEmailVerification`, `server.ts:44`): Laravel must check `email_verified_at` itself.
- The per-email bucket counts **failures only**; the address bucket counts every attempt.
- Password max 72 bytes matches bcrypt's limit; use bcrypt (`config/hashing.php`) so no silent truncation.

## Laravel guidance
`app/Actions/Auth/Login.php` (plain class, no HTTP), `app/Http/Controllers/Auth/LoginController.php`, route in `routes/auth.php`. No Fortify/Breeze/Jetstream (A-14). Hashing via `Hash::check` with a pre-computed dummy hash constant.

## Planned deviations from Next.js
**Proposed DV-19** (login timing equalised). Laravel guarantees one hash comparison for every login attempt. Next is unverified: `service.ts:62-66` falls through to Better Auth `signInEmail` (`:65`), whose unknown-user behaviour is unproven (library not installed in apps/web/node_modules). `@deviation` test: with an unknown email, the hasher is called exactly once (a spy). Asserts Laravel only; no claim about Next. Needs the owner's ruling (§8 of the brief); build it meanwhile, behind no flag.

## Tasks
1. `Login` action (AC 1–5, 9). 2. Controller + route (AC 6, 7). 3. Tests; contract-shaped Pest HTTP tests for each failure arm. 4. Record, inventory A-01, ledger #24/#66 case 11, sprint-status.

## Test plan
| Layer | Test | Covers |
|---|---|---|
| L2 `@auth&@api` | `tests/Feature/Auth/LoginTest.php`: AC 1–3 (dataset of five failure arms compared byte for byte), 6, 7, 8 | A-01, #24 |
| L2 | `LoginRateLimitTest.php`: reserve-before-check, clear on success, limited attempt skips hashing, spoofed XFF doesn't change the key | A-01, #66 case 11 |
| L3 `@pg-race` | login/reset race lives in 4.2; here one test that login takes the fence | A-10 |
| L1 `@deviation` | `LoginTimingTest.php` (AC 9) | DV-19 (proposed) |
| L4 parity | `contract/auth-session.spec.ts:26-80` | A-01 |

## Definition of done (Laravel-only, `epics.md:35`)
`bin/test` green (Pint, Larastan level 9, Pest) with the tests below; the Conversion record filled; inventory Laravel/Tests columns, ledger rows, `sprint-status.yaml` → `review`, and one line each in DECISIONS / RISKS / ASSUMPTIONS where something was decided. No `apps/web` change. L4/L5 parity is run by the gate named in the header only where the story says so.

## Dependencies and follow-ups
Shares with 4.1: `routes/auth.php`, `IssueSession`, `SessionCap`; with 4.2: `CredentialFence`. 4.7 reuses the controller namespace.

## Open questions (with recommendations)
1. **DV-19 (login timing).** *Recommendation:* approve.
2. **Rehash on login if the cost changes.** Not in Next. *Recommendation:* skip.
3. **Owner items:** DV-19 only.

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
