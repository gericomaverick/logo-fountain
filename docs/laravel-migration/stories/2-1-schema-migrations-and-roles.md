# Story 2.1: Schema migrations and roles

**Status:** ready-for-dev (2026-11-21) · **DoD variant:** Laravel-only · **Epic:** 2 (first story; 2.2–2.7 depend on it) · **Covers:** X-15, A-19, O-06, ADR-012, ADR-013 (+ ADR-009 consequence, ADR-011 column) · **Gate:** `@pg-race` (Pest L3, `tests/Concurrency`) plus Pest · **After:** 1.1a (done)

> Created with BMAD `create-story`. The BMAD workflow files are not reachable on this machine (`_bmad/bmm` is a symlink to `/home/openclaw/...`, which doesn't exist here), so the structure follows the existing story files and `templates/story-conversion-record.md`. Docs only: no portal code was written for this file.

## Story
As the portal, I need the whole Next.js data model as Laravel migrations, owned by the migrate role, with a DML-only runtime role and the database-level guards (admin-flag trigger, email checks, revoked operator tables), so every later story builds on a schema that matches Next row for row and can't be weakened by an application bug.

## Acceptance criteria
From `epics.md` §2.1 (the minimum), expanded into testable items. Each item names the test that proves it (see *Test plan*).

1. **Schema parity (X-15, ADR-012).** After `php artisan migrate:fresh --database=pgsql_migrate`, the database contains exactly the tables in the *Schema checklist* below (the 22 portal tables + the kept framework tables + `migrations`), with every column's name, type, nullability and default, every PK, unique and secondary index, and every FK with its `ON DELETE` **and** `ON UPDATE` action as listed. → `SchemaContractTest`.
2. **UUID keys (X-15).** Every domain primary key is `uuid` except the four listed exceptions (`stripe_events.event_id` text, `auth_proofs.token_hash` char(64), `auth_admin_bootstrap.id` integer, `auth_rate_limits.key` char(64)) and the framework tables. `profiles.id` has no default and is an FK to `users.id` (a profile's id *is* the user's id). No table has row-level security enabled. → `SchemaContractTest`, `RuntimeRoleTest`.
3. **Admin-flag trigger (A-19).** Given the runtime connection (`pgsql`, and `pgsql_limits`, same role):
   - `INSERT` into `profiles` with `is_admin = true` raises `operator-owned admin flag`;
   - `UPDATE` changing `is_admin` (false→true **and** true→false) raises;
   - `INSERT … ON CONFLICT (id) DO UPDATE` with `is_admin = true` raises **even when the row already exists with `is_admin = true`** (the F-17 mechanism: BEFORE INSERT fires before conflict resolution);
   - `INSERT` with `is_admin = false` (or omitted), and `UPDATE` of other columns on an admin's row, or `UPDATE` setting `is_admin` to its current value, succeed.
   Given the migrate connection (table owner), insert-as-admin, promote and demote succeed. → `AdminFlagTriggerTest`.
4. **Email checks (A-19).** `users.email` and `profiles.email` reject any value where `email <> lower(btrim(email))` (upper case, leading/trailing space) with SQLSTATE `23514`, from either role; a normalised value is accepted. → `EmailNormalisationConstraintTest`.
5. **Grants (O-06, ADR-013).** After migrations, the grants step (`php artisan db:grants`, running `ops/postgres/runtime-grants.sql` as the migrate role) leaves the runtime role with: `SELECT, INSERT, UPDATE, DELETE` on every other table, `USAGE, SELECT` on sequences, **no** privilege at all on `migrations` (and its sequence) and `auth_admin_bootstrap`, no `CREATE` on schema `public` or the database, ownership of nothing, not superuser / createdb / createrole / bypassrls. Running the grants step twice is a no-op. → `RuntimeRoleTest`, `GrantsCommandTest`.
6. **Two roles only (ADR-013, ADR-009).** `pgsql` and `pgsql_limits` connect as the **same** runtime role; `pgsql_migrate` is a different role on the same host/port/database. In production, boot fails if `pgsql_limits` differs from `pgsql` in host, port, database or username (extends the 1.3 validator; closes 1.3's open item). → `RuntimeRoleTest`, `tests/Unit/DatabaseRolesTest.php`, `tests/Feature/ConfigBootValidationTest.php`.
7. **FK behaviours match the brownfield table.** Deleting a project cascades to all 12 project-owned tables; deleting a concept nulls `revision_requests.concept_id` and cascades `concept_comments`; deleting a client cascades memberships, projects and orders; deleting a profile that authored anything is refused (SQLSTATE `23503`) for each of the 7 restrict FKs, otherwise it cascades memberships and read states and nulls `audit_events.actor_id`; deleting a user with a profile is refused; deleting a user cascades `auth_proofs` (and `sessions`). → `ForeignKeyBehaviourTest`.
8. **Dev and test stacks use the same path as production.** `docker/php/init.sh` runs `migrate --database=pgsql_migrate` then `db:grants`; the Pest database harness migrates `portal_test` as the migrate role and applies the grants before any test. `bin/test` and the CI `laravel-ci` job (including the now non-empty Concurrency suite) are green. → CI, `bin/test`.

## Inventory scope
- **X-15** (`01-feature-inventory.md:150`): UUID PKs, `Profile.id` = auth user id. Completes here → `Verified` (Pest schema tests; destination recorded in `tests/parity/fixtures/laravel-only-destinations.json:16`).
- **A-19** (`01-feature-inventory.md:35`): admin-flag trigger + email checks. Completes here → `Verified` (L3; `laravel-only-destinations.json:6`).
- **O-06** (`01-feature-inventory.md:161`): least-privilege runtime grants. Completes here for the script and dev/test wiring → `Verified`; running it in the Forge deploy script is Epic 9 (note it in the row).
- **ADR-012 / ADR-013**: implemented; record consequences in the ADR files (see *Docs to update*).
- Not in scope: DV-14 (F-17 fix: the comment and message actions in 6.x/7.x must never write `is_admin`); A-12 `admin:bootstrap` (4.9a); X-06 rate-limit logic (2.5); X-17 version guard logic (2.4).

## Next.js source read
- `apps/web/prisma/schema.prisma` (383 lines, all 24 models)
- `apps/web/prisma/migrations/20260901000000_portable_core/migration.sql` (tables `:5-297`, indexes `:299-432`, FKs `:434-519`, checks `:522-524`, trigger `:525-538`)
- `apps/web/prisma/migrations/20261018000000_brief_drafts/migration.sql` (`ProjectBriefDraft`, `:11-27`)
- `apps/web/ops/postgres/runtime-grants.sql` (`:4-18`) and `ops/postgres/README.md` (role attributes, provisioning order)
- `apps/web/scripts/isolated-postgres-test.mjs:75-89` (role creation, migrate, grants, drift check)
- `apps/web/scripts/bootstrap-admin.mjs:15-33` (owner check, bootstrap row `id = 1`)
- `apps/web/src/lib/postgres.integration.test.ts:30-45` (runtime role and RLS/UUID probes)
- `apps/web/src/lib/auth.postgres.integration.test.ts:220-223` (runtime can't promote or read bootstrap state)
- `apps/web/src/app/api/projects/[id]/messages/route.ts:70-82`, `…/concepts/[conceptId]/comments/route.ts:76` (F-17 upsert)
- `apps/web/src/lib/concept-upload-request.ts:10` (how `payload.requestKey` is queried), `lib/checkout-fulfillment.ts:147-151` (app-side email normalisation)
- Docs: `brownfield/data-model-and-ops.md` §1–§3, §5; `brownfield/api-client.md:54` (F-17); `brownfield/index.md:39`; `brownfield/auth-and-security.md:11,119`; `architecture.md` §3 (ADR-009/011/012/013), §4.3, §4.6, §5, §6; ADR-009, 011, 012, 013, 005; `01-feature-inventory.md:35,150,161,184`; `02-test-strategy.md:29,98`; `test-port-ledger.md:74,104`; `project-context.md:57-59,84`; `apps/portal/AGENTS.md` §3, §8; story 1.3 (*Open items*).
- Portal as built (Epic 1): `compose.yaml` (postgres 18.7, init volume), `docker/postgres/01-roles.sh`, `docker/php/init.sh`, `config/database.php:87-132`, `database/migrations/0001_01_01_00000{0,1,2}_*.php`, `app/Support/DatabaseRoles.php`, `app/Providers/ConfigValidationServiceProvider.php`, `phpunit.xml`, `tests/Pest.php`, `tests/TestCase.php`, `tests/Feature/DatabaseRolesTest.php`, `.github/workflows/portal.yml` (laravel-ci Pest and Concurrency steps).

## Behaviour notes (written before converting)

### Tables and columns (Next)
- 24 Prisma models; Laravel ports 22 of them. `AuthAccount` (only `providerId="credential"` used; the password moves to `users.password`) and `AuthVerification` (Better Auth internal) are **not** ported (`brownfield/data-model-and-ops.md:30-31`). `AuthUser` → `users`, `AuthSession` → Laravel's `sessions`.
- Every Next string column is `TEXT` (no length limits in the DB; limits like the 2000-char message body are app-side, `messages/route.ts:68`). Laravel `string()` would be `varchar(255)` and silently cap them → use `text()` everywhere Next has `TEXT`.
- Every Next timestamp is `TIMESTAMP(3)` **without time zone** (ms precision). `createdAt` has `DEFAULT CURRENT_TIMESTAMP` (`migration.sql:12` etc.); `updatedAt` is `NOT NULL` with **no** default (Prisma `@updatedAt` sets it in the app). `StripeEvent.createdAt` is `NOT NULL` with no default (it stores the Stripe event time, `:205`). Laravel's `timestamps()` creates **nullable** `timestamp(0)` columns, so it can't be used as is (see *Laravel guidance*).
- Primary keys are app-generated UUIDs with no DB default (`migration.sql:6` etc., Prisma `@default(uuid())` is client-side). `Profile.id` has no default at all: it's always the `AuthUser.id` (`schema.prisma:13,22`).
- Status-like columns are free text, validated in code (`brownfield/data-model-and-ops.md:7`).
- `AuthAdminBootstrap.id` is a plain `INTEGER` PK (not serial); the bootstrap CLI always writes `id = 1` (`bootstrap-admin.mjs:32`), so the PK makes it single-use. No CHECK constraint exists.

### FKs
- 29 FKs survive the port (31 in Next minus `AuthSession.userId` and `AuthAccount.userId`, which belong to dropped/replaced tables). **Every** Next FK is `ON UPDATE CASCADE` (`migration.sql:435-519`); the brownfield table mentions only `ON DELETE`.
- `ON DELETE`: 20 × CASCADE, 7 × RESTRICT (all "authored by a profile" columns plus `Profile.id → AuthUser`), 2 × SET NULL (`RevisionRequest.conceptId`, `AuditEvent.actorId`). Next uses `RESTRICT`, not the PG default `NO ACTION` (`pg_constraint.confdeltype` `r`, not `a`); Laravel's `foreign()` without an action emits `NO ACTION`, so every restrict FK must call `restrictOnDelete()` explicitly.
- `AuthSession.userId → AuthUser` was `ON DELETE CASCADE` (`:513`); Laravel's `sessions.user_id` has no FK by default (open question 7).
- `AuthAdminBootstrap.userId` has **no** FK (`:282-288`).

### Indexes
- Exactly the set in `migration.sql:299-432` (+ `brief_drafts:21`), listed per table in the checklist. The brownfield table lists only some secondary indexes (it omits e.g. `Message_threadId/projectId/senderId`, `ConceptComment_authorId`, `AuditEvent_actorId`, all the single-column `projectId` indexes); the checklist below is from the SQL.
- Laravel additions (ADR-012, `architecture.md:96`): a jsonb **expression index** on `audit_events ((payload->>'requestKey'))`. Next queries it as Prisma `payload: { path: ["requestKey"], equals: key }` (`concept-upload-request.ts:10`), which compiles to a `#>`/jsonb comparison, not `->>`; the Laravel lookup (7.5a) must use `payload->>'requestKey' = ?` or the index is never used.

### Database-level rules (`migration.sql:522-538`)
- `AuthUser_normalized_email` and `Profile_normalized_email`: `CHECK (email = lower(btrim(email)))`. `btrim` with no second argument strips **spaces only**, so `'a@x.com\t'` passes the DB check (the app normaliser `trim().toLowerCase()`, `checkout-fulfillment.ts:149`, strips tabs too). Pin this in a test; don't "improve" it.
- Function `protect_operator_admin_flag()` (plpgsql) + trigger `protect_operator_admin_flag BEFORE INSERT OR UPDATE ON "Profile" FOR EACH ROW`: if `(TG_OP='INSERT' AND NEW."isAdmin") OR (TG_OP='UPDATE' AND NEW."isAdmin" IS DISTINCT FROM OLD."isAdmin")` and `current_user <> pg_get_userbyid((SELECT relowner FROM pg_class WHERE oid=TG_RELID))` → `RAISE EXCEPTION 'operator-owned admin flag'` (SQLSTATE `P0001`). The check is "current user owns the table", not "is the migrate role": it holds as long as migrations run as `pgsql_migrate`.
- **F-17** (`brownfield/api-client.md:54`, DV-14 `01-feature-inventory.md:184`): Next's message and comment routes call `prisma.profile.upsert({ create: { isAdmin: auth.admin }, update: { isAdmin: auth.admin } })` (`messages/route.ts:70-82`). Prisma runs it as `INSERT … ON CONFLICT DO UPDATE`; the BEFORE INSERT trigger fires on the proposed row before the conflict is detected, so an admin (`isAdmin = true`) always gets the exception → 500, even though the stored value wouldn't change. The trigger is correct and is kept unchanged; the fix (DV-14) is that Laravel never writes `is_admin` from the runtime role. Pin the upsert case in `AdminFlagTriggerTest` so the reason is recorded.

### Roles and grants (`brownfield/data-model-and-ops.md` §2, `runtime-grants.sql`, `ops/postgres/README.md`)
- Two roles: runtime (DML only) and migration (owns database, schema and tables). Next's runner creates both as `LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS NOINHERIT`, the database `OWNER lf_migration`, `REVOKE ALL ON DATABASE … FROM PUBLIC`, `GRANT CONNECT … TO lf_runtime` (`isolated-postgres-test.mjs:75-79`).
- Grants script, run as the migration owner after migrations (`runtime-grants.sql`): `REVOKE CREATE ON SCHEMA public FROM PUBLIC`; `GRANT USAGE ON SCHEMA public`; DML on all tables; `USAGE, SELECT` on all sequences; the same two as `ALTER DEFAULT PRIVILEGES`; `REVOKE ALL` on the migrations-history table (if present) and on `"AuthAdminBootstrap"`. The comment at `:16-17` is a rule: **any future operator table must explicitly revoke its default runtime grants.** The runtime role name is hard-coded (`lf_runtime`).
- The script is idempotent (GRANT/REVOKE repeat safely). README: re-apply after every migration; never run migrations from the runtime process.
- Next proves it with `postgres.integration.test.ts:30-45`: runtime `rolsuper/rolcreatedb/rolcreaterole/rolbypassrls` all false; no schema or database `CREATE`; owns no table; `CREATE TABLE` and `CREATE ROLE` fail; reading the migrations table fails; no table has `relrowsecurity`/`relforcerowsecurity`; `Profile.id` is `uuid`. And `auth.postgres.integration.test.ts:220-223`: runtime can't set `isAdmin`, can't read `AuthAdminBootstrap`.
- Drift: Next's runner fails on any difference between the migrated DB and `schema.prisma` (`prisma migrate diff … --exit-code`, `isolated-postgres-test.mjs:89`). Laravel's equivalent is the schema contract test.

### Portal as built by Epic 1 (what this story changes)
- `config/database.php:87-132`: `pgsql` (runtime, `DB_USERNAME`), `pgsql_migrate` (`DB_MIGRATE_USERNAME`, comment "Only migrations, grants and admin:bootstrap"), `pgsql_limits` (same env as `pgsql`: **already** the runtime role). All `search_path => 'public'`.
- `docker/postgres/01-roles.sh`: creates `portal_migrate` and `portal_runtime` with default attributes (so `INHERIT`, unlike Next's `NOINHERIT`), databases `portal` and `portal_test` owned by `portal_migrate`, `REVOKE CREATE ON SCHEMA public FROM PUBLIC`, schema owned by migrate, and `ALTER DEFAULT PRIVILEGES FOR ROLE portal_migrate` granting runtime DML + sequences. It does not revoke database `CONNECT`/`TEMP` from PUBLIC. Because of the default privileges, **every** table the migrate role creates, including `migrations` and `auth_admin_bootstrap`, is runtime-writable until the grants step revokes it.
- `docker/php/init.sh:8`: `php artisan migrate --database=pgsql_migrate --force` on the dev DB (`portal`); no grants step.
- Skeleton migrations: `users` with a **bigint** id, `email_verified_at`, non-null `password`, `remember_token`; `password_reset_tokens`; `sessions` with `foreignId('user_id')` (bigint); `cache`, `cache_locks`, `jobs`, `job_batches`, `failed_jobs`. Nothing is deployed, so editing these files is safe (dev volumes need `migrate:fresh`).
- `phpunit.xml`: `DB_CONNECTION=pgsql`, `DB_DATABASE=portal_test` (both roles read `DB_DATABASE`). **Nothing migrates `portal_test` yet**; no test uses a table. `project-context.md:57` says L2 tests use `RefreshDatabase`, but `RefreshDatabase` runs `migrate:fresh` on the **default** (runtime) connection, which can't do DDL → the harness below is required.
- `tests/Feature/DatabaseRolesTest.php` (1.1a): distinct roles, runtime DDL refused, migrate-created table usable by runtime. Keep it.
- `app/Support/DatabaseRoles.php` + `ConfigValidationServiceProvider`: production boot fails unless `pgsql`/`pgsql_migrate` share host/port/database with distinct users. `pgsql_limits` is not checked (1.3 open item).
- CI `portal.yml` laravel-ci: runs `--testsuite=Unit,Feature,Arch`, then the Concurrency suite **only if** `tests/Concurrency/*Test.php` exists (Pest exits 1 on an empty suite). This story makes it non-empty, so that step starts running.

## Schema checklist (port every row)
Legend: **NN** not null; **ts** = `timestamp(3) without time zone` (open question 1); `now` = `DEFAULT CURRENT_TIMESTAMP`; FK actions written `delete/update` (every FK is `…/cascade` on update unless noted). Index names may follow Laravel's convention; parity is on definitions, not names. Check and trigger names are fixed.

| # | Laravel table (Next model) | Columns (type, null, default) | PK / unique / indexes | FKs (on delete / on update) | Notes |
|---|---|---|---|---|---|
| 1 | `users` (AuthUser) | `id` uuid NN (no default); `name` text NN; `email` text NN; `email_verified` boolean NN default false; `image` text null; **`password` text null** (new; bcrypt, ADR-006); `credential_version` integer NN default 0; `created_at` ts NN now; `updated_at` ts NN | PK id; unique email | (referenced by profiles, auth_proofs, sessions) | CHECK **`users_normalized_email`** `email = lower(btrim(email))`. Remove skeleton `email_verified_at`, `remember_token` (OQ 2, 4). Password nullable: provisioned purchasers have no password until setup |
| 2 | `sessions` (AuthSession → Laravel) | `id` varchar PK; `user_id` **uuid** null; `ip_address` varchar(45) null; `user_agent` text null; `payload` text NN; `last_activity` integer NN | PK id; idx user_id; idx last_activity | user_id → users.id cascade/cascade (OQ 7) | Absolute cap lives in the payload (`auth.issued_at`, ADR-005), no `created_at` column (OQ 3) |
| 3 | `profiles` (Profile) | `id` uuid NN (no default); `email` text NN; `full_name` text null; `first_name` text null; `last_name` text null; `is_admin` boolean NN default false; `created_at` ts NN now; `updated_at` ts NN | PK id; unique email | id → users.id **restrict**/cascade | CHECK **`profiles_normalized_email`**; function + trigger **`protect_operator_admin_flag`** (raw SQL, message `operator-owned admin flag`) |
| 4 | `clients` (Client) | `id` uuid; `name` text NN; `slug` text NN; `billing_email` text null; `vat_number` text null; `created_at` ts NN now; `updated_at` ts NN | PK id; unique slug | | `vat_number` unused (DV-3) but kept |
| 5 | `client_memberships` (ClientMembership) | `id` uuid; `client_id` uuid NN; `user_id` uuid NN; `role` text NN; `created_at` ts NN now | PK; unique (client_id, user_id); idx user_id | client_id → clients cascade; user_id → profiles cascade | no `updated_at` |
| 6 | `projects` (Project) | `id` uuid; `client_id` uuid NN; `status` text NN; `package_code` text NN; **`version` integer NN default 0** (new, ADR-011; OQ 6); `created_at` ts NN now; `updated_at` ts NN | PK; idx client_id; idx status | client_id → clients cascade | |
| 7 | `project_briefs` (ProjectBrief) | `id` uuid; `project_id` uuid NN; `version` integer NN; `answers` jsonb NN; `created_by` uuid NN; `created_at` ts NN now | PK; unique (project_id, version); idx project_id; idx created_by | project_id → projects cascade; created_by → profiles **restrict** | no `updated_at` |
| 8 | `project_brief_drafts` (ProjectBriefDraft) | `project_id` uuid NN; `answers` jsonb NN; `updated_by` uuid NN; `updated_at` ts NN (no default) | **PK project_id**; idx updated_by | project_id → projects cascade; updated_by → profiles **restrict** | no `id`, no `created_at`. Runtime-writable (not an operator table, `brief_drafts/migration.sql:6-8`) |
| 9 | `project_orders` (ProjectOrder) | `id` uuid; `project_id` uuid NN; `client_id` uuid NN; `status` text NN; `currency` text NN; `total_cents` integer NN; `stripe_checkout_session_id` text null; `stripe_payment_intent_id` text null; `campaign_slug` text null; `created_at` ts NN now; `updated_at` ts NN | PK; unique stripe_checkout_session_id; unique stripe_payment_intent_id; idx project_id; idx client_id | project_id → projects cascade; client_id → clients cascade | the two uniques are the paid-session dedupe boundary (`postgres.integration.test.ts:82`) |
| 10 | `project_entitlements` (ProjectEntitlement) | `id` uuid; `project_id` uuid NN; `key` text NN; `limit_int` integer null; `consumed_int` integer NN default 0; `reserved_int` integer NN default 0; `created_at` ts NN now; `updated_at` ts NN | PK; unique (project_id, key); idx project_id | project_id → projects cascade | null limit = unlimited |
| 11 | `concepts` (Concept) | `id` uuid; `project_id` uuid NN; `number` integer NN; `status` text NN; `notes` text null; `created_at` ts NN now; `updated_at` ts NN | PK; unique (project_id, number); idx project_id; idx status | project_id → projects cascade | |
| 12 | `file_assets` (FileAsset) | `id` uuid; `project_id` uuid NN; `kind` text NN; `bucket` text NN; `path` text NN; `mime` text NN; `size` integer NN; `notes` text null; `uploaded_by` uuid NN; `created_at` ts NN now; `updated_at` ts NN | PK; idx project_id; idx uploaded_by | project_id → projects cascade; uploaded_by → profiles **restrict** | `size` int4 is enough (final ZIP cap 95 MB, DV-13) |
| 13 | `message_threads` (MessageThread) | `id` uuid; `project_id` uuid NN; `created_at` ts NN now; `updated_at` ts NN | PK; unique project_id | project_id → projects cascade | |
| 14 | `messages` (Message) | `id` uuid; `thread_id` uuid NN; `project_id` uuid NN; `sender_id` uuid NN; `kind` text NN default `'user'`; `body` text NN; `created_at` ts NN now | PK; idx thread_id; idx project_id; idx sender_id; idx created_at | thread_id → message_threads cascade; project_id → projects cascade; sender_id → profiles **restrict** | no `updated_at` |
| 15 | `revision_requests` (RevisionRequest) | `id` uuid; `project_id` uuid NN; `concept_id` uuid null; `status` text NN; `requested_by` uuid NN; `body` text NN; `created_at` ts NN now; `updated_at` ts NN | PK; idx project_id; idx concept_id; idx requested_by; idx status | project_id → projects cascade; concept_id → concepts **set null**; requested_by → profiles **restrict** | |
| 16 | `concept_comments` (ConceptComment) | `id` uuid; `project_id` uuid NN; `concept_id` uuid NN; `author_id` uuid NN; `body` text NN; `created_at` ts NN now | PK; idx (project_id, created_at); idx (concept_id, created_at); idx author_id | project_id → projects cascade; concept_id → concepts cascade; author_id → profiles **restrict** | no `updated_at` |
| 17 | `audit_events` (AuditEvent) | `id` uuid; `project_id` uuid null; `actor_id` uuid null; `type` text NN; `payload` jsonb NN; `created_at` ts NN now | PK; idx (project_id, created_at); idx (type, created_at); idx actor_id; **new** expression idx `((payload->>'requestKey'))` | project_id → projects cascade; actor_id → profiles **set null** | idempotency/receipt store (`email_sent:*`, `concept_upload_request`) |
| 18 | `project_read_states` (ProjectReadState) | `id` uuid; `user_id` uuid NN; `project_id` uuid NN; `last_seen_messages_at` ts null; `last_seen_concepts_at` ts null; `created_at` ts NN now; `updated_at` ts NN | PK; unique (user_id, project_id); idx project_id | user_id → profiles cascade; project_id → projects cascade | |
| 19 | `stripe_events` (StripeEvent) | `event_id` text NN; `type` text NN; `created_at` ts NN (**no default**); `processed_at` ts null | PK event_id | | `type` also holds the `processing:` lease marker |
| 20 | `auth_proofs` (AuthProof) | `token_hash` char(64) NN; `user_id` uuid NN; `kind` text NN; `credential_version` integer NN; `expires_at` ts NN | PK token_hash; idx user_id | user_id → users cascade | no timestamps |
| 21 | `auth_admin_bootstrap` (AuthAdminBootstrap) | `id` integer NN (**not** serial/identity); `user_id` uuid NN; `created_at` ts NN now | PK id | **none** | operator table: runtime `REVOKE ALL` |
| 22 | `auth_rate_limits` (AuthRateLimit) | `key` char(64) NN; `hits` integer NN; `window_start` ts NN | PK key; idx window_start | | used only via `pgsql_limits` (2.5) |
| F | framework (kept as is) | `cache`, `cache_locks`, `jobs`, `job_batches`, `failed_jobs` | as skeleton | | runtime DML (queue, ADR-019) |
| M | `migrations` (Laravel) | as framework | | | runtime `REVOKE ALL` (table and `migrations_id_seq`) |
| — | **dropped** | `password_reset_tokens` (skeleton); AuthAccount, AuthVerification (Next) | | | OQ 4 |

Totals: 22 portal tables (20 new, `users` and `sessions` reshaped), 5 framework tables + `migrations`. 29 ported FKs (20 cascade, 7 restrict, 2 set null; all on-update cascade) + `sessions.user_id`. 2 check constraints, 1 trigger function + 1 trigger, 1 expression index.

## Laravel guidance (for the dev agent)
- **Migration files.** Edit `0001_01_01_000000_create_users_table.php` in place (users uuid, sessions uuid user_id, drop `password_reset_tokens`); add new migrations dated `2026_11_21_*` in dependency order: profiles (+ check + trigger) → clients/memberships → projects and project children → messaging → concepts, revisions, comments → audit (+ expression index) → read states → stripe events → auth tables. Grouping into a few files is fine; one table per file is fine. Each has a working `down()`.
- **Columns.** `uuid('id')->primary()` (no default; `HasUuids` v7 is 2.2). `text()` for every Next `TEXT`. `timestamp('created_at', 3)->useCurrent()` and `timestamp('updated_at', 3)` (NOT NULL, no default) instead of `timestamps()`. `jsonb()`. `char('token_hash', 64)->primary()`. `integer('id')->primary()` for `auth_admin_bootstrap` (not `increments`).
- **FKs.** `foreignUuid(...)->constrained(<table>)` + `->cascadeOnDelete()` / `->restrictOnDelete()` / `->nullOnDelete()` **and** `->cascadeOnUpdate()` on every one. Never rely on the default action. Laravel creates no index for an FK column: add each listed index explicitly (and none extra, so the contract test stays exact).
- **Raw SQL** (in the profiles/users migrations, via `DB::statement`): the two `CHECK` constraints by name; `CREATE OR REPLACE FUNCTION protect_operator_admin_flag() …` (body as Next, with `NEW.is_admin` / `OLD.is_admin`), then `DROP TRIGGER IF EXISTS` + `CREATE TRIGGER protect_operator_admin_flag BEFORE INSERT OR UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION protect_operator_admin_flag()`. `CREATE OR REPLACE` matters: `migrate:fresh` drops tables but **not functions**, so a plain `CREATE FUNCTION` fails on the second run. `down()` drops trigger and function. Expression index: `CREATE INDEX audit_events_payload_request_key_index ON audit_events ((payload->>'requestKey'))`.
- **Grants.** `ops/postgres/runtime-grants.sql` (path per `architecture.md` §6), a port of Next's file with the runtime role as a placeholder, plus: `REVOKE ALL` on `migrations` and its sequence, and on `auth_admin_bootstrap`; keep the "future operator tables must revoke" comment. `php artisan db:grants` (new `app/Console/Commands/DbGrants.php`): always on `pgsql_migrate` (refuses any `--database` other than it), takes the runtime role from `config('database.connections.pgsql.username')`, substitutes it as a quoted identifier (never string-concatenated raw), runs the file in one transaction, prints nothing secret. Wire it into `docker/php/init.sh` after `migrate`, and document it for the Forge deploy script (Epic 9) in `apps/portal/AGENTS.md` §2/§3.
- **Dev roles.** Align `docker/postgres/01-roles.sh` with Next's runner: `NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS NOINHERIT`, `REVOKE ALL ON DATABASE … FROM PUBLIC`, `GRANT CONNECT … TO portal_runtime` for both databases (OQ 10). Existing dev volumes only run init scripts once: note `docker compose down -v` in the story record and the portal README.
- **Validator.** Extend `DatabaseRoles::assertValid` (or add `assertLimitsUsesRuntime`) so production boot fails when `pgsql_limits` differs from `pgsql` in host, port, database or username. Message without credentials, e.g. `pgsql_limits must use the runtime role on the same host, port and database as pgsql (ADR-009)`.
- **Test DB harness** (new `tests/Support/MigratesAsOwner.php` or in `TestCase`): use `RefreshDatabase` but override `migrateFreshUsing()` to add `'--database' => 'pgsql_migrate'`, then call `db:grants` once after the fresh migrate (hook `afterRefreshingDatabase()`); set `$connectionsToTransact = ['pgsql']`. Concurrency tests must **not** use the transaction wrapper (other connections/processes can't see uncommitted rows): use `DatabaseTruncation` with `$connectionsToTruncate = ['pgsql_migrate']` (exclude `migrations`), or explicit cleanup through `pgsql_migrate`. Update `project-context.md:57` and AGENTS.md §8 with the rule "never `migrate` on the default connection, in tests too".
- **No models, factories or seeders** here (2.2, 2.6). `UserFactory` (skeleton) will break on the uuid/`email_verified` change: delete it or leave it untouched and unused, and say which in the record (2.2 owns factories).

## Planned deviations from Next.js (confirm in the Conversion record)
| Behaviour | Next.js | Laravel | Why | Ref |
|---|---|---|---|---|
| Credential storage | `AuthAccount.password` (provider `credential`) | `users.password` | No Better Auth | `brownfield/data-model-and-ops.md:28,30` |
| Verification tokens | `AuthVerification` | none (`auth_proofs` only) | Better Auth internal | same `:31` |
| Sessions table | `AuthSession` (uuid id, token, expiresAt) | Laravel `sessions` (string id, payload) | Laravel session guard | ADR-004/005 |
| Optimistic version | `Project.updatedAt` | + `projects.version` int | Explicit guard | ADR-011 |
| requestKey lookup | no index | expression index | Receipt lookups | ADR-012 |
| Grants script | hard-coded `lf_runtime`, manual | artisan `db:grants`, role from config, run on every deploy and in dev/test | Automate O-06 | ADR-013, OQ 5 |
| Migrations history | `_prisma_migrations` | `migrations` (+ sequence revoked) | Framework | `brownfield/data-model-and-ops.md:47` |
| Role validator | `database-target.ts` (2 URLs) | + `pgsql_limits` must equal runtime | Third connection | ADR-009 consequence |
None of these is visible to the parity suite.

## Tasks
1. **Users and sessions** (AC 1, 2): edit `0001_01_01_000000_create_users_table.php` per checklist rows 1–2; drop `password_reset_tokens`; handle `database/factories/UserFactory.php`.
2. **Portal tables** (AC 1, 2, 7): migrations for checklist rows 3–22 with exact columns, defaults, indexes and FK actions.
3. **Raw SQL guards** (AC 3, 4): the two checks, the trigger function and trigger (idempotent), the expression index; `down()` for each.
4. **Grants** (AC 5): `ops/postgres/runtime-grants.sql`; `app/Console/Commands/DbGrants.php`; wire into `docker/php/init.sh`; idempotency.
5. **Dev roles** (AC 5): update `docker/postgres/01-roles.sh` (attributes, database CONNECT); verify on a fresh volume.
6. **Validator** (AC 6): `pgsql_limits` check in `app/Support/DatabaseRoles.php`; Unit + boot (child `php artisan` process in production, per AGENTS.md §8) tests.
7. **Test harness** (AC 8): owner-migrating `RefreshDatabase` variant + truncation variant for `tests/Concurrency`; bind in `tests/Pest.php`.
8. **Tests** per *Test plan*; schema manifest fixture `tests/Fixtures/schema/expected.php` (or `.json`) generated by hand from the checklist, not dumped from the DB.
9. **Run**: fresh stack (`docker compose down -v && docker compose up -d --build`), `bin/test` (all suites incl. Concurrency), confirm the CI laravel-ci job runs the Concurrency step green; run `migrate:fresh --database=pgsql_migrate` twice and `migrate:rollback` once.
10. **Docs**: story Conversion record; inventory X-15, A-19, O-06 (Laravel/Tests columns, `Verified`); ledger rows #66 (partial) and #96 (partial); ADR-012/013 *Consequences*; `apps/portal/AGENTS.md` §3 (grants step, `db:grants`, trigger rule, harness) and §8 gotchas; `project-context.md:57,84`; portal README (fresh-volume note); `sprint-status.yaml`; `handoff.md`.

## Test plan
Gate `@pg-race` = Pest L3 in `tests/Concurrency/` (own testsuite, run serially; tag each file `->group('pg-race')`). The rest is Pest L1/L2. No parity tests exist or are needed (the IDs' destinations are Laravel-only, `laravel-only-destinations.json:6,16`); `tests/parity/converted-tags.txt` is unchanged.

| Layer | File | Cases | IDs |
|---|---|---|---|
| L3 `@pg-race` | `tests/Concurrency/AdminFlagTriggerTest.php` | AC 3 in full, on `pgsql` **and** `pgsql_limits`: insert true (raises, message `operator-owned admin flag`, SQLSTATE P0001); update false→true and true→false (raise); `INSERT … ON CONFLICT (id) DO UPDATE SET is_admin = true` on an existing admin row (raises: F-17); insert false/omitted OK; update `full_name` on an admin row OK; update `is_admin` true→true OK; migrate role insert-true, promote, demote OK. Setup/cleanup via `pgsql_migrate` | A-19, DV-14 (mechanism) |
| L3 `@pg-race` | `tests/Concurrency/EmailNormalisationConstraintTest.php` | `users` and `profiles`, both roles: `'A@x.com'`, `' a@x.com'`, `'a@x.com '` → 23514 (constraint name in the error); `'a@x.com'` OK; `"a@x.com\t"` **accepted** (btrim strips spaces only, as Next) | A-19 |
| L3 `@pg-race` | `tests/Concurrency/RuntimeRoleTest.php` | Port of `postgres.integration.test.ts:30-45` + `auth.postgres.integration.test.ts:222-223`: role attributes false; no schema/database CREATE; owns no table; CREATE TABLE / CREATE ROLE fail; `select` / `insert` on `migrations` and `auth_admin_bootstrap` → permission denied (both `pgsql` and `pgsql_limits`); runtime can `select/insert/update/delete` on every other portal table and `nextval` on framework sequences; no table has RLS on; `pgsql_limits` `current_user` = `pgsql` `current_user` ≠ `pgsql_migrate` | O-06, X-15, ADR-009/013 |
| L2 Pest | `tests/Feature/Schema/SchemaContractTest.php` | Reads `information_schema` / `pg_catalog` and compares with the manifest: exact table set; per column type, length/precision, nullability, default; PKs; unique and plain indexes (columns, order); the expression index definition; each FK's target, `confdeltype` and `confupdtype`; the two checks' definitions; the trigger (BEFORE, INSERT OR UPDATE, ROW) and function exist; `profiles.id` no default; every domain id `uuid` except the four exceptions | X-15, A-19, ADR-012 |
| L2 Pest | `tests/Feature/Schema/ForeignKeyBehaviourTest.php` | AC 7: one dataset row per FK (29 + sessions) asserting the delete effect from the runtime connection (cascade removes, set null nulls, restrict → 23503) | X-15 (FK table) |
| L2 Pest | `tests/Feature/Schema/MigrationsTest.php` | `migrate:fresh --database=pgsql_migrate` twice in a row succeeds (function idempotency); `migrate:rollback --database=pgsql_migrate` to zero then `migrate` succeeds; all tables owned by the migrate role | ADR-012/013 |
| L2 Pest | `tests/Feature/Schema/GrantsCommandTest.php` | `db:grants` twice is a no-op; refuses `--database=pgsql`; a table created by the migrate role after grants gets runtime DML (default privileges) | O-06 |
| L1/L2 Pest | `tests/Unit/DatabaseRolesTest.php`, `tests/Feature/ConfigBootValidationTest.php` (extend) | `pgsql_limits` with a different username / host / port / database → `InvalidConfiguration` without the password; real production `php artisan` child process fails with a mismatched `pgsql_limits`, boots with the valid trio | ADR-009/013 |
| kept | `tests/Feature/DatabaseRolesTest.php` (1.1a) | unchanged; must still pass on the migrated DB | ADR-013 |

Test-port ledger rows touched: **#96** `postgres.integration.test.ts` (tests 1–2 resolved here → `RuntimeRoleTest`; 3–6 stay with 2.4 / 5.x / 7.5a); **#66** `auth.postgres.integration.test.ts` (the runtime-can't-promote / can't-read-bootstrap half of the last test resolved here; the CLI half → 4.9a). Next's `prisma migrate diff` drift check (`isolated-postgres-test.mjs:89`) is replaced by `SchemaContractTest`.

## Definition of done (Laravel-only, `epics.md` → Overview)
The gate is green on Laravel, plus the full Laravel suite. Ledger rows resolved. Inventory `Verified` where the story completes a row. Story record, handoff, pushed.
Concretely: `bin/test` green (Pint, Larastan 9, Pest Unit/Feature/Arch **and** Concurrency) on a fresh volume; CI laravel-ci green including the Concurrency step; X-15, A-19, O-06 `Verified`; ledger #66/#96 updated; `sprint-status.yaml` → `review`/`done`; handoff updated.

## Dependencies and follow-ups
- **Depends on:** 1.1a (stack, roles, connections), 1.3 (`DatabaseRoles`, boot provider). Both done.
- **2.2 Models, policies, concept scope:** `HasUuids` (v7) on every uuid model; `Profile` keyed by the user id (no generated id; `$incrementing = false`); `const UPDATED_AT = null` for `client_memberships`, `project_briefs`, `messages`, `concept_comments`, `audit_events`; `CREATED_AT = null` for `project_brief_drafts`; no timestamps for `auth_proofs`, `auth_rate_limits`, `stripe_events` (custom `created_at`); `$dateFormat` with milliseconds if OQ 1 keeps `timestamp(3)`; jsonb casts; `is_admin` never fillable and never written on the runtime connection (DV-14); email mutators normalise with the JS `trim()` set (`NodeCompat`); factories.
- **2.3:** no schema dependency beyond `projects.status` text.
- **2.4:** uses `projects.version` (bump in every state change) and `audit_events`; `Audit::record` writes `payload` jsonb; receipt lookups use `payload->>'requestKey'` to hit the index.
- **2.5:** `auth_rate_limits` + `pgsql_limits` (runtime role proven here); cleanup by `window_start` index.
- **2.6:** `parity:seed` creates admin users through `pgsql_migrate` (trigger; `tests/parity/fixtures/scenarios/README.md:8`); the shared SQL assertion script maps Next's quoted PascalCase tables/columns to these snake_case ones; seeder must run `db:grants`-migrated schema.
- **2.7:** `jobs`/`failed_jobs` runtime DML; `email_sent:*` markers in `audit_events` (no unique index in Next; dedupe is read-then-write).
- **4.1/4.x:** `sessions.user_id` uuid; absolute cap in payload; "delete all sessions of a user" relies on `user_id`. **4.9a:** `admin:bootstrap` on `pgsql_migrate`, advisory lock `operator-admin-bootstrap`, owner check like `bootstrap-admin.mjs:16`, bootstrap row `id = 1`.
- **6.x/7.x (DV-14):** message and comment actions must not touch `profiles.is_admin`; `AdminFlagTriggerTest` documents why.
- **Epic 9:** production role provisioning (attributes as `01-roles.sh`), Forge deploy runs `migrate --database=pgsql_migrate --force` then `db:grants`; never put migrate credentials in the runtime environment beyond what `admin:bootstrap` needs (decide there).

## Open questions (dev agent: take the recommendation unless the owner says otherwise; record the choice in DECISIONS.md)
1. **Timestamp type.** Next: `timestamp(3)` without time zone, UTC. Keep exactly that (recommended: parity of seed facts, ms ordering for read-state "new" dots), or `timestamptz(3)`?
2. **`users.email_verified` boolean** (brownfield, Next) vs Laravel's `email_verified_at`. Recommended: boolean, as Next.
3. **Doc disagreement: absolute session cap storage.** `brownfield/data-model-and-ops.md:29` says a `created_at` column on `sessions`; `architecture.md` §4.3 (`:94`) and ADR-005 say session payload (`auth.issued_at`). Recommended: payload (accepted ADR), no column; fix the brownfield row.
4. **Drop `password_reset_tokens` and `remember_token`.** Recommended: drop (no "remember me", `auth-and-security.md:119`; proofs replace reset tokens).
5. **Grants mechanism.** Artisan `db:grants` with the role from config (recommended) vs a raw `psql -f` with a hard-coded role name like Next.
6. **`projects.version` default.** Recommended 0 (2.4 confirms).
7. **`sessions.user_id` FK** to `users` with cascade (recommended, mirrors `AuthSession`), or Laravel's FK-less default?
8. **`auth_admin_bootstrap` single-row CHECK (`id = 1`).** Next has none. Recommended: none (parity; the CLI guards it).
9. **`ON UPDATE CASCADE`** on every FK. Recommended: reproduce (exact parity, harmless since PKs never change).
10. **Dev role attributes** (`NOINHERIT`, database `CONNECT` only for runtime) in `01-roles.sh`. Recommended: align with Next's runner.

## Doc / code disagreements found while writing this story
- `brownfield/data-model-and-ops.md` §1 omits `profiles.created_at/updated_at`, most single-column FK indexes, and every FK's `ON UPDATE CASCADE`; the checklist above follows the SQL.
- Brownfield `sessions.created_at` column vs architecture/ADR-005 payload (OQ 3).
- `project-context.md:57` ("L2 Pest feature tests use `RefreshDatabase`") can't work as written: `RefreshDatabase` migrates on the default runtime connection, which can't do DDL. Fix with the harness above.
- `docker/postgres/01-roles.sh` roles differ from Next's (`INHERIT`, database `CONNECT`/`TEMP` left to PUBLIC), and its default privileges make `migrations` and `auth_admin_bootstrap` runtime-writable until a grants step exists (none today).
- Inventory A-19 says "only the migration (owner) role"; the trigger actually checks *table owner* (`migration.sql:531`). Same thing only while migrations run as `pgsql_migrate`.

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
