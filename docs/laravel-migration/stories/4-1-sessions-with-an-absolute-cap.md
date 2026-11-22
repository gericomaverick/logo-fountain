# Story 4.1: Sessions with an absolute cap

**Status:** ready-for-dev (created from `origin/main` 03a12b4) · **DoD variant:** Laravel-only · **Epic:** 4 · **Covers:** A-03, A-04, ADR-005, FR7 · **Gate:** `@auth&@api` (session endpoint) · **After:** 1.6 (done), 2.1 (done) · **Stacks on:** `main`. **First of the SERIAL chain 4.1 → 4.2 → 4.3 → 4.4 → 4.5 → 4.6 → 4.7 → 4.8 → 4.9a → 4.9b (see `epic-4-build-order` at the end of this file).** 4.1 creates the auth route file, the auth controller namespace and the session middleware that every later story reuses.

> Created with the repo's create-story form. Sources: `epics.md:294-298`, `brownfield/auth-and-security.md` §1 and §4 (session row), ADR-005, inventory A-03/A-04 (`01-feature-inventory.md:20-21`), ledger #30 (`route.test.ts`, 3 tests), contract `tests/parity/journeys/contract/auth-session.spec.ts:18-38`. All `apps/web` `file:line` checked 2026-11-22.

## Story
As a signed-in person, I need my session to end exactly seven days after I signed in, however active I am, so a stolen cookie can't live on.

## Acceptance criteria
1. **Valid session.** `GET /api/auth/session` with a live session whose user has a verified email returns `{authenticated:true,userId,email,isAdmin}` (`session/route.ts:11`). No session → `{authenticated:false}` (`:10`).
2. **Absolute cap, boundary.** A session valid iff `now < issued_at + 604800 s` (`service.ts:16`, `server.ts:12`). Age 6 d 23 h 59 m 59 s → true; exactly 7 d → false; 7 d + 1 s → `{authenticated:false}`. Test with a frozen clock.
3. **No sliding.** Using the session (any number of requests) never changes `issued_at`; Laravel's `last_activity` write must not extend it. A test makes requests at day 6 and shows the session still ends at day 7.
4. **Unverified mailbox is not a session.** A row for a user with `email_verified_at` null returns `{authenticated:false}` (`service.ts:16`).
5. **Fresh DB read every time.** `isAdmin` = verified email **and** `profiles.is_admin` read from the DB per request (`admin.ts`, brownfield §1). Flip the flag in the DB; the next call reflects it. No cookie or cache authority (A-04).
6. **DB failure.** Any exception during the lookup → `503 {error:{code:"SESSION_VERIFICATION_UNAVAILABLE",message:"Could not verify session. Please retry."}}` (`:12`), nothing else leaked. A missing session is **not** a failure.
7. **Cookie.** Production: name `__Host-lf_session`, `Secure`, `HttpOnly`, `SameSite=Lax`, `Path=/`, no `Domain`. Non-production: `lf_session`, `Secure` only when the canonical origin is https (`server.ts:37`). Asserted from config and from a real response's `Set-Cookie`.
8. **Headers.** Session responses carry `Cache-Control: no-store` and the site-wide `Referrer-Policy: strict-origin-when-cross-origin` (brownfield *Corrections* 1, 2); in production without a trusted client address it is `503 AUTH_UNAVAILABLE` before any lookup (`session/route.ts:6`, already `EnsureAuthAvailable`).
9. **Regeneration helper.** A single `IssueSession` (or equivalent) used by 4.3/4.5 creates the session row with `issued_at` and regenerates the id; 4.1 tests it directly (old id dead, new id carries `issued_at`).
10. **No extra routes.** The only route this story adds is the session GET (arch test lists `route:list` auth routes; extended in 4.8).

## Inventory scope
A-03, A-04 (Laravel/Tests columns; both stay open until 4.3/4.5 create real sessions). ADR-005. Ledger #30 (3 tests ported here).

## Next.js source read
- `apps/web/src/lib/auth/service.ts:14-19` (`sessionFromHeaders`), `server.ts:12,41` (`SESSION_SECONDS`, `disableSessionRefresh`, no cookie cache), `app/api/auth/session/route.ts:5-13`, `lib/auth/admin.ts`, `lib/auth/current-user.ts:5-7`, `lib/auth/http.ts:6-16`.
- Docs: `brownfield/auth-and-security.md` §1, §4 (session), *Corrections* 1–2.

## Behaviour notes
- Next reads the DB on every request and ignores the cookie cache; the cap is measured from creation (`createdAt`), not last use.
- The session row in `0001_01_01_000000_create_users_table.php:28-35` has **no** `created_at`; ADR-005 says `auth.issued_at` — store it in the session payload at login (see open question 1).
- The session endpoint is a GET: no Origin guard, but the proxy check applies (`:6`).
- Next does not delete an expired session row on read (it just returns null); see open question 2.

## Laravel guidance
- `app/Http/Middleware/EnforceSessionCap.php` (web group): reads `auth.issued_at` from the session, rejects (logout + invalidate) past 7 d or unverified user. `app/Support/Auth/SessionCap.php` holds the constant `604800` and the check, so 4.3/4.5/4.7 import it.
- `app/Http/Controllers/Auth/SessionController.php`; routes in a new `routes/auth.php` loaded from `bootstrap/app.php` with the existing `AuthJsonBoundary` + `EnsureAuthAvailable` middleware; the group is reused by 4.3–4.7.
- Config only through `config/session.php`/`config/portal.php`: cookie name from `portal` config (production `__Host-lf_session`; the `__Host-` prefix requires Secure, Path=/ and no Domain; validate in `config/` boot checks like story 1.3).
- Session driver `database` (table exists); `lifetime` stays Laravel's idle value but is irrelevant to the cap; never rely on it.

## Planned deviations from Next.js
None planned. Cookie name differs from Better Auth's by design (ADR-005).

## Tasks
1. Cookie/session config + boot validation (AC 7).
2. `SessionCap`, `EnforceSessionCap` (AC 2, 3, 4), `IssueSession` (AC 9).
3. `routes/auth.php`, `SessionController` (AC 1, 5, 6, 8, 10).
4. Tests per the plan; Conversion record; inventory, ledger #30, sprint-status → review.

## Test plan
| Layer | Test | Covers |
|---|---|---|
| L1 `@auth @unit` | `tests/Unit/Support/Auth/SessionCapTest.php`: boundary datasets (AC 2) | A-04 |
| L2 `@auth` | `tests/Feature/Auth/SessionEndpointTest.php`: AC 1, 3, 4, 5, 6 (DB failure via a throwing connection), 8; `SessionCookieTest.php`: AC 7 | A-03, ledger #30 |
| L2 | `tests/Feature/Auth/IssueSessionTest.php` (AC 9) | A-04 |
| L4 parity `@auth&@api` | `contract/auth-session.spec.ts:18,26` against Laravel | A-03 |

## Definition of done (Laravel-only, `epics.md:35`)
`bin/test` green (Pint, Larastan level 9, Pest) with the tests below; the Conversion record filled; inventory Laravel/Tests columns, ledger rows, `sprint-status.yaml` → `review`, and one line each in DECISIONS / RISKS / ASSUMPTIONS where something was decided. No `apps/web` change. L4/L5 parity is run by the gate named in the header only where the story says so.

## Dependencies and follow-ups
- Consumers: 4.3, 4.5 (`IssueSession`), 4.7 (logout, change), 4.8 (guards). Shares `routes/auth.php`, `bootstrap/app.php`, `config/session.php`.
- Parity needs the Laravel stack under the contract suite (not run here; Next-side setup is the owner's call).

## Open questions (with recommendations)
1. **Where does `issued_at` live?** The `sessions` table has no creation column. *Recommendation:* ADR-005's `auth.issued_at` in the session payload, set once by `IssueSession`; no migration (a migration is an owner step against a live DB).
2. **Delete expired session rows on read?** Next leaves them. *Recommendation:* delete the row on the first rejected read (cheap, tidy); no observable difference.
3. **Owner items: none.**

## Doc / code disagreements
- `brownfield` §1 says `created_at` "in the row or payload"; ADR-005 says payload. Use the payload.

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
