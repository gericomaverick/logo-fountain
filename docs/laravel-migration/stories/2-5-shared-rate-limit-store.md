# Story 2.5: Shared rate-limit store

**Status:** ready-for-dev (2026-11-21) · **DoD variant:** Laravel-only · **Epic:** 2 · **Covers:** X-06, ADR-009, NFR-S4 · **Gate:** `@pg-race`, `@unit` · **After:** 2.1 (stack on `workbench/2.1`; unmerged)

> Created with BMAD `create-story`, from the researcher draft in `reports/story-drafts-60.md` (Workbench), with its `file:line` citations spot-checked against `apps/web` and the docs and corrected (see *Doc / code disagreements*). The draft left bucket values open; they are filled in here from `apps/web/src/lib/auth/rate-limit.ts` and `brownfield/auth-and-security.md` §8. Structure follows `stories/2-1-schema-migrations-and-roles.md` and `templates/story-conversion-record.md`. Docs only: no portal code was written for this file.

## Story
As the portal, I need a PostgreSQL-backed shared rate-limit service, so that quotas are atomic, hold across processes and restarts, and keep counting even when the surrounding business transaction rolls back.

## Acceptance criteria
From `epics.md:255-259` (§2.5), ADR-009 (`adr/ADR-009-rate-limits-port-the-postgres-bucket-table.md:8`) and NFR-S4 (`prd.md:119`), expanded.

1. **Connection.** `RateLimits` reads, writes and clears buckets only on `pgsql_limits` (`apps/portal/AGENTS.md:43`); never the default connection, never Laravel's cache `RateLimiter`. → `tests/Unit/Support/RateLimitsTest.php` (connection name asserted) and an arch test that nothing else touches `auth_rate_limits`.
2. **Not inside a business transaction.** Every public method first asserts `DB::connection('pgsql_limits')->transactionLevel() === 0` and throws a clear exception otherwise (`epics.md:257`).
3. **Hashed keys.** `auth_rate_limits.key` holds the lowercase hex sha256 (char 64) of the logical bucket string; no clear-text email, address, token or user id is stored. Logical strings as Next (`rate-limit.ts:35-36,45,48`): `{scope}:address:{address}`, `{scope}:identity:{identity}`, `/api/auth/login:address:{address}`, `login:failures:{email}:{address|unknown-address}`.
4. **Atomic single-statement hit.** One `INSERT … ON CONFLICT (key) DO UPDATE … RETURNING hits` per bucket (`rate-limit.ts:14-19`): new key → 1; window expired (`window_start < now − window`) → hits 1 and `window_start = now`; else `LEAST(hits + 1, 100000)`, window unchanged. A request is allowed when every bucket's returned hits ≤ its cap; **all** buckets are hit even when an earlier one is over (`:27`, no short-circuit).
5. **Values as Next** (`rate-limit.ts:6-9`, `auth-and-security.md:90-92`): window 15 min; general auth (`allowAuthAttempt`, scope = request path, identity lowercased, `lib/auth/http.ts:46-47`): address 20 (only when a trusted address is known) + identity 5; login: address 20 (when known) + failure bucket 5, reserved **before** the password check, and **deleted on success** (`clearLoginFailures`, `:52-54`).
6. **Pruning.** Each consume first deletes rows with `window_start` older than 1 h (`rate-limit.ts:25`); active buckets are untouched.
7. **Rollback independence.** A failed login whose fence/business transaction rolls back still counts (`epics.md:258`). → `tests/Concurrency/RateLimitsRollbackTest.php`.
8. **Exact cap across processes.** N parallel processes (N > cap) hitting one bucket yield exactly `cap` allowed (`epics.md:258`). → `tests/Concurrency/RateLimitsRaceTest.php`.
9. **Ordering.** Auth Actions call `RateLimits` before `Locks::credential()` / the fence transaction (`epics.md:257`; Next `login/route.ts:14` reserves before the fenced sign-in). 2.5 provides the service and an arch/unit guard; the Actions themselves are Epic 4 (see *Dependencies*).

## Inventory scope
- **X-06** (`01-feature-inventory.md:137`): rate limits (auth, forgot password, checkout emails), Laravel shared-store. 2.5 delivers the store; the row completes when the auth routes (Epic 4) and checkout resend (5.4, `epics.md:356`) use it and the `@security` contract specs pass. Leave the row open; fill the Laravel/Tests columns.
- **ADR-009**: implemented; record consequences (statement shape, per-bucket windows) in its *Consequences* section.
- **NFR-S4** (`prd.md:119`): measured by the Pest limiter tests here, including the parallel-process test.
- Test-port ledger **#79** `checkout-auth-email-rate-limit.test.ts` (3 tests, "Pest unit (shared-store limiter)", `test-port-ledger.md:87`): see *Open questions* 1. The login-limit behaviours in **#66** `auth.postgres.integration.test.ts` M1 (`:196`) and **#24** `login/route.test.ts` (`:42-48`, limited = identical 400) are HTTP/fence-level and stay with Epic 4.
- Not in scope: schema (2.1 owns `auth_rate_limits`, `2-1-…md:116`); auth routes and Actions (Epic 4); checkout resend wiring (5.4); `lib/forgot-password-rate-limit.ts` (dead code, **don't port**, `auth-and-security.md:94`).

## Next.js source read
- `apps/web/src/lib/auth/rate-limit.ts` (54 lines): sha256 `:5`, window and caps `:6-9`, upsert `:12-21`, consume (prune + hits in one Prisma transaction) `:22-30`, `consumeAuthLimit` `:33-38`, login failure key `:45`, `reserveLoginAttempt` `:46-51`, `clearLoginFailures` `:52-54`
- `apps/web/src/lib/auth/http.ts:46-47` (`allowAuthAttempt`: scope = pathname, `trustedClientAddress`, identity lowercased)
- `apps/web/src/app/api/auth/login/route.ts:14,17` (reserve before sign-in; clear on success)
- `apps/web/src/lib/checkout-auth-email-rate-limit.ts:5-9,24,48-53` (process-local: session 3/15 min, destination 5/60 min; key `scope:sha256(trim+lowercase)`); caller `lib/checkout-auth-email.ts:44`
- Tests: `lib/auth.postgres.integration.test.ts:196` (M1), `app/api/auth/login/route.test.ts:42-48,77-85`, `lib/checkout-auth-email-rate-limit.test.ts:13,25,45`
- Schema: `apps/web/prisma/schema.prisma:377-383` (`AuthRateLimit`: key char(64) PK, hits, windowStart, index)
- Docs: `brownfield/auth-and-security.md:88-94` (§8), `:54` (login), `:128` (password route: every attempt consumes the per-user limit); `brownfield/data-model-and-ops.md:34`; `architecture.md:52,164`; `apps/portal/AGENTS.md:43,88`; `2-1-…md:116,188`

## Behaviour notes (written before converting)
- Next runs the prune and every bucket upsert in one Prisma transaction **of its own** (`rate-limit.ts:23`), separate from the business/fence transaction, which is why the limit survives a fence rollback. Laravel gets the same property from the separate `pgsql_limits` connection.
- Login: the per-address bucket counts every attempt; the per-email bucket counts failures only (reserved, then cleared on success), keyed per (email, address) when the address is trusted so a third party elsewhere can't lock the owner out (`rate-limit.ts:40-45`). Address `null` (no trusted proxy config) → only the identity/failure bucket, keyed with `unknown-address`.
- Hits are capped at 100000 so the counter can't overflow (`:17`).
- Rate-limited auth responses are route-specific (identical 400 for login, 429 `RATE_LIMITED` elsewhere, generic `{ok:true}` for magic-link/forgot); the response mapping belongs to the Epic 4 routes, not this service, which returns allowed/denied.
- Checkout auth emails are process-local in Next; ADR-009 moves them onto this store (an intended fix, `auth-and-security.md:93`). Their windows differ (15 min / 60 min) from the auth window, so the service needs a per-bucket window.

## Laravel guidance (for the dev agent)
- `app/Support/RateLimits.php` (`AGENTS.md:88`). Suggested API: `consume(array $buckets): bool` where a bucket is `(logicalKey, cap, windowSeconds)`, plus `consumeAuth($scope, ?$address, $identity)`, `reserveLogin(?$address, $email)`, `clearLoginFailures(?$address, $email)`.
- With the connection at transaction level 0, run the prune and each upsert as their own autocommit statements on `pgsql_limits` (each is atomic; a wrapping transaction adds nothing and would trip the level check for re-entrant calls). Use `now()` from PHP (testable clock) or the DB `now()` consistently, not both; record the choice.
- The parallel test uses `proc_open` children (separate PHP processes, separate connections) and the 2.1 truncation harness for `tests/Concurrency`.

## Planned deviations from Next.js (confirm in the Conversion record)
| Behaviour | Next.js | Laravel | Why | Ref |
|---|---|---|---|---|
| Limiter transaction | own Prisma transaction (prune + hits) | separate `pgsql_limits` connection, autocommit statements, level-0 assertion | ADR-009 | ADR-009 |
| Checkout auth email limits | process-local `Map` | same PG store, per-bucket window | holds across processes | ADR-009, `auth-and-security.md:93` |
The checkout change is intended and closes a residual risk; it is not visible to single-process parity runs.

## Tasks
1. `RateLimits` service with connection, level assertion, hashing, upsert, prune, clear (AC 1–6).
2. Auth helpers with Next's logical keys and caps (AC 3, 5).
3. Generic per-bucket-window consume for checkout (5.4 wires it).
4. Guard for AC 9: arch test that `RateLimits` is not called from inside `Db::serializable()`/`Locks` code paths, or a unit test that calling it inside a transaction throws (AC 2 already enforces the outcome).
5. Tests per *Test plan*.
6. Docs: Conversion record; inventory X-06 columns; ledger #79 per *Open questions* 1; ADR-009 *Consequences*; `AGENTS.md` §5 helper signature if it differs from the architecture.

## Test plan
| Layer | File | Cases | IDs |
|---|---|---|---|
| L1/L2 Pest `@unit` | `tests/Unit/Support/RateLimitsTest.php` | stored key = sha256 hex of the logical string (no clear text); new/active/expired window (clock moved); hits capped at 100000; all buckets hit when one is over; caps 20/5/5 and window 15 min; address null → identity/failure bucket only, `unknown-address` key; clear deletes only the failure bucket; prune removes > 1 h rows and keeps active ones; connection is `pgsql_limits`; call inside an open transaction throws | X-06, ADR-009 |
| L1 Pest `@unit` | `tests/Unit/Support/CheckoutEmailLimitTest.php` | port of ledger #79's 3 cases on the shared store: per-session 3 / 15 min, per-destination 5 / 60 min across session ids, expiry permits a later send | X-06, K-04 |
| L3 `@pg-race` | `tests/Concurrency/RateLimitsRaceTest.php` | N = cap + k child processes on one key → exactly `cap` allowed; two buckets in one consume under contention | NFR-S4 |
| L3 `@pg-race` | `tests/Concurrency/RateLimitsRollbackTest.php` | consume, then roll back a business transaction on `pgsql` → the hit is still counted; repeat to the cap → denied | NFR-S4 |
| Arch | `tests/Arch/RateLimitsTest.php` | only `App\Support\RateLimits` references `auth_rate_limits` / the `pgsql_limits` connection | ADR-009 |

## Definition of done (Laravel-only, `epics.md:35`)
`@pg-race` and `@unit` green, plus the full Laravel suite (`bin/test`, Concurrency included). Ledger #79 recorded; inventory X-06 columns updated (row stays open). Story record, handoff, pushed (branch).

## Dependencies and follow-ups
- **Depends on:** 2.1 (`auth_rate_limits`, `pgsql_limits` must equal the runtime role, validated there). Stack on `workbench/2.1`; rebase if 2.1 changes.
- **2.4:** `Locks`/`Db::serializable()`; the level-0 assertion here is what keeps limiter calls out of them.
- **Epic 4** (4.2 fence, 4.3 login, 4.4–4.7): call `RateLimits` before `Locks::credential()`; own the response mapping and the M1 / login-route ports (#66, #24). **4.7** password change: every attempt consumes the per-user limit (`auth-and-security.md:128`).
- **5.4** checkout resend: wire the checkout buckets (`epics.md:356`, "Resend limits hold across processes (2.5)").

## Open questions (with recommendations)
1. **Checkout limits: here or 5.4?** ADR-009 covers checkout email limits; 5.4 says they hold "(2.5)". *Recommendation:* 2.5 builds the per-bucket-window API and ports ledger #79's 3 cases against it (marking #79 resolved); 5.4 only wires `checkout-auth-email.ts:44`'s equivalent and its `429 RATE_LIMITED` + `retry-after` response. Checkout logical keys: `checkout:session:{sessionId}` and `checkout:destination:{trim+lowercase email}`, then sha256 to char(64) (Next's `scope:sha256` form, `checkout-auth-email-rate-limit.ts:24`, is 73+ chars and doesn't fit the column; the stored form isn't observable).
2. **Prune vs a 60-minute window.** The 1 h prune (`rate-limit.ts:25`) is exactly the destination window, so a row is deleted only once expired; keep it, and assert it in a test. If any window ever exceeds 1 h the prune must use the longest window.
3. **Clock.** *Recommendation:* PHP clock (`now()`, frozen in tests) passed as a parameter, as Next passes `now` from the app; record in ADR-009 *Consequences*.
No owner decision needed for 2.5.

## Doc / code disagreements and citation fixes
- Draft cited `epics.md:251-254` for §2.5; it is `epics.md:255-259` (251-253 is 2.4). Fixed.
- Draft cited `apps/portal/AGENTS.md:3` for the `pgsql_limits` rule; it is `AGENTS.md:43`. Fixed.
- Draft cited `rate-limit.ts:15-18` for the upsert; the statement spans `:14-19` (function `:12-21`). Fixed.
- Draft left caps/windows open; filled from `rate-limit.ts:6-9` and `auth-and-security.md:88-94` (they agree).
- Epic says semantics "match the `rate-limit.ts` tests" (`epics.md:259`), but there is no `rate-limit.test.ts` in `apps/web`; the behaviour is tested by `auth.postgres.integration.test.ts:196` (M1, real PG) and the mocked route tests (`login/route.test.ts`, `lib/auth/http.test.ts`). The unit cases above are written from the source; the M1 port stays with Epic 4 (ledger #66).
- Brownfield §8 names the general helper `allowAuthAttempt`; it lives in `lib/auth/http.ts:46` and calls `consumeAuthLimit` (`rate-limit.ts:33`). Not a conflict.

---

## Conversion record
(Filled in by the dev agent; see `templates/story-conversion-record.md`. Write "none" rather than leaving a section out.)

### Laravel implementation

### Deviations from Next.js
| Behaviour | Next.js | Laravel | Why | Decision ref |
|---|---|---|---|---|

### Tests
| Layer | Test file / title | Inventory IDs |
|---|---|---|

Test-port ledger rows resolved:

### Test evidence
**Not run, and why:**

### Gotchas

### Docs updated

### Open items
