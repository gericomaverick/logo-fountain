# Story 2.4: Transactions, locks, versioning, audit

**Status:** ready-for-dev (2026-11-21) · **DoD variant:** Laravel-only · **Epic:** 2 · **Covers:** X-08, X-09, X-17, ADR-011, NFR-R3 · **Gate:** `@pg-race` · **After:** 2.1 (stack on `workbench/2.1`; unmerged)

> Created with BMAD `create-story`, from the researcher draft in `reports/story-drafts-60.md` (Workbench), with its `file:line` citations spot-checked against `apps/web` and the docs and corrected (see *Doc / code disagreements*). Structure follows `stories/2-1-schema-migrations-and-roles.md` and `templates/story-conversion-record.md`. Docs only: no portal code was written for this file.

## Story
As the portal, I need transaction, advisory-lock, optimistic-version and audit helpers, so that concurrent lifecycle work is safe, conflicts surface as the existing 409 codes, and audit payloads never hold secrets.

## Acceptance criteria
From `epics.md:251-253` (§2.4) and ADR-011 (`adr/ADR-011-lifecycle-concurrency.md:8`), expanded.

1. **`Db::serializable(callable, conflict)`** runs the callback in a PostgreSQL `SERIALIZABLE` transaction on the runtime connection and retries the whole callback on SQLSTATE `40001` and `40P01`, a bounded number of times. On exhaustion it throws the caller-supplied conflict (a domain exception with status 409 and the route's existing code); there is no generic default that hides the route code. **Decided** by accepted ADR-011 (`adr/ADR-011-lifecycle-concurrency.md:8`: "maps exhaustion to the existing 409 codes"); see *Decided* below. → `tests/Concurrency/SerializableTest.php`.
2. **Nesting throws.** Calling `Db::serializable()` while any transaction is open on that connection (`transactionLevel() > 0`) throws a clear exception and starts nothing. → same file.
3. **Two concurrent writers.** Two processes/connections doing conflicting read-then-write in `Db::serializable()`: one commits; the other retries to success or ends in the supplied 409; the final state is consistent (no lost update, no partial write). → same file.
4. **Forced failures.** Forced `40001` and `40P01` are retried (attempt count asserted); a non-retryable error (e.g. `23505`, `23503`, a domain exception) is not retried and propagates unchanged. → same file.
5. **Version guard.** A project-mutation helper does `UPDATE projects SET status = ?, version = version + 1, … WHERE id = ? AND status = ? AND version = ?` and treats affected rows ≠ 1 as the caller's conflict; a successful guarded change advances `version` by exactly 1; a stale version updates nothing. Eloquent saves elsewhere must not move `version` silently. → `tests/Concurrency/ProjectVersionGuardTest.php`.
6. **`Locks`** exposes only `credential($userId)`, `provision($email)`, `conceptUpload($projectId, $requestKey)` (`architecture.md:144`), each `pg_advisory_xact_lock(hashtextextended(<key>, 0))` with the same key strings as Next (`auth:<id>`, `provision:<email>`, `<projectId>:<requestKey>`), callable only inside a transaction (throws otherwise). Two holders of one key serialise; different keys don't block; the lock is released at commit/rollback. → `tests/Concurrency/LocksTest.php`.
7. **`Audit::record(type, project, actor, payload)`** inserts one `audit_events` row (nullable project/actor, jsonb payload) on the current connection/transaction, after passing the payload through `Scrubber::scrub()` (`apps/portal/AGENTS.md:58,142`). Tokens, bearer/basic credentials, secrets and signed URLs in representative payloads are absent from the stored row; ordinary payloads (ids, statuses, kinds) are stored unchanged. → `tests/Feature/Support/AuditTest.php`.
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
- Serializable routes and their conflict codes: `api/admin/projects/[id]/status/route.ts:65,73,77-78` (`STATUS_CHANGE_CONFLICT`, `LIFECYCLE_CONFLICT`); `…/revision-requests/[rid]/delivered/route.ts:115,121,132` (`REVISION_DELIVERY_CONFLICT`, `LIFECYCLE_CONFLICT`); `…/concepts/[conceptId]/route.ts:80-81` (`CONCEPT_DELETE_CONFLICT`, `LIFECYCLE_CONFLICT`); `…/concepts/[conceptId]/publish/route.ts:120-121` (`CONCEPT_PUBLICATION_CONFLICT`); `…/reset/route.ts:14,107,125` (`PROJECT_RESET_CONFLICT`); `…/finals/notify/route.ts:17,90,97` (`FINAL_NOTIFICATION_CONFLICT`); `…/finals/download/route.ts:16,95,103` and `api/projects/[id]/finals/route.ts:20,129,147` (`FINAL_DOWNLOAD_CONFLICT`)
- `apps/web/src/lib/postgres.integration.test.ts:46-80` (concurrency tests 3–5)
- Audit payloads with Stripe ids: `lib/checkout-fulfillment.ts:310,411`, `app/api/stripe/webhook/route.ts:191` (`checkoutSessionId`)
- Docs: `brownfield/api-admin.md:5` (version guard; "explicit `version` integer column (preferred)"), `:7` (serializable routes, `P2034`/`P2028` → 409); `brownfield/data-model-and-ops.md:25` (`audit_events` is also the idempotency/receipt store); `architecture.md:54,144`; `adr/ADR-011-lifecycle-concurrency.md:8`; `apps/portal/AGENTS.md:56,58,142`; `2-1-…md:100` (`projects.version` default 0), `:187` (2.4 notes)

## Behaviour notes (written before converting)
- **Next does not retry.** Every serializable route catches `P2034` (serialization failure) and `P2028` (Prisma transaction API error: timeout/maxWait) and returns 409 at once with a route code (`LIFECYCLE_CONFLICT` as the fallback in status, delivered and concept-delete). Options: `maxWait 2_000, timeout 5_000` on finals/reset/notify/download; defaults on status and delivered. Laravel adds bounded retries (ADR-011), so under contention a request that got 409 in Next may succeed: an accepted, intended change.
- **Version guard in Next** is `updateMany WHERE id AND status AND updatedAt`, count ≠ 1 → conflict (`api-admin.md:5`). Laravel uses `projects.version` (ADR-011, `2-1-…md:100`).
- **Locks** are transaction-scoped (`pg_advisory_xact_lock`), keyed by `hashtextextended(text, 0)`; the fence holds the lock and the writes on one connection (`fence.ts:4-5` comment).
- **Audit** rows are written inside the business transaction (so receipts roll back with it) and double as idempotency markers (`email_sent:*`, `concept_upload_request`, `data-model-and-ops.md:25`); `payload` defaults to `{}`.
- **Scrubber** (`app/Support/Scrubber.php`) redacts sensitive keys (`token`, `secret`, `password`, `signature`, …), sensitive URL params, bearer/basic values, Stripe secret keys, `whsec_`, **`cs_live_/cs_test_` checkout session ids**, JWTs, and masks emails. Next audit payloads contain `checkoutSessionId` (`checkout-fulfillment.ts:310,411`; `webhook/route.ts:191`), so scrubbing as-is would change those X-08 payloads (see *Open questions* 1). A grep of `apps/web/src` found no audit payload carrying a token or URL (not exhaustive).

## Laravel guidance (for the dev agent)
- Files: `app/Support/Db.php`, `Locks.php`, `Audit.php` (`AGENTS.md:86`). A version-guard helper can live on the `Project` model (2.2) or in `Db`; pick one and add it to `AGENTS.md` §5 in the same commit.
- `DB::transaction()` already retries deadlocks only by attempts and only on *its* detection; write the loop explicitly: `SET TRANSACTION ISOLATION LEVEL SERIALIZABLE` as the first statement, catch `QueryException` with SQLSTATE `40001`/`40P01`, roll back, retry with a short jittered backoff.
- After-commit side effects (`AGENTS.md:57`) must not run on a failed attempt: `DB::afterCommit` callbacks registered in a rolled-back attempt are discarded by Laravel; test it.
- Concurrency tests use the 2.1 truncation harness for `tests/Concurrency` (no wrapping transaction) and two real connections or `proc_open` children.

## Planned deviations from Next.js (confirm in the Conversion record)
| Behaviour | Next.js | Laravel | Why | Ref |
|---|---|---|---|---|
| Serialization failure | immediate 409 | bounded retry, then the same 409 code | NFR-R3 | ADR-011 |
| Version guard | `updatedAt` | `projects.version` | explicit guard | ADR-011, `2-1-…md:100` |
| Transaction timeouts | Prisma `maxWait`/`timeout` → `P2028` → 409 | see *Open questions* 2 | no pool wait in PHP-FPM | — |
| Audit payloads | stored as given | scrubbed | `AGENTS.md:58` | arch §5 |

## Tasks
1. `Db::serializable()` with retry, nesting guard, caller-supplied conflict (AC 1–4).
2. Version-guard helper (AC 5).
3. `Locks` (AC 6).
4. `Audit::record` + scrub (AC 7–8), with the Stripe-id decision applied (*Open questions* 1).
5. Tests per *Test plan*; tag `@pg-race` files `->group('pg-race')`.
6. Docs: Conversion record; `AGENTS.md` §5 if helper names/signatures change; ADR-011 *Consequences* (retry limits, mapping); inventory X-08/X-09/X-17 columns; ledger #96 partial; DECISIONS/RISKS lines.

## Test plan
| Layer | File | Cases | IDs |
|---|---|---|---|
| L3 `@pg-race` | `tests/Concurrency/SerializableTest.php` | two writers (one commits, other retries or 409, state consistent); forced 40001 and 40P01 retried N times then succeed; exhaustion → supplied conflict (status/code asserted); non-retryable not retried; nested call throws; failed attempt leaves no rows and no after-commit callback | X-17, NFR-R3 |
| L3 `@pg-race` | `tests/Concurrency/ProjectVersionGuardTest.php` | stale version → 0 rows, conflict; matching → +1 exactly; two concurrent guarded updates → exactly one wins | X-17 |
| L3 `@pg-race` | `tests/Concurrency/LocksTest.php` | same key serialises (second waits until first commits); different keys don't block; released on rollback; outside a transaction throws; key strings as Next (port of ledger #96 test 4, lock half) | X-09 |
| L2 Pest | `tests/Feature/Support/AuditTest.php` | row shape; null project/actor; payload `{}` default; tokens / signed URL / bearer / secret keys redacted; ordinary payload unchanged; Stripe session id per decision; rollback leaves no row | X-08 |

## Definition of done (Laravel-only, `epics.md:35`)
`@pg-race` green, plus the full Laravel suite (`bin/test`, Concurrency included). Ledger #96 partial recorded; inventory columns updated. Story record, handoff, pushed (branch).

## Dependencies and follow-ups
- **Depends on:** 2.1 (`projects.version`, `audit_events`, harness). Stack on `workbench/2.1`; rebase if 2.1 changes. Uses 2.2's `Project` model if the guard lives there (coordinate; otherwise raw query builder).
- **2.5:** `RateLimits` must never run inside these transactions; 2.5 owns that assertion.
- **2.7** mail pipeline (`email_sent:*` markers via `Audit::record`). **4.2** credential fence (`Locks::credential`), **5.2** webhook ledger, **5.x** fulfilment (`Locks::provision`), **7.x** concept upload (`Locks::conceptUpload`) and every lifecycle Action (route-specific conflicts).

## Decided
- **Retry, then 409: which code.** Decided by accepted ADR-011 (`adr/ADR-011-lifecycle-concurrency.md:8`): `Db::serializable()` retries on 40001/40P01 and "maps exhaustion to the existing 409 codes". So the epic's "one retries or gets 409" (`epics.md:253`) means the route's existing 409, consistent with `brownfield/api-admin.md:7` (`409 LIFECYCLE_CONFLICT` or a route-specific code) and X-17 ("route-specific 409 codes", `01-feature-inventory.md:147`). `Db::serializable()` takes the conflict from the caller, so each Action keeps its Next code (`STATUS_CHANGE_CONFLICT`, `CONCEPT_DELETE_CONFLICT`, …, `LIFECYCLE_CONFLICT` where Next falls back to it); no generic 409 is invented. Not an open question.

## Open questions (with recommendations)
1. **Stripe session ids in audit payloads (owner to confirm).** The existing Scrubber redacts `cs_live_/cs_test_` ids, which Next stores in audit payloads (`checkoutSessionId`). Scrubbing them changes X-08 payloads ("equivalent payloads") and loses a reconciliation key. *Recommendation:* `Audit::record` uses the Scrubber's key/token/URL rules but keeps Stripe checkout session ids (they're identifiers, not credentials; logs keep redacting them). If the owner prefers redaction, it becomes a DV row with a `@deviation` test.
2. **Transaction timeouts.** Next's `P2028` (maxWait 2 s / timeout 5 s) also yields 409. *Recommendation:* set `SET LOCAL lock_timeout` / `statement_timeout` (e.g. 5 s) inside `Db::serializable()`, treat their SQLSTATEs (`55P03`, `57014`) as non-retryable conflicts mapped to the caller's 409; record the values in ADR-011 *Consequences*.
3. **Retry count/backoff.** Not specified. *Recommendation:* 3 attempts total, 10–50 ms jittered backoff; test the count; record in ADR-011 *Consequences*.
4. **Lock signatures.** *Recommendation:* exactly `architecture.md:144`; no other lock types.

## Doc / code disagreements and citation fixes
- Draft cited `apps/portal/AGENTS.md:5` for the Transactions, Audit and Scrubber rules; they are at `AGENTS.md:56`, `:58` and `:142`. Fixed.
- Epic 409 wording ("retries or gets 409") vs brownfield/X-17: resolved by accepted ADR-011 line 8 (existing route codes); see *Decided*.
- Scrubber vs X-08 "equivalent payloads": *Open questions* 1.
- `brownfield/api-admin.md:5` says "keep this pattern exactly (`updatedAt`) … Decide in architecture"; ADR-011 and 2.1 (`2-1-…md:100`) decided `version`. The brownfield line predates the decision; not a live conflict.

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
