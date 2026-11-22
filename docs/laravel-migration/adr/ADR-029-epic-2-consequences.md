# ADR-029: Epic 2 consequences for ADR-009, ADR-011 and ADR-018

- **Status:** Accepted (owner, 2026-11-22)
- **Satisfies:** X-06, X-09, X-17, X-18, NFR-R3

## Decision

Epic 2 built the helpers that ADR-009, ADR-011 and ADR-018 describe. Those ADRs are Accepted and not edited; the consequences found while building them are recorded here and supersede nothing. Each one refines how the earlier decision is applied.

1. **ADR-009 (rate limits).** `App\Support\RateLimits` has two modes, as Next's two limiters behave:
   - Auth limiter: one autocommit upsert per bucket on the separate `pgsql_limits` connection, every bucket hit on every request (no short-circuit), allowed/denied only.
   - Checkout email limiter: all-or-nothing in a service-owned `pgsql_limits` transaction, rolled back on denial (nothing consumed), retry-after taken from the first blocked bucket.
   - Checkout windows are **fixed**, from the bucket's first allowed send (`window_start`). Next's window slides. The bucket table has no per-send timestamps, so up to 2 × the cap can land across a window boundary (6 per session in 15 min, 10 per destination in 60 min). Accepted by the owner (story 2.5); RISKS 2026-11-22.
   - The clock is the PHP process's `now()` truncated to milliseconds, never DB `now()`, so windows are testable. Servers and workers are assumed NTP-synced (ASSUMPTIONS 2026-11-22; review in Epic 9).
   - Every public method refuses to run inside a transaction on `pgsql` (business transactions, `Db::serializable()`, `Locks`) or on `pgsql_limits`, and writes nothing.
2. **ADR-011 (lifecycle concurrency).** `Db::serializable()` settings (owner, 2026-11-22):
   - 3 attempts in total, with 10–50 ms jittered waits between them, retrying only on SQLSTATE 40001 and 40P01; any other error propagates unchanged.
   - `SET LOCAL lock_timeout` and `statement_timeout` of 5 s inside the transaction (Next's Prisma `timeout` was 5 s). Their SQLSTATEs (55P03, 57014) map to the caller's 409 without a retry.
   - Exhaustion throws the caller-supplied conflict, so route codes stay the existing 409 codes. The version guard is `Db::guardedProjectUpdate()`; `projects.version` is not mass-assignable and is moved only by it.
3. **ADR-018 (email modes).** Lifecycle mail uses `symfony/postmark-mailer` through Laravel's queue with `after_commit` (`queue.connections.database.after_commit=true`, ADR-019). The `email_sent:*` marker is written in the caller's transaction at dispatch (owner, 2026-11-22), so `sent` means queued, a rollback leaves no marker, and a job that exhausts its retries lands in `failed_jobs` with no resend. `not_configured` and `missing_recipient` are returned synchronously and write no marker. Env names `POSTMARK_SERVER_TOKEN` and `POSTMARK_FROM` are kept from Next.

## Context and rationale

Sources: story 2.5 and 2.4 and 2.7 conversion records (`stories/2-5-…md`, `2-4-…md`, `2-7-…md`) and `docs/governance/DECISIONS.md`, `RISKS.md` and `ASSUMPTIONS.md` entries dated 2026-11-22. The behaviour being preserved is in `../brownfield/`.

## Consequences

- Callers call `RateLimits` before the business transaction or `Locks`, never inside one.
- Checkout email limits can allow more sends across a window boundary than Next did. A sliding window needs per-send timestamps (a schema change) and a new ADR.
- A lifecycle email whose job exhausts its retries is not resent automatically; an operator re-dispatches from `failed_jobs`.
