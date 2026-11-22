# Story 4.2: Credential fence and proofs

**Status:** ready-for-dev (created from `origin/main` 03a12b4) · **DoD variant:** Laravel-only · **Epic:** 4 · **Covers:** A-10, A-11 (proof half), ADR-007, FR10 · **Gate:** `@pg-race` · **After:** 2.4 (done), 4.1 (chain) · **Stacks on:** `main` (all listed dependencies are done); in the SERIAL chain it builds on the previous Epic 4 story's branch.

> Created with the repo's create-story form. All `apps/web` `file:line` checked 2026-11-22.

## Story
As the portal, I need every credential change to run under one per-user lock and every mailbox proof to die when the credential changes, so concurrent resets and changes have one winner and a stale link can never work.

## Acceptance criteria
1. **Fence.** `CredentialFence::run(string $userId, Closure $work)` opens one transaction on the runtime connection, takes `pg_advisory_xact_lock(hashtextextended('auth:'||userId,0))` (`fence.ts:8`; `Locks::credential` exists from 2.4), sets `SET LOCAL lock_timeout '5s'` and `statement_timeout '20s'` (ADR-007; Next: `fence.ts:10` maxWait 5 s / timeout 20 s), and every query inside uses that connection. A throw rolls back everything, including the lock.
2. **Lock timeout is a clean failure.** A second caller waiting past 5 s gets the generic `AuthFailure` (400 `AUTH_FAILED`, never a SQLSTATE); tested with a held lock in a child process.
3. **Issue a proof.** `AuthProofs::issue($user, 'setup'|'reset'|'magic')` returns a plaintext token once (≥ 32 random bytes, base64url, matching `/^[A-Za-z0-9_-]{20,256}$/`), stores only `sha256` hex, `kind`, `credential_version` of the user at that moment, `expires_at = now + 3600 s` (`server.ts:11,29-32`, brownfield §2).
4. **Validate a proof.** Shape regex first, **before any DB work** (`service.ts:69`), then under the fence: row exists, kind allowed, `expires_at > now` (an expiry equal to now is dead, `:80`), `proof.credential_version == user.credential_version`. Any failure is the same generic `AuthFailure`.
5. **Stale proofs are dead.** After any credential transition (reset, change; each increments `credential_version`) every outstanding proof of that user fails validation, including ones of other kinds (ledger #66 case 4; `integration.test.ts:89`).
6. **Races (L3, real PG, `tests/Concurrency/`).** reset/reset: one succeeds, the other `AuthFailure`; reset/change: one winner and all sessions of both gone; login/reset: no session authorised by the old password after the reset commits (`integration.test.ts:101,113`).
7. **Rollback.** A DB failure injected after the password write rolls back password, proof consume, proof deletion and session deletion together (`:122`; the injection point is a test seam in the action, wired in 4.6).
8. **No secrets in logs.** Tokens and hashes never reach the log scrubber output (`Scrubber` test case).
9. **Arch.** Classes under `app/Actions/Auth/` that write credentials call `CredentialFence::run`; nothing else calls `Locks::credential` for auth.

## Inventory scope
A-10 (Laravel/Tests; row closes here with the race tests). A-11 proof half (the send half is 4.4). Ledger #66 cases 4, 5, 6 here; case 7 completes in 4.6; 2, 3 in 4.5/4.6; 8–10 in 4.4; 11 in 4.3; 12 in 4.9a; 1 is Epic 5 (provisioning).

## Next.js source read
`apps/web/src/lib/auth/fence.ts:6-11`; `lib/auth/server.ts:11,29-32`; `lib/auth/service.ts:68-88,89-101`; `lib/auth.postgres.integration.test.ts:89,101,113,122`; brownfield §2 and §3.

## Behaviour notes
- Next serialises with a Prisma interactive transaction; there is no `SET LOCAL lock_timeout` in Next (Prisma's `maxWait` plays that part). ADR-007 asks for the explicit `SET LOCAL`s; same observable outcome.
- A proof whose user row is gone cannot validate (FK cascade in the schema).
- Proof tokens are minted by Better Auth in Next; Laravel mints its own, so only the shape, hash and lifetime are contract.

## Laravel guidance
`app/Support/Auth/CredentialFence.php`, `app/Support/Auth/AuthProofs.php` (model `App\Models\AuthProof` exists), `app/Exceptions/AuthFailure.php` exists (1.6). Keep the fence free of HTTP types so Pest and `proc_open` children can drive it.

## Planned deviations from Next.js
None.

## Tasks
1. `CredentialFence` + AC 1, 2. 2. `AuthProofs` issue/validate + AC 3–5. 3. Concurrency tests (AC 6, 7 seam). 4. Scrubber and arch tests. 5. Record, inventory, ledger #66, sprint-status.

## Test plan
| Layer | Test | Covers |
|---|---|---|
| L2 | `tests/Feature/Auth/CredentialFenceTest.php` (AC 1, 2 via second connection) | A-10 |
| L1/L2 | `tests/Feature/Auth/AuthProofsTest.php`: shape dataset, expiry boundary, version mismatch, kind mismatch | A-11 |
| L3 `@auth @pg-race` | `tests/Concurrency/CredentialRaceTest.php`: `proc_open` children, reset/reset, reset/change, login/reset, stale proofs | ledger #66 |
| Arch | `tests/Arch/AuthTest.php` (AC 9) | ADR-007 |

## Definition of done (Laravel-only, `epics.md:35`)
`bin/test` green (Pint, Larastan level 9, Pest) with the tests below; the Conversion record filled; inventory Laravel/Tests columns, ledger rows, `sprint-status.yaml` → `review`, and one line each in DECISIONS / RISKS / ASSUMPTIONS where something was decided. No `apps/web` change. L4/L5 parity is run by the gate named in the header only where the story says so.

## Dependencies and follow-ups
Consumers: 4.3–4.7, 4.9a. Shares `app/Support/Auth/`, `app/Actions/Auth/`, `tests/Concurrency/`, `tests/Arch/AuthTest.php` with the later stories.

## Open questions (with recommendations)
1. **Token source.** *Recommendation:* `Str::random(43)` (≥ 256 bits, within the shape).
2. **Is a proof's `used` state tracked?** Next deletes the row on use. *Recommendation:* same (single-use = delete).
3. **Owner items: none.**

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
