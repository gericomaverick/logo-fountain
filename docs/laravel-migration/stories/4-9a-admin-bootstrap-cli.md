# Story 4.9a: Admin bootstrap CLI

**Status:** ready-for-dev (created from `origin/main` 03a12b4) · **DoD variant:** Laravel-only · **Epic:** 4 · **Covers:** A-12, FR9 · **Gate:** Pest · **After:** 4.6, 2.1 (done) · **Stacks on:** `main` (dependencies done); in the SERIAL chain, the previous Epic 4 story's branch. Shared files: `app/Console/Commands/`, `DatabaseRoles`, `config/database.php` (`pgsql_migrate`)

> Created with the repo's create-story form. All `apps/web` `file:line` checked 2026-11-22.

## Story
As the operator, I can create the first admin exactly once, from a verified mailbox, with a command the running app cannot perform.

## Acceptance criteria
1. **`php artisan portal:bootstrap-admin --prepare --email=E`** creates an unprivileged user (no admin, unverified) and prints its UUID; it tells the operator to verify the mailbox through the recovery email first (`bootstrap-admin.mjs:20-24`).
2. **`… --email=E --confirm-user=UUID --ack=ONE_TIME_ADMIN_BOOTSTRAP`** grants admin. Missing/wrong `--ack` or a non-UUID `--confirm-user` → refusal with usage (`:10`).
3. **Refusals** (`:17-31`): connection role isn't the migration-table owner; the one-time bootstrap is already consumed; an admin already exists; the user doesn't exist with that exact email **and** UUID **and** a verified mailbox; the matching profile row is missing. Each is a distinct message and exit code 1, nothing written.
4. **Single use.** A marker row records consumption inside the same transaction as the grant; a second run fails.
5. **Only on `pgsql_migrate`.** The command refuses to run on the runtime connection; the runtime role cannot promote an admin or read bootstrap state (the trigger and grants from 2.1; ledger #66 case 12, runtime half already ported).
6. **No auto-run.** Not in any deploy hook, scheduler or seeder; arch test greps `composer.json` scripts and `Dockerfile`/CI for the command name.
7. **Audit.** Writes an `admin.bootstrapped` audit row with the user id only.

## Inventory scope
A-12. Ledger #66 case 12 (CLI half), the bootstrap script tests if any.

## Next.js source read
`apps/web/scripts/bootstrap-admin.mjs:1-41`; `integration.test.ts:220`; brownfield §1 (admin), `data-model-and-ops.md` (bootstrap state).

## Behaviour notes
- "prepare != grant": the mailbox is verified by 4.6's reset link in between.
- Next's script is Node against raw SQL; the Laravel command uses `DB::connection('pgsql_migrate')`.

## Laravel guidance
`app/Console/Commands/BootstrapAdmin.php`; use the connection from `DatabaseRoles`. Pest tests use the migrate connection in the test DB.

## Planned deviations from Next.js
None.

## Tasks
1. Command (AC 1–4, 7). 2. Role/arch checks (AC 5, 6). 3. Tests, record, inventory, ledger #66, sprint-status.

## Test plan
| Layer | Test | Covers |
|---|---|---|
| L2 | `tests/Feature/Console/BootstrapAdminTest.php`: AC 1–4, 7 | A-12 |
| L3 `@pg-race` | `tests/Concurrency/BootstrapSingleUseTest.php`: two parallel grants, one wins | A-12 |
| Arch | `tests/Arch/AuthTest.php`: AC 5, 6 | A-12 |

## Definition of done (Laravel-only, `epics.md:35`)
`bin/test` green (Pint, Larastan level 9, Pest) with the tests below; the Conversion record filled; inventory Laravel/Tests columns, ledger rows, `sprint-status.yaml` → `review`, and one line each in DECISIONS / RISKS / ASSUMPTIONS where something was decided. No `apps/web` change. L4/L5 parity is run by the gate named in the header only where the story says so.

## Open questions (with recommendations)
1. **Marker table.** Does 2.1 already have the bootstrap-state table? *Recommendation:* use it; if absent, report rather than add a migration (owner step).
2. **Owner items: none.**

**Decided (owner, 2026-11-23):** Q1 (use the 2.1 bootstrap-state table, no migration) as built.

## Conversion record

### Inventory scope
A-12. Ledger #66 case 12 CLI half (no row change made).
### Next.js source read
`scripts/bootstrap-admin.mjs:1-41`.
### Behaviour notes
Prepare: owner check, marker check, create unverified user and profile (insert-or-ignore on email), print the UUID. Grant: needs ack and UUID; verified user with exact email and id, no admin, profile updated, marker `id=1` and audit row in the same transaction, under one advisory lock.
### Laravel implementation
`app/Console/Commands/BootstrapAdmin.php` on `pgsql_migrate`; refuses `--database` other than the migrate connection. Marker table `auth_admin_bootstrap` already exists from 2.1 (open question 1: no migration needed).
### Deviations from Next.js
| Behaviour | Next.js | Laravel | Why | Decision ref |
|---|---|---|---|---|
| Refusals | One generic message | A distinct message per cause | AC 3 | |
| Audit type | `auth.operator_admin_bootstrap` | `admin.bootstrapped`, payload `{userId}` | AC 7 | |
### Tests
| Layer | Test file / title | Inventory IDs |
|---|---|---|
| L2 | `tests/Feature/Console/BootstrapAdminTest.php` | A-12 |
| Arch | `tests/Arch/AuthTest.php` (no auto-run) | A-12 |
### Test evidence
`bin/test` green: Pint, Larastan, Pest 1947 passed (5531 assertions). L3 race test written after critic B3 (`BootstrapSingleUseTest`, race child mode `bootstrap`): passes; Pest 1960 passed after 4.9b fixes.
### Gotchas
Do not add the lock to `Locks` (LocksTest pins three). Pest helper names are global: `owner()` is taken.
### Docs updated
Inventory A-12, DECISIONS, RISKS, sprint-status.
### Open items
The audit-type change is a deviation the owner has not seen: propose a DV row.

**L4 parity run (2026-11-23, workbench/parity-4-5):** @auth 37 tests: Next 37 pass; Laravel 15 pass / 11 fail / 11 not reached. @checkout 28: Next 28 pass; Laravel 1 / 20 / 7. @entitlements 10: Next 10 pass; Laravel 0 / 10 / 0. Failures are the unwired Stripe/Postmark/Mailpit infra on the Laravel stack and not-yet-built pages/routes, listed with titles in `docs/laravel-migration/parity-run-2026-11-23.md`. This story's parity tests are not shown to match: stays at `review`.
