# Brownfield: data model, environment, dev tooling and tests (as built)

Phase 0 capture, 2026-11-18. Covers **X-15, O-01…O-08, A-12**. Source: `apps/web/prisma/schema.prisma` (383 lines, 2 migrations), `apps/web/ops/`, `apps/web/scripts/`, `apps/web/docs/`.

## 1. Tables (Prisma model → Laravel snake_case table, per D7)

All IDs are UUID unless noted. `createdAt` and `updatedAt` are timestamps (Prisma `@updatedAt` is set by the app, not a DB default). Status-like columns are **free strings**, not enums: values are enforced in code.

| Prisma model | Laravel table | Columns (snake_case in Laravel) | Keys and indexes |
|---|---|---|---|
| Profile | `profiles` | id (= auth user id, FK restrict), email unique, full_name?, first_name?, last_name?, is_admin bool=false | |
| Client | `clients` | id, name, slug unique, billing_email?, vat_number? (unused), timestamps | |
| ClientMembership | `client_memberships` | id, client_id (cascade), user_id → profiles (cascade), role (`owner`), created_at | unique (client_id, user_id); idx user_id |
| Project | `projects` | id, client_id (cascade), status, package_code, timestamps | idx client_id, status. **`updated_at` is the optimistic version** (see `api-admin.md`) |
| ProjectBrief | `project_briefs` | id, project_id (cascade), version int, answers jsonb, created_by → profiles (restrict), created_at | unique (project_id, version) |
| ProjectBriefDraft | `project_brief_drafts` | project_id PK (cascade), answers jsonb, updated_by (restrict), updated_at | |
| ProjectOrder | `project_orders` | id, project_id, client_id (cascade), status (`FULFILLED`/`NEEDS_CONTACT`), currency, total_cents int, stripe_checkout_session_id? unique, stripe_payment_intent_id? unique, campaign_slug?, timestamps | |
| ProjectEntitlement | `project_entitlements` | id, project_id (cascade), key (`concepts`/`revisions`), limit_int? (null = unlimited), consumed_int=0, reserved_int=0, timestamps | unique (project_id, key) |
| Concept | `concepts` | id, project_id (cascade), number int, status (`draft`/`published`/`approved`/`archived`/`deleted`), notes?, timestamps | unique (project_id, number); idx status |
| FileAsset | `file_assets` | id, project_id (cascade), kind (`concept`/`final_zip`), bucket (logical namespace), path, mime, size int, notes?, uploaded_by (restrict), timestamps | |
| MessageThread | `message_threads` | id, project_id unique (cascade), timestamps | |
| Message | `messages` | id, thread_id, project_id (cascade), sender_id (restrict), kind (`user` default/`system`), body, created_at | idx created_at |
| RevisionRequest | `revision_requests` | id, project_id (cascade), concept_id? (set null), status (`requested`/`delivered`), requested_by (restrict), body, timestamps | idx status |
| ConceptComment | `concept_comments` | id, project_id, concept_id (cascade), author_id (restrict), body, created_at | idx (project_id, created_at), (concept_id, created_at) |
| AuditEvent | `audit_events` | id, project_id? (cascade), actor_id? (set null), type, payload jsonb, created_at | idx (project_id, created_at), (type, created_at). **Also used as the idempotency and receipt store** (`email_sent:*`, `concept_upload_request` with payload `requestKey` lookups). Add a **jsonb expression index** on `payload->>'requestKey'` in Laravel |
| ProjectReadState | `project_read_states` | id, user_id, project_id (cascade), last_seen_messages_at?, last_seen_concepts_at?, timestamps | unique (user_id, project_id) |
| StripeEvent | `stripe_events` | event_id text PK, type (also holds the `processing:` lease marker), created_at (= Stripe event time), processed_at? | |
| AuthUser | `users` | id, name, email unique, email_verified bool, image?, credential_version int=0, timestamps | Laravel: the `users` table with `password` stored directly (replaces AuthAccount credential rows) |
| AuthSession | `sessions` | Laravel's database session table plus a **`created_at` column** for the absolute cap | |
| AuthAccount | none | Only `providerId="credential"` is used, so the password moves to `users.password` | |
| AuthVerification | none | Better Auth internal token store. Laravel uses `auth_proofs` alone | |
| AuthProof | `auth_proofs` | token_hash char(64) PK (sha256), user_id (cascade), kind (`setup`/`reset`/`magic`), credential_version, expires_at | idx user_id |
| AuthAdminBootstrap | `auth_admin_bootstrap` | id int PK (single row), user_id, created_at | **The runtime role is revoked** |
| AuthRateLimit | `auth_rate_limits` | key char(64) PK, hits, window_start | idx window_start. Or use the Laravel cache `RateLimiter` on the DB or Redis store (decide in the architecture ADR) |

Laravel migrations must reproduce the FK `onDelete` behaviours exactly (cascade, restrict, set null). Restrict on `profiles` means profiles are never deleted while they authored anything.

## 2. Database roles and grants

- Two roles: **runtime** (`DATABASE_URL`, DML only) and **migration** (`DIRECT_URL`, owns the schema). The same host and database are required, with distinct users (`lib/database-target.ts`).
- `ops/postgres/runtime-grants.sql`: revoke CREATE on public, give the runtime role DML on all tables and sequences with default privileges, revoke runtime access to the migrations table and to `AuthAdminBootstrap`.
- Laravel: `config/database.php` connections `pgsql` (runtime) and `pgsql_migrate`; `php artisan migrate --database=pgsql_migrate`; port the grants script (revoking access to Laravel's `migrations` table and `auth_admin_bootstrap`).

## 3. Admin bootstrap (A-12), `scripts/bootstrap-admin.mjs`

A two-step operator CLI on the **migration** connection, with no env-file loading:
1. `--prepare --email E`: under advisory lock `operator-admin-bootstrap`, verify the caller owns `Profile`, refuse if bootstrap is already consumed, then create an **unverified** AuthUser and Profile. The operator then verifies the mailbox through the app's **forgot-password** flow (a reset sets `emailVerified`).
2. `--email E --confirm-user UUID --ack ONE_TIME_ADMIN_BOOTSTRAP`: require an existing **verified** user matching ID and email (`FOR UPDATE`), refuse if any admin exists, set `isAdmin`, and write the bootstrap row (consumed forever).
Laravel: `php artisan admin:bootstrap --prepare --email=` / `--email= --confirm-user= --ack=ONE_TIME_ADMIN_BOOTSTRAP`, forced onto `pgsql_migrate`, with identical guards.

## 4. Environment variables (O-07)

| Next.js | Laravel equivalent | Notes |
|---|---|---|
| `DATABASE_URL`, `DIRECT_URL` | `DB_*` (runtime) and `DB_MIGRATE_*` | Validate the distinct roles |
| `BETTER_AUTH_SECRET` | `APP_KEY` | |
| `PUBLIC_SITE_URL` (`NEXT_PUBLIC_SITE_URL` fallback) | `APP_URL` **plus** a strict validator, or keep `PUBLIC_SITE_URL` | Canonical origin, HTTPS in production |
| `PUBLIC_MARKETING_SITE_URL` (`NEXT_PUBLIC_…`) | same | Checkout cancel URL |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | same | |
| `POSTMARK_SERVER_TOKEN`, `POSTMARK_FROM` | `POSTMARK_TOKEN` (Laravel mailer), `MAIL_FROM_ADDRESS` | Message stream `outbound` |
| `ADMIN_NOTIFICATION_EMAILS` | same | Recipients only, never authorization |
| `EMAIL_LOGO_URL` | same | |
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_CONCEPTS_BUCKET`, `R2_FINAL_DELIVERABLES_BUCKET`, `R2_JURISDICTION` | same | |
| `AUTH_CLIENT_IP_HEADER` / `AUTH_TRUSTED_PROXY_HOPS` | same | Exactly one |
| `NODE_ENV` | `APP_ENV` | "production" gates |
| `LOCAL_DEV_*`, `PG_LOCAL_DEV_*`, `PG_INTEGRATION_URL`, `RUN_PG_INTEGRATION`, `AUTH_BROWSER_FIXTURE` | Replaced by the Docker test stack and `parity:seed` | Dev and test only |

## 5. Dev tooling (O-01…O-06)

| Script | What it does | Laravel replacement |
|---|---|---|
| `scripts/local-run.mjs` | Loads `.env.local`, requires the secrets, runs `stripe listen` and captures the webhook secret, starts `next dev` | `docker compose up` (app, queue worker, postgres, mailpit, minio) plus a `stripe listen` sidecar profile |
| `scripts/local-dev-pg.mjs` + `docs/local-dev-pg-handoff.md` | Owner-private persistent local PG cluster (port 45232, a 0700 directory, distinct roles), with init/start/seed/app/stop/reset | A Docker volume-backed Postgres. Seeding via `php artisan parity:seed` / `dev:seed` guarded to non-production |
| `lib/local-dev-fixture-guard.ts`, seeds | Refuse to seed anything except the private local cluster. Owner identities come from a private file | An artisan guard: refuse unless `APP_ENV=local\|testing` **and** the DB host is the compose service |
| `scripts/isolated-postgres-test.mjs` | A throwaway PG cluster with roles plus grants, checks zero schema drift, runs the PG integration tests and the golden Playwright path | Pest with a `pgsql` test service in compose/CI plus a schema-drift check (`migrate:fresh` then compare with `schema:dump`) |
| `scripts/security-check.mjs` | Scans env files and `src` for leaked secrets and client-exposed env names | Port it as an artisan or composer script, plus `composer audit` and `npm audit --omit=dev` |
| `scripts/auth-proxy-preflight.mjs` | Refuse a production start without valid proxy config | A boot-time check in a service provider (production) |
| `scripts/bootstrap-admin.mjs` | §3 | `admin:bootstrap` |

Note: the old test runbook deliberately avoided Docker. The owner's decision D6 (2026-11-18) changes that to Docker for local, parity and CI.

## 6. Existing tests (input to the test-port ledger)

- Vitest: about 95 files / 614 tests (`*.test.ts` beside the source; `src/app/api/**/route.test.ts` for routes, `route-guards.test.ts` for the Origin guard shape across all mutation handlers).
- Real PG (opt-in): `src/lib/postgres.integration.test.ts` (core) and `src/lib/auth.postgres.integration.test.ts` (auth), 18 tests.
- Playwright: `e2e/smoke.spec.ts`, `e2e/client-flows.spec.ts` (dev server on 127.0.0.1:4173), `e2e-golden/auth-golden.spec.ts` (only through the isolated PG runner, with captured single-use links).
- Runbooks to rewrite for Laravel: `auth-runbook.md`, `checkout-auth-security.md`, `checkout-troubleshooting.md`, `design-system.md`, `hardening-notes.md`, `local-dev-pg-handoff.md`, `private-r2-runbook.md`, `security-boundaries.md`, `test-runbook.md`, `webhook-delivery-semantics.md`, `webhook-ops.md`.
