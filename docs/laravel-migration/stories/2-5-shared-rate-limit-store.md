# Story 2.5: Shared rate-limit store

**Status:** review (2026-11-22, builder `2-5-limits`, branch `workbench/2-5-limits`) · **DoD variant:** Laravel-only · **Epic:** 2 · **Covers:** X-06, ADR-009, NFR-S4 · **Gate:** `@pg-race`, `@unit` · **After:** 2.1 (stack on `workbench/schema`, the 2.1 builder's branch; unmerged)

> Created with BMAD `create-story`, from the researcher draft in `reports/story-drafts-60.md` (Workbench), with its `file:line` citations spot-checked against `apps/web` and the docs and corrected (see *Doc / code disagreements*). The draft left bucket values open; they are filled in here from `apps/web/src/lib/auth/rate-limit.ts` and `brownfield/auth-and-security.md` §8. Structure follows `stories/2-1-schema-migrations-and-roles.md` and `templates/story-conversion-record.md`. Docs only: no portal code was written for this file.

## Story
As the portal, I need a PostgreSQL-backed shared rate-limit service, so that quotas are atomic, hold across processes and restarts, and keep counting even when the surrounding business transaction rolls back.

## Acceptance criteria
From `epics.md:255-259` (§2.5), ADR-009 (`adr/ADR-009-rate-limits-port-the-postgres-bucket-table.md:8`) and NFR-S4 (`prd.md:119`), expanded.

1. **Connection.** `RateLimits` reads, writes and clears buckets only on `pgsql_limits` (`apps/portal/AGENTS.md` §3 connections table, line 43 on main `b115b95`); never the default connection, never Laravel's cache `RateLimiter`. → `tests/Feature/Support/RateLimitsTest.php` (connection name asserted) and the source-scan test in `tests/Arch/RateLimitsTest.php` (see *Test plan*).
2. **Not inside a business transaction.** Every public method first asserts that **both** `DB::connection('pgsql')->transactionLevel() === 0` (the connection business transactions, `Db::serializable()` and `Locks` use) **and** `DB::connection('pgsql_limits')->transactionLevel() === 0`, and throws a clear exception otherwise (`epics.md:257`). Checking `pgsql_limits` alone can't see a call made inside a business transaction, because those run on `pgsql`. **Test harness consequence:** every test that reaches `RateLimits`, directly or through an Action or route, uses the 2.1 truncation harness (`2-1-…md:131`; on the branch `Tests\Support\TruncatesDatabaseAsOwner`, bound per file with `uses(TruncatesDatabaseAsOwner::class)` outside `tests/Concurrency`, where `tests/Pest.php` already binds it), not the `RefreshDatabase` transaction wrapper (`Tests\Support\RefreshDatabaseAsOwner`). It has to anyway: `pgsql_limits` writes commit outside the wrapper and would leak between tests. This is the same rule 2.4 sets for `Db::serializable()`. No "baseline level" hook in production code. → `tests/Feature/Support/RateLimitsGuardTest.php`.
3. **Hashed keys.** `auth_rate_limits.key` holds the lowercase hex sha256 (char 64) of the logical bucket string; no clear-text email, address, token or user id is stored. Logical strings as Next (`rate-limit.ts:35-36,45,48`): `{scope}:address:{address}`, `{scope}:identity:{identity}`, `/api/auth/login:address:{address}`, `login:failures:{email}:{address|unknown-address}`.
4. **Auth mode: atomic single-statement hit.** One `INSERT … ON CONFLICT (key) DO UPDATE … RETURNING hits` per bucket (`rate-limit.ts:14-19`): new key → 1; window expired (`window_start < now − window`) → hits 1 and `window_start = now`; else `LEAST(hits + 1, 100000)`, window unchanged. A request is allowed when every bucket's returned hits ≤ its cap; **all** buckets are hit even when an earlier one is over (`:27`, no short-circuit). This mode is for the auth limits only.
5. **Values as Next** (`rate-limit.ts:6-9`, `auth-and-security.md:90-92`): window 15 min; general auth (`allowAuthAttempt`, scope = request path, identity lowercased, `lib/auth/http.ts:46-47`): address 20 (only when a trusted address is known) + identity 5; login: address 20 (when known) + failure bucket 5, reserved **before** the password check, and **deleted on success** (`clearLoginFailures`, `:52-54`).
6. **Pruning.** Each consume first deletes rows with `window_start` older than 1 h (`rate-limit.ts:25`); active buckets are untouched.
7. **Rollback independence.** A failed login whose fence/business transaction rolls back still counts (`epics.md:258`). → `tests/Concurrency/RateLimitsRollbackTest.php`.
8. **Exact cap across processes.** N parallel processes (N > cap) hitting one bucket yield exactly `cap` allowed (`epics.md:258`). → `tests/Concurrency/RateLimitsRaceTest.php`.
9. **Ordering.** Auth Actions call `RateLimits` before `Locks::credential()` / the fence transaction (`epics.md:257`; Next `login/route.ts:14` reserves before the fenced sign-in). 2.5 provides the service and the AC 2 guard, which makes a call made after the fence transaction opens throw (`Locks::credential()` takes a transaction-scoped lock on `pgsql`, so it is always inside one). The Actions themselves are Epic 4 (see *Dependencies*). → `tests/Feature/Support/RateLimitsGuardTest.php`.
10. **Checkout mode: all-or-nothing, with retry-after** (Next `checkout-auth-email-rate-limit.ts:48-80`, ledger #79). `consumeCheckoutEmail($sessionId, $destination)` returns `allowed`, or `denied` with `retryAfterSeconds`:
    - Buckets in Next's order: session (cap 3, 15 min), then destination (cap 5, 60 min). Each value is normalised as Next's `opaqueKey` (`:24`, JS `trim()` then lowercase; `NodeCompat::trimEnv()` + `NodeCompat::lower()`).
    - **A denied request consumes nothing in any bucket** (Next checks every bucket first, `:61-64`, and only then records the send, `:68-77`). An allowed one adds 1 to every bucket. A failed send still counts (the caller consumes before the email I/O, `:66-67`).
    - Atomic across processes: one transaction **owned by the service** on `pgsql_limits` (opened after the AC 2 check): for each bucket, in sorted-key order, one `INSERT (hits 0) … ON CONFLICT (key) DO UPDATE SET hits = hits RETURNING` (creates or locks in one statement, so a concurrent cleanup can't delete the row in between) (no deadlock between two requests sharing a bucket), work out each bucket's effective hits (0 if its window has expired), then either update all the buckets or none. On a denial the service transaction **rolls back**, so the rows it just inserted go too; on an allow, a bucket whose effective hits are 0 gets `hits = 1, window_start = now`, so a window always starts at an allowed send, never at a denied request.
    - Retry-after comes from the **first** blocked bucket in Next's order: `max(1, ceil(window_start + window − now))` seconds. With the fixed window this equals Next's value for #79's cases (900 and 3600).
    - Fixed window, not Next's sliding window: see *Planned deviations*.
    → `tests/Feature/Support/CheckoutEmailLimitTest.php`, `tests/Concurrency/RateLimitsRaceTest.php`.

## Inventory scope
- **X-06** (`01-feature-inventory.md:137`): rate limits (auth, forgot password, checkout emails), Laravel shared-store. 2.5 delivers the store; the row completes when the auth routes (Epic 4) and checkout resend (5.4, `epics.md:356`) use it and the `@security` contract specs pass. Leave the row open; fill the Laravel/Tests columns.
- **ADR-009**: implemented; record consequences (statement shape, per-bucket windows) in its *Consequences* section.
- **NFR-S4** (`prd.md:119`): measured by the Pest limiter tests here, including the parallel-process test.
- Test-port ledger **#79** `checkout-auth-email-rate-limit.test.ts` (3 tests, "Pest unit (shared-store limiter)", `test-port-ledger.md:87`): ported here against the checkout mode (AC 10), with Next's exact expected values (`{allowed}`, `{denied, retryAfterSeconds: 900}`, `{denied, retryAfterSeconds: 3600}`). The ledger's "Pest unit" becomes an L2 Pest test (it needs Postgres); note that in the ledger row. See *Open questions* 1. The login-limit behaviours in **#66** `auth.postgres.integration.test.ts` M1 (`:196`) and **#24** `login/route.test.ts` (`:42-48`, limited = identical 400) are HTTP/fence-level and stay with Epic 4.
- Not in scope: schema (2.1 owns `auth_rate_limits`, `2-1-…md:116`); auth routes and Actions (Epic 4); checkout resend wiring (5.4); `lib/forgot-password-rate-limit.ts` (dead code, **don't port**, `auth-and-security.md:94`).

## Next.js source read
- `apps/web/src/lib/auth/rate-limit.ts` (54 lines): sha256 `:5`, window and caps `:6-9`, upsert `:12-21`, consume (prune + hits in one Prisma transaction) `:22-30`, `consumeAuthLimit` `:33-38`, login failure key `:45`, `reserveLoginAttempt` `:46-51`, `clearLoginFailures` `:52-54`
- `apps/web/src/lib/auth/http.ts:46-47` (`allowAuthAttempt`: scope = pathname, `trustedClientAddress`, identity lowercased)
- `apps/web/src/app/api/auth/login/route.ts:14,17` (reserve before sign-in; clear on success)
- `apps/web/src/lib/checkout-auth-email-rate-limit.ts` (84 lines): caps and windows `:5-8` (session 3/15 min, destination 5/60 min); result type `:13` (`retryAfterSeconds`); key `scope:sha256(trim+lowercase)` `:23-25`; sliding window (`activeTimestamps`, `:39-42`); retry-after `:44-46`; check every bucket, then consume only if all pass `:56-77`. Caller `lib/checkout-auth-email.ts:44`
- Tests: `lib/auth.postgres.integration.test.ts:196` (M1), `app/api/auth/login/route.test.ts:42-48,77-85`, `lib/checkout-auth-email-rate-limit.test.ts:13-23,25-43,45-57` (expects `retryAfterSeconds` 900 and 3600)
- Parity: `tests/parity/journeys/contract/checkout-contracts.spec.ts:114-133` (K-04/X-06: 3 per session, then 429 with `0 < retry-after ≤ 900`)
- Schema: `apps/web/prisma/schema.prisma:377-383` (`AuthRateLimit`: key char(64) PK, hits, windowStart, index)
- Docs: `brownfield/auth-and-security.md:88-94` (§8), `:54` (login), `:128` (password route: every attempt consumes the per-user limit); `brownfield/data-model-and-ops.md:34`; `architecture.md:52,164`; `apps/portal/AGENTS.md` §3 connections table and §7 *Helpers* row (lines 43, 88 on main `b115b95`); `2-1-…md:116,131,188`

## Behaviour notes (written before converting)
- Next runs the prune and every bucket upsert in one Prisma transaction **of its own** (`rate-limit.ts:23`), separate from the business/fence transaction, which is why the limit survives a fence rollback. Laravel gets the same property from the separate `pgsql_limits` connection.
- Login: the per-address bucket counts every attempt; the per-email bucket counts failures only (reserved, then cleared on success), keyed per (email, address) when the address is trusted so a third party elsewhere can't lock the owner out (`rate-limit.ts:40-45`). Address `null` (no trusted proxy config) → only the identity/failure bucket, keyed with `unknown-address`.
- Hits are capped at 100000 so the counter can't overflow (`:17`).
- Rate-limited auth responses are route-specific (identical 400 for login, 429 `RATE_LIMITED` elsewhere, generic `{ok:true}` for magic-link/forgot); the response mapping belongs to the Epic 4 routes, not this service, which returns allowed/denied.
- Checkout auth emails are process-local in Next; ADR-009 moves them onto this store (an intended fix, `auth-and-security.md:93`). Their windows differ (15 min / 60 min) from the auth window, so the service needs a per-bucket window.
- The two Next limiters behave differently and both are kept: the auth limiter hits every bucket on every request, even when denied, and returns only allowed/denied; the checkout limiter consumes nothing when denied and returns a retry-after, which 5.4 sends as the `retry-after` header (parity K-04). Hence two modes (AC 4, AC 10).
- Next's checkout limiter is a sliding window (a timestamp list per bucket). The 2.1 table (`key`, `hits`, `window_start`, `2-1-…md:116`) can only hold a fixed window. #79's expected values and the K-04 parity bounds are the same under both; the difference shows only when sends are spread across a window boundary (see *Planned deviations*).

## Laravel guidance (for the dev agent)
- `app/Support/RateLimits.php` (`AGENTS.md` §7 *Helpers* row). Suggested API, returning a small result value (`RateLimitResult`: `allowed`, `?retryAfterSeconds`) from both modes:
  - auth mode (AC 4): `consumeAuth($scope, ?$address, $identity)`, `reserveLogin(?$address, $email)`, `clearLoginFailures(?$address, $email)`, on a private `hitAll(array $buckets)` where a bucket is `(logicalKey, cap, windowSeconds)`;
  - checkout mode (AC 10): `consumeCheckoutEmail($sessionId, $destination)`, on a private `consumeAllOrNothing(array $buckets)`.
- Auth mode: run the prune and each upsert as their own autocommit statements on `pgsql_limits` (each is atomic; a wrapping transaction adds nothing). Checkout mode: the prune, then one service-owned transaction (AC 10). The AC 2 check runs once, at the public method's entry, before the service opens its own transaction.
- Use `now()` from PHP (testable clock) or the DB `now()` consistently, not both; record the choice.
- If 2.2 created an `AuthRateLimit` model, give it `$connection = 'pgsql_limits'` and use it only from `RateLimits` (or don't use it, and say so in the record); the source-scan test allows only `RateLimits` to name the table.
- The parallel test uses `proc_open` children (separate PHP processes, separate connections) and the 2.1 truncation harness for `tests/Concurrency`.

## Planned deviations from Next.js (confirm in the Conversion record)
| Behaviour | Next.js | Laravel | Why | Ref |
|---|---|---|---|---|
| Limiter transaction | own Prisma transaction (prune + hits) | separate `pgsql_limits` connection, autocommit statements, level-0 assertion | ADR-009 | ADR-009 |
| Checkout auth email limits | process-local `Map` | same PG store, per-bucket window, all-or-nothing with retry-after (AC 10) | holds across processes | ADR-009, `auth-and-security.md:93` |
| Checkout window shape | sliding window: each send ages out 15/60 min after it was made (`checkout-auth-email-rate-limit.ts:39-42`) | fixed window from the bucket's first allowed send (`window_start`; a denied request creates no row); a full new allowance once it expires | the 2.1 bucket table has no per-send timestamps (ADR-009: port the bucket table) | ADR-009 |

The checkout changes are intended; the first closes a residual risk. Neither is visible to the parity suite: K-04 sends in a burst and asserts `0 < retry-after ≤ 900` (`checkout-contracts.spec.ts:114-133`), and #79's three expected values are identical under both window shapes. What differs: with sends spread over a window, Next allows one more send as each old one ages out, while Laravel blocks until the window ends and then allows a full new allowance, so up to 2 × cap sends can fall within one window length across the boundary (6 per session, 10 per destination). If the owner wants Next's exact shape, it needs a schema change to 2.1's table (open question 2b, not recommended).

## Tasks
1. `RateLimits` service with connection, the two-connection level assertion, hashing, upsert, prune, clear (AC 1–6).
2. Auth helpers with Next's logical keys and caps (AC 3, 5).
3. Checkout mode: all-or-nothing consume with retry-after and per-bucket windows (AC 10); 5.4 wires it.
4. Guard for AC 2 and AC 9: the `pgsql` + `pgsql_limits` level check, with tests that a call inside `DB::connection('pgsql')->transaction()`, inside a `pgsql_limits` transaction, and (when 2.4 is on the branch) inside `Db::serializable()` throws and writes nothing.
5. Tests per *Test plan*, all on the truncation harness (AC 2: `TruncatesDatabaseAsOwner`, per file in `tests/Feature/Support`).
6. Docs: Conversion record; inventory X-06 columns; ledger #79 (ported; layer note); ADR-009 *Consequences* (two modes, fixed window); `AGENTS.md` §5 helper signature if it differs from the architecture, and §8 gotcha "tests that reach `RateLimits` use the truncation harness".

## Test plan
| Layer | File | Cases | IDs |
|---|---|---|---|
| L1 Pest `@unit` | `tests/Unit/Support/RateLimitKeysTest.php` | logical key strings as Next (`{scope}:address:…`, `{scope}:identity:…`, `/api/auth/login:address:…`, `login:failures:{email}:{address\|unknown-address}`, checkout session/destination after JS trim + lowercase, e.g. `" \u{00A0}SAME@example.com "` → `same@example.com`); stored key = lowercase sha256 hex, 64 chars; no DB | X-06, ADR-009 |
| L2 Pest (truncation harness) | `tests/Feature/Support/RateLimitsTest.php` | stored key has no clear text; new/active/expired window (clock moved); hits capped at 100000; all buckets hit when one is over (auth mode); caps 20/5/5 and window 15 min; address null → identity/failure bucket only, `unknown-address` key; clear deletes only the failure bucket; prune removes > 1 h rows and keeps active ones; connection is `pgsql_limits` | X-06, ADR-009 |
| L2 Pest (truncation harness) | `tests/Feature/Support/RateLimitsGuardTest.php` | every public method throws, and writes nothing, when called inside a `pgsql` transaction (as `Db::serializable()`/`Locks::credential()` would be), inside a `pgsql_limits` transaction, and inside `Db::serializable()` when 2.4 is on the branch; at level 0 on both it works (AC 2, AC 9) | X-06, ADR-009 |
| L2 Pest (truncation harness) | `tests/Feature/Support/CheckoutEmailLimitTest.php` | ledger #79's 3 cases with Next's values (clock frozen and moved as Next's `now`): per-session 3 then denied with `retryAfterSeconds` 900; destination 5 across session ids, then `" SAME@example.com "` denied with 3600; expiry permits a later send. Plus: a denied request leaves every bucket's hits unchanged (destination not burned by a session-blocked request); retry-after comes from the session bucket when both are blocked; prune leaves an active 60-min destination bucket alone | X-06, K-04 |
| L3 `@pg-race` | `tests/Concurrency/RateLimitsRaceTest.php` | auth mode: N = cap + k child processes on one key → exactly `cap` allowed; two buckets in one consume under contention. Checkout mode: N > 3 children on one session → exactly 3 allowed, and the destination bucket ends at exactly 3; children on two sessions sharing one destination → no deadlock, destination ends ≤ 5 | NFR-S4 |
| L3 `@pg-race` | `tests/Concurrency/RateLimitsRollbackTest.php` | consume, then roll back a business transaction on `pgsql` → the hit is still counted; repeat to the cap → denied | NFR-S4 |
| Arch (source scan) | `tests/Arch/RateLimitsTest.php` | a plain Pest test that scans `app/**/*.php` for the strings `auth_rate_limits` and `pgsql_limits` (Pest `arch()` can't see string literals). Allowed: `app/Support/RateLimits.php` for both; for `pgsql_limits` only, the 2.1 role-validation code (e.g. `app/Support/DatabaseRoles.php`, as the 2.1 branch has it). `config/` and `tests/` aren't scanned. Plus `expect('App')->not->toUse('Illuminate\Support\Facades\RateLimiter')` (AC 1) | ADR-009 |

## Definition of done (Laravel-only, `epics.md:35`)
`@pg-race` and `@unit` green, plus the full Laravel suite (`bin/test`, Concurrency included; the L2 tests above run there). Ledger #79 recorded; inventory X-06 columns updated (row stays open). Story record, handoff, pushed (branch).

## Dependencies and follow-ups
- **Depends on:** 2.1 (`auth_rate_limits`, `pgsql_limits` must equal the runtime role, validated there). Stack on `workbench/schema` (the 2.1 builder's branch); rebase if 2.1 changes.
- **2.4:** `Locks`/`Db::serializable()` run on `pgsql`; the AC 2 `pgsql` level check is what keeps limiter calls out of them. Both stories put tests that reach their helpers on the truncation harness.
- **Epic 4** (4.2 fence, 4.3 login, 4.4–4.7): call `RateLimits` before `Locks::credential()` (the AC 2 guard throws otherwise); own the response mapping and the M1 / login-route ports (#66, #24); their feature tests use the truncation harness. **4.7** password change: every attempt consumes the per-user limit (`auth-and-security.md:128`).
- **5.4** checkout resend: call `consumeCheckoutEmail()` and map a denial to `429 RATE_LIMITED` with `retry-after: retryAfterSeconds` (`epics.md:356`, "Resend limits hold across processes (2.5)"; parity K-04).

## Open questions (with recommendations)
1. **Checkout limits: here or 5.4?** ADR-009 covers checkout email limits; 5.4 says they hold "(2.5)". *Recommendation:* 2.5 builds the checkout mode (AC 10) and ports ledger #79's 3 cases against it with Next's expected values (marking #79 resolved); 5.4 only wires `checkout-auth-email.ts:44`'s equivalent and its `429 RATE_LIMITED` + `retry-after` response. Checkout logical keys: `checkout:session:{sessionId}` and `checkout:destination:{trim+lowercase email}`, then sha256 to char(64) (Next's `scope:sha256` form, `checkout-auth-email-rate-limit.ts:24`, is 73+ chars and doesn't fit the column; the stored form isn't observable).
2. **Prune vs a 60-minute window.** The 1 h prune (`rate-limit.ts:25`) is exactly the destination window, so a row is deleted only once expired; keep it, and assert it in a test. If any window ever exceeds 1 h the prune must use the longest window.
   - **(2b) Checkout window shape. Decided (owner): fixed window.** Fixed window (deviation row) or Next's sliding window (needs per-send timestamps, so a change to 2.1's `auth_rate_limits` or a second table)? *Recommendation:* fixed window. It is ADR-009's bucket table, the parity suite and #79 can't tell the difference, and the worst case (2 × cap across a boundary) is still a small, bounded number of emails. Owner accepted this recommendation.
3. **Clock.** *Recommendation:* PHP clock (`now()`, frozen in tests) passed as a parameter, as Next passes `now` from the app; record in ADR-009 *Consequences*.
No owner decision is open: 2b is decided (fixed window).

## Doc / code disagreements and citation fixes
- Draft cited `epics.md:251-254` for §2.5; it is `epics.md:255-259` (251-253 is 2.4). Fixed.
- Draft cited `apps/portal/AGENTS.md:3` for the `pgsql_limits` rule; it is `AGENTS.md:43`. Fixed. AGENTS.md citations now name the section and row (2.1 edits §3 and §8, which shifts line numbers).
- Earlier version of this story (review, 2026-11-21): suggested `consume(): bool` (no retry-after, which #79 and K-04 need), hit every bucket in checkout too (denied requests burned destination quota, unlike Next), listed no window-shape deviation, and checked only `pgsql_limits`'s transaction level, which can't detect a business transaction on `pgsql`. Fixed by AC 2, AC 10, the deviation rows and the test plan. `RateLimitsTest` was `@unit` on the transaction wrapper, where `pgsql_limits` rows leak; now L2 on the truncation harness. The arch rule "only `RateLimits` references `pgsql_limits`" would have tripped on `config/database.php` and 2.1's role validation; now a scoped source scan with an allow-list.
- Draft cited `rate-limit.ts:15-18` for the upsert; the statement spans `:14-19` (function `:12-21`). Fixed.
- Draft left caps/windows open; filled from `rate-limit.ts:6-9` and `auth-and-security.md:88-94` (they agree).
- Epic says semantics "match the `rate-limit.ts` tests" (`epics.md:259`), but there is no `rate-limit.test.ts` in `apps/web`; the behaviour is tested by `auth.postgres.integration.test.ts:196` (M1, real PG) and the mocked route tests (`login/route.test.ts`, `lib/auth/http.test.ts`). The unit cases above are written from the source; the M1 port stays with Epic 4 (ledger #66).
- Brownfield §8 names the general helper `allowAuthAttempt`; it lives in `lib/auth/http.ts:46` and calls `consumeAuthLimit` (`rate-limit.ts:33`). Not a conflict.

---

## Conversion record
(Filled in by the dev agent; see `templates/story-conversion-record.md`. Write "none" rather than leaving a section out.)

### Laravel implementation
- `app/Support/RateLimits.php`: static service, every query on `DatabaseRoles::LIMITS` (`pgsql_limits`). Public: `consumeAuth($scope, ?$address, $identity)`, `reserveLogin(?$address, $email)`, `clearLoginFailures(?$address, $email)`, `consumeCheckoutEmail($sessionId, $destination)`; caps, windows, prune age and the 100000 counter cap are public constants. Each public method first runs `assertOutsideTransactions()` (AC 2): `LogicException` naming both levels unless `pgsql` and `pgsql_limits` are both at level 0.
- Auth mode (`hitAll`): prune, then one autocommit `INSERT … ON CONFLICT (key) DO UPDATE … RETURNING hits` per bucket, as `rate-limit.ts:14-19` (strict `window_start < now − 15 min`, `LEAST(hits + 1, 100000)`), no short-circuit. Returns allowed/denied only.
- Checkout mode (`consumeAllOrNothing`): prune, then one service-owned transaction: one `INSERT … (hits 0) ON CONFLICT (key) DO UPDATE SET hits = hits RETURNING` per bucket in sorted-key order (create-or-lock in one statement); the prune is `DELETE … WHERE key IN (SELECT … FOR UPDATE SKIP LOCKED)`, so it never waits on or deadlocks with a held row (critic 4430 point 1); effective hits 0 when `window_start + window ≤ now`; the first blocked bucket in Next's order (session, destination) → **rollback** and `denied(max(1, ceil(remaining seconds)))`; otherwise every bucket gets `hits + 1`, or `hits = 1, window_start = now` when its effective hits were 0. So a denial creates and consumes nothing, and a window starts at an allowed send (critic point 2).
- `app/Support/RateLimitKeys.php`: Next's logical strings (AC 3) and `hash()` = lowercase sha256 hex (char 64). Checkout values go through `NodeCompat::trimEnv()` + `NodeCompat::lower()` (Next `opaqueKey`). `app/Support/RateLimitResult.php`: readonly `allowed` + `?retryAfterSeconds`.
- Clock: the PHP application clock (`now()`, frozen with `travelTo()` in tests), truncated to milliseconds (the column is `timestamp(3)`), used for every comparison; DB `now()` is never used. Read inside the service rather than passed as a parameter (open question 3 suggested a parameter): callers can't pass a wrong clock, and tests freeze it the Laravel way.
- No `AuthRateLimit` model: 2.2 isn't on this branch, and the service uses the query builder / raw SQL on `pgsql_limits`, so no model is needed. The arch scan allows only `RateLimits.php` to name the table.
- Only the service is built; no route or Action calls it yet (Epic 4, 5.4).

### Deviations from Next.js
| Behaviour | Next.js | Laravel | Why | Decision ref |
|---|---|---|---|---|
| Limiter transaction | own Prisma transaction (prune + hits) | separate `pgsql_limits` connection, autocommit statements (auth), level-0 assertion on `pgsql` and `pgsql_limits` | ADR-009; a rolled-back business transaction can't undo a hit | ADR-009, as planned |
| Checkout auth email limits | process-local `Map` | same PG store, per-bucket windows, all-or-nothing with retry-after | holds across processes | ADR-009, as planned |
| Checkout window shape | sliding window per send | fixed window from the bucket's first allowed send; full allowance once it ends (up to 2 × cap across a boundary) | the bucket table has no per-send timestamps | owner decision (open question 2b), DECISIONS 2026-11-22 |
| Stored checkout key | `scope:sha256(value)` (`checkout-auth-email-rate-limit.ts:24`) | sha256 of `checkout:{session\|destination}:{value}` | fits `char(64)`; not observable | open question 1 |

### Tests
| Layer | Test file / title | Inventory IDs |
|---|---|---|
| L1 `@unit` | `tests/Unit/Support/RateLimitKeysTest.php` (4): logical strings, JS trim + lowercase (NBSP, BOM, KELVIN SIGN), sha256 form, caps/windows and prune ≥ longest window | X-06 |
| L2 (truncation harness) | `tests/Feature/Support/RateLimitsTest.php` (12): hashed keys only; fixed 15-min window at the boundary (`= now − window` still active, +1 ms resets); caps 5/20/5; identity lowercased; no short-circuit (address bucket over, identity still hit); 100000 cap; login reserve/clear; `unknown-address`; prune; every bucket query is on `pgsql_limits` (query-event listener) | X-06 |
| L2 (truncation harness) | `tests/Feature/Support/RateLimitsGuardTest.php` (13): each of the 4 public methods throws and writes nothing inside a `pgsql` transaction holding an advisory xact lock (as `Locks::credential()`), and inside a `pgsql_limits` transaction; each works at level 0 after a committed business transaction; reserve-before-fence / clear-after | X-06 |
| L2 (truncation harness) | `tests/Feature/Support/CheckoutEmailLimitTest.php` (8): #79's 3 cases with Next's values (900, 3600, allowed); denial creates/consumes nothing; window starts at the first allowed send (retry-after 1 at −1 ms, then a new window); session retry-after first when both blocked; prune keeps an active 60-min bucket; result shape | X-06, K-04 |
| Arch | `tests/Arch/RateLimitsTest.php` (2): source scan of `app/` (allow-list: `Support/RateLimits.php`; `Support/DatabaseRoles.php` for the connection) and `not->toUse` the cache `RateLimiter` / `Limit` | X-06 |
| L3 `@pg-race` | `tests/Concurrency/RateLimitsCleanupRaceTest.php` (1): a foreign committed cleanup fired by a query listener after each limits statement mid-transaction → checkout send is allowed, no exception/hang (`lock_timeout` 5 s); negative proof: against the pre-fix code it fails with `LogicException auth_rate_limits.hits: unexpected value` | NFR-S4 |
| L3 `@pg-race` | `tests/Concurrency/RateLimitsRaceTest.php` (5): 12 children on one identity → 5 allowed, hits 12; 24 on one address (two buckets each) → 20; 10 login reservations → 5; 8 checkout on one session → 3, destination ends at 3; 10 on two sessions sharing a destination → 5 allowed, no deadlock, each session ≤ 3 | NFR-S4 |
| L3 `@pg-race` | `tests/Concurrency/RateLimitsRollbackTest.php` (2): hit survives a rolled-back fence transaction; rolled-back failures reach the cap → denied | NFR-S4 |

Helpers: `tests/Support/RateLimitBuckets.php` (read/seed rows by logical key, as the schema owner); `tests/Support/RateLimitChildren.php` + `tests/Support/rate-limits-child.php` (`proc_open` children with their own connections, released together by an advisory-lock barrier the parent holds until `pg_locks` shows every child waiting; the child environment is pinned to the parent's test database).

Test-port ledger rows resolved: **#79** (3/3, `CheckoutEmailLimitTest.php`; layer note: L2 on real PostgreSQL rather than "Pest unit", because the shared store is the thing under test).

### Test evidence
- `bin/test` on stack `lf-wb6` (2026-11-22, on `workbench/schema` `4e323ee` + this story): AGENTS drift check OK; Pint pass; Larastan level 9 no errors; Pest **449 passed (1360 assertions)**, 9.65 s. Baseline on `workbench/schema` was 403 (2.1 record); the 46 new tests are the ones above.
- The touched files alone first (46 tests): 45 passed, 1 failed: the arch scan caught a docblock in `RateLimitKeys.php` naming the table. Reworded; then green in the full run above.
- Stack removed with `docker compose down -v` right after the gates.

**Not run, and why:** CI (branch not merged); L4/L5 parity (no route uses the service yet; K-04 parity is 5.4's); the `Db::serializable()` guard case (2.4 isn't on this branch: the guard test uses a `pgsql` transaction with `pg_advisory_xact_lock`, which is what `Db::serializable()` / `Locks::credential()` amount to for the level check); Next-side tests (`apps/web` frozen, nothing changed there).

### Gotchas
- Tests that reach `RateLimits` use `TruncatesDatabaseAsOwner`, bound per file outside `tests/Concurrency` (critic point 4). The transaction wrapper would trip the AC 2 guard, and `pgsql_limits` writes would leak past it.
- The arch scan reads comments too: don't name `auth_rate_limits` or `pgsql_limits` in a docblock outside the allow-list.
- Parallel-process tests: a child must be pinned to the parent's test database (the child script passes `DB_*` from the parent's `config('database.connections.pgsql')`), and a barrier is needed or the children run one after another and the race isn't exercised.

### Docs updated
This record; story text fixes from the critic's re-check (`reports/story-docs-critic-1915.md`): point 2 (AC 10 and the window deviation row say a denial rolls back and a window starts at an allowed send), point 4 (AC 2 and Task 5 name `TruncatesDatabaseAsOwner` and the per-file binding), point 5 (stale "no owner decision" line replaced). `01-feature-inventory.md` X-06; `test-port-ledger.md` #79; `sprint-status.yaml` 2-5 → review; `docs/governance/DECISIONS.md`, `RISKS.md`, `ASSUMPTIONS.md` (one line each); `apps/portal/AGENTS.md` §8 (one gotcha); `handoff.md` session log (one line).

### Open items
- **ADR-009 *Consequences* not edited** (Task 6 asks for it, but accepted ADRs aren't edited by builders). The two modes, the fixed window and the PHP clock are recorded here and in DECISIONS; the owner decides whether ADR-009 gets the note or a superseding ADR.
- When 2.4 lands: add a `Db::serializable()` case to `RateLimitsGuardTest` (one dataset row).
- Epic 4 (4.2–4.7) calls `RateLimits` before `Locks::credential()` and owns the response mapping and the M1 port (#66); 5.4 maps a checkout denial to `429 RATE_LIMITED` + `retry-after`. X-06 stays open until then.
- Critic 4430 follow-up (2026-11-22, stack `lf-2-5-limits`, removed after): should-fix fixed (create-or-lock in one statement; SKIP LOCKED prune) with the cleanup-race test above (negative proof run); no-short-circuit test now has the address bucket over; guard test's stand-in lock key 25005 → 25007 (barrier keeps 25005). `bin/test`: Pint, Larastan 9, Pest **450 passed (1365 assertions)**. The prune/lock deadlock form is covered by construction (SKIP LOCKED, key-ordered locks), not by a separate test. ADR-009 *Consequences* note is still an **owner item** (new superseding ADR or owner-approved append); ADR not edited.
