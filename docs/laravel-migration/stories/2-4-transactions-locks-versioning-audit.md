# Story 2.4: Transactions, locks, versioning, audit

**Status:** done (2026-11-22, branch `workbench/2-4-tx`) · **DoD variant:** Laravel-only · **Epic:** 2 · **Covers:** X-08, X-09, X-17, ADR-011, NFR-R3 · **Gate:** `@pg-race` · **After:** 2.1 (stack on `workbench/schema`, the 2.1 builder's branch; unmerged)

> Created with BMAD `create-story`, from the researcher draft in `reports/story-drafts-60.md` (Workbench), with its `file:line` citations spot-checked against `apps/web` and the docs and corrected (see *Doc / code disagreements*). Structure follows `stories/2-1-schema-migrations-and-roles.md` and `templates/story-conversion-record.md`. Docs only: no portal code was written for this file.

## Story
As the portal, I need transaction, advisory-lock, optimistic-version and audit helpers, so that concurrent lifecycle work is safe, conflicts surface as the existing 409 codes, and audit payloads never hold secrets.

## Acceptance criteria
From `epics.md:251-253` (§2.4) and ADR-011 (`adr/ADR-011-lifecycle-concurrency.md:8`), expanded.

1. **`Db::serializable(callable, conflict)`** runs the callback in a PostgreSQL `SERIALIZABLE` transaction on the runtime connection and retries the whole callback on SQLSTATE `40001` and `40P01`, a bounded number of times. On exhaustion it throws the caller-supplied conflict (a domain exception with status 409 and the code the route returns today **for a serialization failure** (`P2034`), which is not always the route's version-guard code; see *Decided*); there is no generic default that hides the route code. **Decided** by accepted ADR-011 (`adr/ADR-011-lifecycle-concurrency.md:8`: "maps exhaustion to the existing 409 codes"); see *Decided* below. → `tests/Concurrency/SerializableTest.php`.
2. **Nesting throws.** Calling `Db::serializable()` while any transaction is open on that connection (`transactionLevel() > 0`) throws a clear exception and starts nothing. → same file. **Test harness consequence (decided here):** every test that runs `Db::serializable()`, directly or through an Action, uses the 2.1 truncation harness (Laravel `DatabaseTruncation` through `pgsql_migrate`, `2-1-…md:131`), never `RefreshDatabase`'s transaction wrapper. Under the wrapper `pgsql` sits at level 1, so the guard would throw, and `SET TRANSACTION ISOLATION LEVEL SERIALIZABLE` can't be issued inside a savepoint anyway. No "baseline level" hook in production code. Recorded in `AGENTS.md` §8 for the Epic 7/8 Action tests.
3. **Two concurrent writers.** Two processes/connections doing conflicting read-then-write in `Db::serializable()`: one commits; the other retries to success or ends in the supplied 409; the final state is consistent (no lost update, no partial write). → same file.
4. **Forced failures.** Forced `40001` and `40P01` are retried (attempt count asserted); a non-retryable error (e.g. `23505`, `23503`, a domain exception) is not retried and propagates unchanged. → same file.
5. **Version guard.** A project-mutation helper does `UPDATE projects SET status = ?, version = version + 1, … WHERE id = ? AND status = ? AND version = ?` and treats affected rows ≠ 1 as the caller's conflict; a successful guarded change advances `version` by exactly 1; a stale version updates nothing. Nothing else moves `version`: no trigger, no model event, and `version` isn't mass-assignable, so an ordinary save leaves it unchanged. → `tests/Concurrency/ProjectVersionGuardTest.php`.
6. **`Locks`** exposes only `credential($userId)`, `provision($email)`, `conceptUpload($projectId, $requestKey)` (`architecture.md:144`), each `pg_advisory_xact_lock(hashtextextended(<key>, 0))` with the same key strings as Next (`auth:<id>`, `provision:<email>`, `<projectId>:<requestKey>`), callable only inside a transaction (throws otherwise). Two holders of one key serialise; different keys don't block; the lock is released at commit/rollback. → `tests/Concurrency/LocksTest.php`.
7. **`Audit::record(type, project, actor, payload)`** inserts one `audit_events` row (nullable project/actor, jsonb payload) on the current connection/transaction, after passing the payload through `Scrubber::scrub()` with an audit profile (`apps/portal/AGENTS.md` §5 *Audit* row and §8 "`Audit::record` must call `Scrubber::scrub()` too"):
   - Tokens, bearer/basic credentials, secrets, sensitive keys and signed URLs in representative payloads are absent from the stored row.
   - **Stripe `checkoutSessionId` is kept (owner decision, see *Decided*).** A top-level `checkoutSessionId` is stored exactly as given: the audit profile skips both the key rule (`isSensitiveKey` normalises `checkoutSessionId` to `checkoutsessionid`, which matches `sessionid`, `Scrubber.php:28,101-105`) and the `cs_live_/cs_test_` value pattern (`:42`) for that key only. The same id under any other key, and every log line, are still redacted.
   - Emails: not masked in audit payloads (Decided (owner), *Open questions* 1).
   - Every payload shape Next writes today (the `logAudit`/`auditEvent.create` callers listed under *Next.js source read*) is stored with identical JSON, so the admin audit endpoint, which returns `payload` verbatim (`api/admin/projects/[id]/audit/route.ts:16-19`), is unchanged.
   - A missing payload is stored as `{}` (an object, as Next's `payload ?? {}`, `audit.ts:19`), never `[]`; written through the 2.2 `audit_events.payload` cast or, if 2.2 isn't on the branch, encoded explicitly with an empty payload as `new stdClass()`. Scrub the array **before** any conversion to `stdClass` (the Scrubber passes objects through unscrubbed, `Scrubber.php:61-63`).
   → `tests/Feature/Support/AuditTest.php`.
8. **Rollback.** An `Audit::record` inside a transaction that rolls back leaves no row (port of `postgres.integration.test.ts:71`, the audit/receipt half).

## Inventory scope
- **X-17** (`01-feature-inventory.md:147`): version guard + serializable + route-specific 409. Helpers complete here; the row completes when the lifecycle routes use them (Epic 7/8). Destination: "L3 Pest (version guard, SERIALIZABLE retries → 409) — story 2.4" (`tests/parity/fixtures/laravel-only-destinations.json:17`).
- **X-09** (`01-feature-inventory.md:140`): advisory locks and bounded retries. Destination "stories 2.4, 4.2, 5.2" (`laravel-only-destinations.json:12`): 2.4 delivers `Locks` and the retry helper; 4.2 (fence) and 5.2 (webhook ledger) complete it.
- **X-08** (`01-feature-inventory.md:139`): audit events with equivalent payloads. 2.4 delivers the writer only; each Action story writes its own types. Row stays open.
- **ADR-011**: implemented; consequences (retry limits chosen, conflict mapping) go in the ADR's *Consequences* section.
- Test-port ledger **#96** `postgres.integration.test.ts` (`test-port-ledger.md:104`): test 4 (`:52`, advisory-locked receipts converge) → `LocksTest` here (the lock half; receipts are 7.x); test 5 (`:71`, rollback) → AC 8 here for the audit half. Tests 3 and 6 stay with 5.x / 7.5a (`2-1-…md:177`).
- Not in scope: rate-limit store (2.5), lifecycle Actions/routes, mail (2.7), schema (2.1).

## Next.js source read
- `apps/web/src/lib/audit.ts:12-21` (`logAudit`: `projectId?`, `actorId?`, `type`, `payload ?? {}`; no scrubbing)
- `apps/web/src/lib/auth/fence.ts:6-11` (`pg_advisory_xact_lock(hashtextextended('auth:'+userId, 0))`, timeout 20 s, maxWait 5 s)
- `apps/web/src/lib/checkout-fulfillment.ts:449` (`provision:`+email lock); `apps/web/src/app/api/admin/projects/[id]/concepts/route.ts:249` (`projectId:requestKey` lock)
- Serializable routes and their codes (version-guard code → **P2034/P2028 code**): `api/admin/projects/[id]/status/route.ts:65,73,77-78` (`STATUS_CHANGE_CONFLICT` → **`LIFECYCLE_CONFLICT`**); `…/revision-requests/[rid]/delivered/route.ts:115,121,132` (`REVISION_DELIVERY_CONFLICT` → **`LIFECYCLE_CONFLICT`**); `…/concepts/[conceptId]/route.ts:80-81` (`CONCEPT_DELETE_CONFLICT` → **`LIFECYCLE_CONFLICT`**); `…/concepts/[conceptId]/publish/route.ts:102,120-121` (`CONCEPT_PUBLICATION_CONFLICT` for both); concept upload `…/concepts/route.ts:327,372` (`CONCEPT_PUBLICATION_CONFLICT` for both, and also for `P2002`); finals upload `…/finals/route.ts:158,202` (`FINAL_PUBLICATION_CONFLICT`, a 409 with a custom body: `uploadedObjectRetained`, `uploadedObject`); `…/reset/route.ts:14,107,125` (`PROJECT_RESET_CONFLICT`); `…/finals/notify/route.ts:17,90,97` (`FINAL_NOTIFICATION_CONFLICT`); `…/finals/download/route.ts:16,95,103` and `api/projects/[id]/finals/route.ts:20,129,147` (`FINAL_DOWNLOAD_CONFLICT`)
- `apps/web/src/lib/postgres.integration.test.ts:46-80` (concurrency tests 3–5)
- Audit payloads with Stripe ids: `lib/checkout-fulfillment.ts:310,411`, `app/api/stripe/webhook/route.ts:191` (`checkoutSessionId`)
- Other audit writers (payload shapes for the AC 7 "unchanged" cases): `api/projects/[id]/{messages,revision-requests,finals,approve,brief}/route.ts`, `api/admin/projects/[id]/{revision-requests/[rid]/delivered,reset,status,finals,entitlements,concepts/[conceptId]/publish,concepts/[conceptId],concepts}/route.ts`, `lib/project-lifecycle-email.ts:106` (`{}`), `lib/auth/service.ts:86,119`. The concept-upload receipt (`concepts/route.ts:325`) stores `result` (with the concept's admin-entered `notes`) and replays it as the response (`lib/concept-upload-request.ts:14-17`)
- `api/admin/projects/[id]/audit/route.ts:16-19` (returns `payload` as stored)
- Docs: `brownfield/api-admin.md:5` (version guard; "explicit `version` integer column (preferred)"), `:7` (serializable routes, `P2034`/`P2028` → 409); `brownfield/data-model-and-ops.md:25` (`audit_events` is also the idempotency/receipt store); `architecture.md:54,144`; `adr/ADR-011-lifecycle-concurrency.md:8`; `apps/portal/AGENTS.md` §5 *Transactions* / *Audit* rows and §8 Scrubber gotcha (lines 56, 58, 142 on main `b115b95`); `2-1-…md:100` (`projects.version` default 0), `:187` (2.4 notes)

## Behaviour notes (written before converting)
- **Next does not retry.** Every serializable route catches `P2034` (serialization failure) and `P2028` (Prisma transaction API error: timeout/maxWait) and returns 409 at once with a route code (`LIFECYCLE_CONFLICT` as the fallback in status, delivered and concept-delete). Options: `maxWait 2_000, timeout 5_000` on publish, concept upload, finals upload, reset, notify and download; defaults on status, delivered and concept-delete. Laravel adds bounded retries (ADR-011), so under contention a request that got 409 in Next may succeed: an accepted, intended change.
- **Version guard in Next** is `updateMany WHERE id AND status AND updatedAt`, count ≠ 1 → conflict (`api-admin.md:5`). Laravel uses `projects.version` (ADR-011, `2-1-…md:100`).
- **Locks** are transaction-scoped (`pg_advisory_xact_lock`), keyed by `hashtextextended(text, 0)`; the fence holds the lock and the writes on one connection (`fence.ts:4-5` comment).
- **Audit** rows are written inside the business transaction (so receipts roll back with it) and double as idempotency markers (`email_sent:*`, `concept_upload_request`, `data-model-and-ops.md:25`); `payload` defaults to `{}`.
- **Scrubber** (`app/Support/Scrubber.php`) redacts sensitive keys (matched after lowercasing and removing `_`, `-` and spaces, `:101-105`, against `:28`: `token`, `secret`, `password`, `signature`, `sessionid`, …), sensitive URL params, bearer/basic values, Stripe secret keys, `whsec_`, **`cs_live_/cs_test_` checkout session ids** (`:42`), JWTs, and masks emails (`:51`). Run as-is on audit payloads it would redact Next's `checkoutSessionId` twice over (key rule and value pattern), and mask any email in free text such as concept `notes` inside the concept-upload receipt, which is replayed as the response. Because the admin audit endpoint returns payloads verbatim, either change is visible to the parity suite. Hence the audit profile in AC 7. Of the keys in Next's audit payloads, only `checkoutSessionId` matches a key rule (`requestKey`, `key`, `digest`, `heldVersion`, `method` don't); a grep of `apps/web/src` found no audit payload carrying a token or a signed URL.

## Laravel guidance (for the dev agent)
- Files: `app/Support/Db.php`, `Locks.php`, `Audit.php` (`AGENTS.md` §7 *Helpers* row, line 88 on main `b115b95`). The audit profile is a parameter or method on `Scrubber` (e.g. `Scrubber::scrubAuditPayload()`); the log channels keep calling the unchanged `scrub()`. A version-guard helper can live on the `Project` model (2.2) or in `Db`; pick one and add it to `AGENTS.md` §5 in the same commit.
- `DB::transaction()` already retries deadlocks only by attempts and only on *its* detection; write the loop explicitly: `SET TRANSACTION ISOLATION LEVEL SERIALIZABLE` as the first statement, catch `QueryException` with SQLSTATE `40001`/`40P01`, roll back, retry with a short jittered backoff.
- After-commit side effects (`AGENTS.md:57`) must not run on a failed attempt: `DB::afterCommit` callbacks registered in a rolled-back attempt are discarded by Laravel; test it.
- Concurrency tests use the 2.1 truncation harness for `tests/Concurrency` (no wrapping transaction) and two real connections or `proc_open` children. Any other test that reaches `Db::serializable()` uses the same harness (AC 2). `AuditTest` can stay on the transaction wrapper (`Audit::record` needs no level 0; the rollback case is a savepoint rollback).

## Planned deviations from Next.js (confirm in the Conversion record)
| Behaviour | Next.js | Laravel | Why | Ref |
|---|---|---|---|---|
| Serialization failure | immediate 409 | bounded retry, then the same 409 code | NFR-R3 | ADR-011 |
| Version guard | `updatedAt` | `projects.version` | explicit guard | ADR-011, `2-1-…md:100` |
| Transaction timeouts | Prisma `maxWait`/`timeout` → `P2028` → 409 | see *Open questions* 2 | no pool wait in PHP-FPM | — |
| Audit payloads | stored as given | scrubbed of secrets (audit profile: `checkoutSessionId` kept, emails per OQ 1) | `AGENTS.md` §5 *Audit* | arch §5; owner 2026-11-21 (`checkoutSessionId`) |

The audit row is **not visible** to the parity suite for any payload Next writes today (AC 7 asserts identical JSON for each known shape). It would differ only for a payload carrying a secret, token or signed URL, and none is known; if one turns up, it becomes a DV row with a `@deviation` test.

## Tasks
1. `Db::serializable()` with retry, nesting guard, caller-supplied conflict (AC 1–4).
2. Version-guard helper (AC 5).
3. `Locks` (AC 6).
4. `Audit::record` + the Scrubber audit profile (AC 7–8): `checkoutSessionId` kept (decided), emails per *Open questions* 1, `{}` default.
5. Tests per *Test plan*; tag `@pg-race` files `->group('pg-race')`.
6. Docs: Conversion record; `AGENTS.md` §5 if helper names/signatures change, §8 gotchas ("tests that reach `Db::serializable()` use the truncation harness"; "audit payloads use the Scrubber audit profile: `checkoutSessionId` kept"); ADR-011 *Consequences* (retry limits, mapping); DECISIONS line for the `checkoutSessionId` decision; inventory X-08/X-09/X-17 columns; ledger #96 partial; DECISIONS/RISKS lines.

## Test plan
| Layer | File | Cases | IDs |
|---|---|---|---|
| L3 `@pg-race` | `tests/Concurrency/SerializableTest.php` | two writers (one commits, other retries or 409, state consistent); forced 40001 and 40P01 retried N times then succeed; exhaustion → supplied conflict (status/code asserted); non-retryable not retried; nested call throws; failed attempt leaves no rows and no after-commit callback | X-17, NFR-R3 |
| L3 `@pg-race` | `tests/Concurrency/ProjectVersionGuardTest.php` | stale version → 0 rows, conflict; matching → +1 exactly; two concurrent guarded updates → exactly one wins; an ordinary update outside the guard leaves `version` unchanged (no trigger); with 2.2's `Project` model on the branch, an Eloquent save leaves it unchanged and `version` isn't mass-assignable (otherwise an open item for whichever of 2.2/2.4 lands second) | X-17 |
| L3 `@pg-race` | `tests/Concurrency/LocksTest.php` | same key serialises (second waits until first commits); different keys don't block; released on rollback; outside a transaction throws; key strings as Next (port of ledger #96 test 4, lock half) | X-09 |
| L2 Pest | `tests/Feature/Support/AuditTest.php` | row shape; null project/actor; missing payload stored and read back as `{}` (not `[]`); tokens / signed URL / bearer / secret keys redacted; dataset of Next's payload shapes (the `order_fulfilled` payloads at `checkout-fulfillment.ts:310,411`, the webhook `{checkoutSessionId}`, `state_changed` with `heldVersion`, `entitlement_consumed`, `concept_upload_request` with `notes`, `auth.password_reset`, `{}`) stored with identical JSON; `checkoutSessionId: "cs_test_…"` stored verbatim, the same value under another key redacted, and `Scrubber::scrub()` (logs) still redacting both; rollback leaves no row | X-08 |

## Definition of done (Laravel-only, `epics.md:35`)
`@pg-race` green, plus the full Laravel suite (`bin/test`, Concurrency included). Ledger #96 partial recorded; inventory columns updated. Story record, handoff, pushed (branch).

## Dependencies and follow-ups
- **Depends on:** 2.1 (`projects.version`, `audit_events`, harness). Stack on `workbench/schema` (the 2.1 builder's branch); rebase if 2.1 changes. Uses 2.2's `Project` model if the guard lives there (coordinate; otherwise raw query builder).
- **2.5:** `RateLimits` must never run inside these transactions. 2.5 enforces it by asserting `pgsql` (the connection `Db::serializable()` and `Locks` use) is at transaction level 0 on every call, as well as `pgsql_limits`.
- **2.7** mail pipeline (`email_sent:*` markers via `Audit::record`). **4.2** credential fence (`Locks::credential`), **5.2** webhook ledger, **5.x** fulfilment (`Locks::provision`), **7.x** concept upload (`Locks::conceptUpload`) and every lifecycle Action (route-specific conflicts).

## Decided
- **Retry, then 409: which code.** Decided by accepted ADR-011 (`adr/ADR-011-lifecycle-concurrency.md:8`): `Db::serializable()` retries on 40001/40P01 and "maps exhaustion to the existing 409 codes". So the epic's "one retries or gets 409" (`epics.md:253`) means the route's existing 409, consistent with `brownfield/api-admin.md:7` (`409 LIFECYCLE_CONFLICT` or a route-specific code) and X-17 ("route-specific 409 codes", `01-feature-inventory.md:147`). The exhaustion conflict an Action passes is **the code the route returns for `P2034` today**, not its version-guard code: `LIFECYCLE_CONFLICT` for status, delivered and concept-delete; `CONCEPT_PUBLICATION_CONFLICT` for publish and concept upload; `FINAL_PUBLICATION_CONFLICT` (with its custom body) for finals upload; `PROJECT_RESET_CONFLICT`, `FINAL_NOTIFICATION_CONFLICT`, `FINAL_DOWNLOAD_CONFLICT` for reset, notify and download (see *Next.js source read*). The version-guard codes (`STATUS_CHANGE_CONFLICT`, `REVISION_DELIVERY_CONFLICT`, `CONCEPT_DELETE_CONFLICT`) stay for an affected-rows ≠ 1 miss. No generic 409 is invented. Not an open question.
- **Stripe `checkoutSessionId` is kept in audit payloads (owner, 2026-11-21).** Next stores it (`checkout-fulfillment.ts:310,411`; `webhook/route.ts:191`) and the admin audit endpoint returns it; it's a reconciliation key, not a credential. The Scrubber's audit profile must not redact it (neither the `sessionid` key rule nor the `cs_` value pattern), for the top-level `checkoutSessionId` key only; logs keep redacting it. AC 7 and the `AuditTest` cases pin this. Not a deviation.

## Open questions (with recommendations)
1. **Emails in audit payloads. Decided (owner): no email masking in audit payloads.** The Scrubber masks every email (`Scrubber.php:51`). No Next audit payload has an email field, but free text can hold one: the concept-upload receipt stores the concept's `notes` and replays them as the response (`concept-upload-request.ts:14-17`), so masking would make a replayed upload answer differently from the first, and the admin audit endpoint would show masked text. *Recommendation:* the audit profile doesn't mask emails (an email isn't a secret; the `AGENTS.md` §5 *Audit* rule names secrets, signed URLs and tokens). Sensitive URL params in free text are still redacted: that is the rule's intent, and no known payload has one.
2. **Transaction timeouts. Decided (owner, 2026-11-22): 5 s lock/statement timeouts, as built.** Next's `P2028` (maxWait 2 s / timeout 5 s) also yields 409. *Recommendation:* set `SET LOCAL lock_timeout` / `statement_timeout` (e.g. 5 s) inside `Db::serializable()`, treat their SQLSTATEs (`55P03`, `57014`) as non-retryable conflicts mapped to the caller's 409; record the values in ADR-011 *Consequences*. `SET LOCAL` lasts only for that transaction, so it can't shorten the credential fence's 20 s lock wait (`fence.ts:8-9`; 4.2 runs the fence in its own transaction and sets its own timeout); 4.2 must not wrap the fence in `Db::serializable()`.
3. **Retry count/backoff. Decided (owner, 2026-11-22): 3 attempts, 10–50 ms waits, as built.** Not specified. *Recommendation:* 3 attempts total, 10–50 ms jittered backoff; test the count; record in ADR-011 *Consequences*.
4. **Lock signatures.** *Recommendation:* exactly `architecture.md:144`; no other lock types.

## Doc / code disagreements and citation fixes
- Draft cited `apps/portal/AGENTS.md:5` for the Transactions, Audit and Scrubber rules; they are at `AGENTS.md:56`, `:58` and `:142`. Fixed. The helpers path was cited as `:86`; it's line 88 on main. AGENTS.md citations now name the section and row (2.1 shifts line numbers).
- Epic 409 wording ("retries or gets 409") vs brownfield/X-17: resolved by accepted ADR-011 line 8 (existing route codes); see *Decided*.
- Scrubber vs X-08 "equivalent payloads": `checkoutSessionId` settled by the owner (*Decided*); emails *Open questions* 1. The earlier draft's recommendation ("keep the Scrubber's key rules but keep `cs_` ids") would still have redacted `checkoutSessionId` through the `sessionid` key rule, and called the change invisible though the admin audit endpoint returns payloads. Fixed in AC 7.
- `brownfield/api-admin.md:5` says "keep this pattern exactly (`updatedAt`) … Decide in architecture"; ADR-011 and 2.1 (`2-1-…md:100`) decided `version`. The brownfield line predates the decision; not a live conflict.

---

## Conversion record
(Filled in by the dev agent, Workbench builder "2-4-tx", 2026-11-22. Branch `workbench/2-4-tx`, based on `workbench/schema` `4e323ee`.)

### Laravel implementation
- `apps/portal/app/Support/Db.php:61` `Db::serializable(Closure $work, Throwable|Closure $conflict)`: runs on `pgsql`; throws `LogicException` if a transaction is already open (no nesting, including the RefreshDatabase wrapper); each attempt sets `SERIALIZABLE` plus `SET LOCAL lock_timeout`/`statement_timeout` = 5 s (`:34-36`); 3 attempts in total (`:26`) on 40001/40P01 (`:39`) with 10–50 ms jitter, then throws the caller's conflict; 55P03/57014 (`:42`) throw the conflict at once; any other error is rethrown unchanged. The retry loop is its own (Laravel's `transaction()` is called with 1 attempt), so after-commit callbacks of a failed attempt are discarded.
- `Db.php:105` `Db::guardedProjectUpdate($projectId, $expectedStatus, $expectedVersion, $values, $conflict)`: one `UPDATE … SET version = version + 1, updated_at = now() WHERE id, status, version`; affected ≠ 1 → caller's conflict; returns the new version; refuses `id`/`version` in `$values`. It's a query-builder helper because 2.2's `Project` model isn't on this branch (story *Dependencies*).
- `app/Support/Locks.php:16-28` `credential` / `provision` / `conceptUpload`: `pg_advisory_xact_lock(hashtextextended(key, 0))` with Next's exact key strings (`fence.ts:8` `auth:<id>`, `checkout-fulfillment.ts:449` `provision:<email>`, `concepts/route.ts:249` `<projectId>:<requestKey>`); throw outside a transaction.
- `app/Support/Audit.php:27` `Audit::record(type, project, actor, payload): string` (id): inserts on `pgsql` inside whatever transaction is open; payload JSON-normalised (`{}` for null/empty, lists refused) then `Scrubber::scrubAuditPayload()` (`Scrubber.php:96`): the log rules minus email masking, plus a top-level string `checkoutSessionId` kept (`:59`).
- No route codes added: conflicts are caller-supplied (ADR-011 line 8); `ErrorCodes` gains its 409 constants with the Actions (Epics 7/8).

### Deviations from Next.js
| Behaviour | Next.js | Laravel | Why | Decision ref |
|---|---|---|---|---|
| Serialization failure | immediate 409 | 3 attempts (10–50 ms jitter), then the same 409 | NFR-R3 | ADR-011; DECISIONS 2026-11-22 |
| Version guard | `updatedAt` | `projects.version` via `Db::guardedProjectUpdate` | explicit guard | ADR-011 |
| Transaction timeouts | Prisma maxWait 2 s / timeout 5 s → P2028 → 409 | `SET LOCAL lock_timeout`/`statement_timeout` 5 s → caller's 409, no retry | no pool wait in PHP-FPM | OQ 2 (decided (owner)); DECISIONS 2026-11-22 |
| Audit payloads | stored as given | scrubbed (tokens, credentials, secret keys, signed URLs); `checkoutSessionId` and emails kept | arch §5 | owner 2026-11-21 (*Decided*, OQ 1) |
ADR-011 *Consequences* would name the retry count; accepted ADRs aren't edited, so it's in DECISIONS and here.

### Tests
| Layer | Test file / title | Inventory IDs |
|---|---|---|
| L3 `@pg-race` | `tests/Concurrency/SerializableTest.php` (isolation/timeouts set; nesting throws; real concurrent writer retried; exhaustion → supplied 409, no partial write; forced 40001/40P01 retried with count; 23505/23503/23514 and domain errors not retried; lock/statement timeout → 409, 1 attempt; failed attempt discards after-commit callbacks; 40001 at COMMIT retried; 4-process race, version = ok count) | X-17, NFR-R3 |
| L3 `@pg-race` | `tests/Concurrency/ProjectVersionGuardTest.php` (+1 exactly; stale version / changed status / unknown id → conflict, nothing changed; `id`/`version` refused; 6-process race: exactly one winner; ordinary updates don't move `version`, no trigger) | X-17 |
| L3 `@pg-race` | `tests/Concurrency/LocksTest.php` (exactly three locks; held under Next's key until commit, released on rollback; other keys free; outside a transaction throws; second holder waits; 8-process receipt convergence) | X-09 |
| L2 Pest | `tests/Feature/Support/AuditTest.php` (row shape; Model/string/null refs; `{}` default; lists refused; 24 Next payload shapes (every audit type Next writes) stored with identical jsonb; redaction; `checkoutSessionId` top-level only; emails kept; rollback leaves no row) | X-08 |
| L1 Pest | `tests/Unit/ScrubberTest.php` "scrubs audit payloads with the audit profile…" | X-08 |

Test-port ledger rows resolved: #96 (still partial): test 4 lock half (`LocksTest` "converges advisory-locked receipts…"), test 5 audit half (`AuditTest` "leaves no row…"). Receipt-reader halves → 7.5a; test 3 and test 5's entitlement half → 7.x; test 6 → 5.x.

### Test evidence
2026-11-22, stack lf-wb4: `bin/test` → agents-guide check OK, Pint OK, Larastan level 9 no errors, Pest **475 passed (1366 assertions)**. `vendor/bin/pest --group=pg-race` → **71 passed (226 assertions)**; race line `serializable: 35 ok, 5 conflicts, 56 attempts` (re-run after review fixes, stack lf-2-4-tx, `down -v` after). Mutation check: with `Locks::conceptUpload` commented out in the child, the receipt race fails (8 writes, not 1).
**Not run, and why:** `bin/ui-test`, `bin/browser-test` and the parity suite (nothing in this story is UI- or route-visible); no Next-side comparison (DoD is Laravel-only).

### Gotchas
- `App\Support\Db` and the `DB` facade collide (PHP class names are case-insensitive): alias the facade `Database` in files that use both.
- The truncation harness never disconnects; `--group=pg-race` exhausted PG's 100 slots until the 2.4 files disconnected in `afterEach` (RISKS 2026-11-22).
- jsonb reorders keys: compare stored payloads in SQL (`payload = ?::jsonb`) or with `toEqual`.
- Race children get the test DB name from config (`tests/Support/RaceChildren.php`), not a hard-coded `portal_test`.
All promoted to `AGENTS.md` §8.

### Docs updated
`apps/portal/AGENTS.md` §5 (Transactions, Audit rows) and §8; `01-feature-inventory.md` X-08, X-09, X-17; `test-port-ledger.md` #96; `stories/sprint-status.yaml` (→ review); `docs/governance/DECISIONS.md`, `RISKS.md` (2026-11-22). ASSUMPTIONS: none. `handoff.md`: not touched (the brief gives it to the last branch).

### Open items
- Owner: OQ 2–3 (5 s timeouts; 3 attempts, 10–50 ms waits) decided (owner, 2026-11-22), as built.
- **Follow-up for whichever of 2.2/2.4 lands second (story test plan): AC 5's other half is untestable on this branch** (no `Project` model exists; only `app/Models/User.php`). When the `Project` model lands, add a test that `version` is not mass-assignable and that an Eloquent `save()` leaves it unchanged. Not verified here.
- If 2.2's `Project` model should own the guard, a later story can wrap `Db::guardedProjectUpdate` in it.
- Lead: move the disconnect into `TruncatesDatabaseAsOwner` (outside this story's files).
