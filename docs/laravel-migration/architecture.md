---
stepsCompleted: [context, starter, decisions, patterns, structure, validation]
inputDocuments:
  - docs/laravel-migration/prd.md
  - docs/laravel-migration/research-technical.md
  - docs/laravel-migration/brownfield/*.md
  - docs/laravel-migration/ux-design.md
  - docs/laravel-migration/02-test-strategy.md
workflow: bmad-bmm-create-architecture (BMAD step 3.1)
status: Draft for owner review
date: 2026-11-18
---

# Architecture: Logo Fountain portal (Laravel)

Each decision below has its own ADR file in `adr/` (one decision per file, superseded rather than edited). The mechanics behind them (code shapes, config values, sources) are in `research-technical.md`, and the behaviour being reproduced is in `brownfield/`. **If this document and the code disagree, fix one of them in the same commit.**

## 1. Project context

- **Requirements:** 57 FRs and 22 NFRs (`prd.md`), backed by 116 inventory rows plus the DV-1…DV-13 deviations.
- **Shape:** one Laravel monolith serving Inertia pages (React) and a cookie-authenticated JSON API under `/api/*`, a public Stripe webhook, queue workers, a scheduler, and operator CLI commands.
- **Hard constraints:**
  - The `/api/*` contracts must stay byte-compatible, because the parity suite runs against both apps.
  - Auth semantics (fence, proofs, absolute sessions), webhook idempotency, immutable storage and concurrency guards must all be preserved.
  - Single server at launch (Forge → Hetzner, behind the Cloudflare proxy).
- **Cross-cutting concerns:**
  - security: origin guard, authorisation, rate limits, headers, secrets;
  - concurrency: advisory locks, serializable transactions, version guards, idempotency receipts;
  - audit;
  - email delivery modes;
  - storage access;
  - polling;
  - the design system;
  - observability and alerts.

## 2. Starter

`laravel/laravel` v13 skeleton (`composer create-project`), **without a starter kit** (ADR-004). Added by hand: `inertiajs/inertia-laravel` v3, React 19 + TypeScript + Vite 8 + Tailwind 4 (`@tailwindcss/vite`), Pest 5, Larastan, Pint. Exact pins are in `research-technical.md` §2. Location: `apps/portal/`.

## 3. Decision summary (ADRs)

| ADR | Decision | Satisfies |
|---|---|---|
| 001 | Laravel 13 on PHP 8.5 (≥ the 2026-11-19 security release), PostgreSQL 18, Node 24 for builds | NFR-S6, NFR-M1 |
| 002 | Inertia v3 + React 19 + TypeScript. UI-only TS modules move over unchanged | D2, DV-UX |
| 003 | `/api/*` lives in the **`web` middleware group** (session-backed), with the same paths, methods, codes and error shape | FR all, X-03 |
| 004 | Session guard, database sessions, custom auth actions. **No** Fortify, Breeze, Jetstream or any starter routes | A-series, FR1–FR11 |
| 005 | 7-day **absolute** session cap enforced by middleware (`auth.issued_at` plus a `credential_version` check). Session regenerated on login. Cookie `__Host-lf_session` in production | A-03, A-04, FR7 |
| 006 | bcrypt cost 12 with `BCRYPT_LIMIT=72`. Validation: 8 characters minimum, 72 bytes maximum | A-01, FR1 |
| 007 | **Credential fence:** one PG transaction holding `pg_advisory_xact_lock(hashtextextended('auth:'‖id,0))`, with `SET LOCAL lock_timeout '5s'` and `statement_timeout '20s'`. Every auth read and write runs inside it | A-10, FR10 |
| 008 | **Strict Origin/Referer middleware is the CSRF control for `/api/*`**, at top priority (before session and auth). `/api/*` is excluded from `PreventRequestForgery`. Exemptions as X-01 | X-01, NFR-S1 |
| 009 | Rate limits port the Postgres bucket table (single-statement upsert, sha256 keys) on a **dedicated `pgsql_limits` connection**, never inside a business transaction. They cover auth **and** checkout email limits | X-06, NFR-S4 |
| 010 | Trusted client IP: `AUTH_CLIENT_IP_HEADER=cf-connecting-ip` behind the Cloudflare proxy. The Hetzner Cloud Firewall allows 80/443 only from Cloudflare ranges. Production auth fails closed (503) without a valid IP | X-05, A-17, FR57 |
| 011 | Lifecycle concurrency: an explicit `projects.version` integer (an optimistic guard bumped in every state change) plus a `Db::serializable()` helper that retries on SQLSTATE 40001/40P01 (no nesting allowed) and maps exhaustion to the existing 409 codes | X-17, NFR-R3 |
| 012 | Schema in Laravel migrations, snake_case, UUID primary keys (`HasUuids` → v7), jsonb payloads, a raw-SQL trigger protecting `is_admin`, email check constraints, a jsonb expression index on `audit_events(payload->>'requestKey')` | data model, A-19, X-15 |
| 013 | Two DB roles: `pgsql` (runtime DML) and `pgsql_migrate` (owner). Deploy migrates with `--database=pgsql_migrate`, then the grants script runs. `admin:bootstrap` uses `pgsql_migrate` only | O-06, A-12, FR9 |
| 014 | Stripe: `stripe/stripe-php ^22.1`, `StripeClient` with `stripe_version=2026-02-25.clover`. The webhook uses the raw body with `Webhook::constructEvent` and the **existing lease-and-claim `stripe_events` ledger**. `allow_promotion_codes=true` on every session. Return URLs come from the canonical origin. No Cashier | K-series, DV-1, DV-4, DV-5 |
| 015 | One `FulfilCheckout` action plus one `CompleteFulfilmentSideEffects` action, shared by the webhook and admin reprocess (DV-6). Upgrade maths is additive (DV-2) | K-05…K-12 |
| 016 | R2 through the AWS SDK for PHP v3 directly: `IfNoneMatch '*'` (412 → collision), checksum options `when_required`, our own ContentMD5 plus sha256 metadata, presigned GET ≤ 3600 s with a sanitised disposition. Flysystem isn't used for private objects. **SeaweedFS** in local and CI | X-10…X-13, FR51–FR52 |
| 017 | Upload validators ported byte for byte to PHP (`ImageValidator`, `ZipValidator`, streaming `inflate_add`). **No `ZipArchive`.** They're proven against the shared golden corpus. Final ZIP cap 95 MB (DV-13) | X-12, FR53 |
| 018 | Email has two modes. **Auth links** are synchronous after the fence commits; on failure the proof is deleted and a fixed error returned. **Lifecycle** emails are queued `afterCommit` mailables with retries, deduped by `email_sent:*` audit markers. Postmark transport with stream `outbound` | A-11, N-series, DV-8, DV-9 |
| 019 | Queue: the `database` driver (SKIP LOCKED) with `after_commit=true`. One supervised worker (Forge daemon). Scheduler for pruning and checks. No Redis, no Horizon | NFR-R5 |
| 020 | Client concept visibility: every client-path concept or asset lookup goes through `Concept::visibleToClient()` (published and approved) plus a policy. An architecture test forbids other queries from client controllers. 404 is indistinguishable | DV-7, FR26–FR28, FR34 |
| 021 | Snapshot and concept payloads add a stable `imageKey`. The React `<PrivateImage>` keeps its `src` until the key changes or the URL is ≤ 5 min from expiry | DV-12, FR54 |
| 022 | Design system as code: Tailwind 4 `@theme` tokens from `ux-design.md` §8 (direction A), Radix UI primitives for dialog, menu, tabs, popover and tooltip, components in `resources/js/Components/ui`, a `/dev/ui` catalogue (local only), and the design-system lint | DV-UX, NFR-A1…A4 |
| 023 | Polling kept (10 s hub, 2 s admin project, 2.5 s audit) through one `usePolling` hook (pauses when the tab is hidden, backs off after errors, `aria-live` announcements). Realtime is post-launch | C-03, D-02, D-16 |
| 024 | Hosting: **Forge** provisions **one Hetzner Cloud server** (Ubuntu LTS, nginx, PHP 8.5-FPM over a unix socket, PG 18 local), the **Cloudflare proxy** (Full strict), the Hetzner Cloud Firewall, and HSTS at Cloudflare | FR56, NFR-S2 |
| 025 | Backups: pgBackRest (weekly full, daily diff, continuous WAL, encrypted) to two repos, a dedicated R2 bucket and a Hetzner Storage Box. 30 days PITR plus 12 monthly fulls. Nightly copy-only sync of both R2 buckets to the Storage Box. Hetzner server backups as an extra. Restore drill before launch and quarterly | NFR-R4 |
| 026 | Observability: Laravel log (JSON, daily rotation, secrets scrubbed by a log processor), Forge server monitoring, a scheduled health job, backup freshness checks and failed-job alerts, all **emailed to the owner**. A PHP security-release check runs weekly | ops |
| 027 | Security headers middleware: report-only CSP (the same directives as `next.config.ts`, plus Vite's dev origin in local only), X-Frame-Options DENY, nosniff, Referrer-Policy, Permissions-Policy, and no-store/no-referrer on the auth pages. HSTS is set at Cloudflare | X-02, NFR-S2 |
| 028 | CI: GitHub Actions running `docker compose` (postgres, mailpit, seaweedfs, app, worker). Jobs: `laravel-ci` (Pint, Larastan, Pest including L3), `parity` (matrix next/laravel), `ui` (Vitest, tsc, ESLint plus the design lint, L7/L7a), `audit` (composer and npm) | test strategy |

## 4. Core architecture

### 4.1 Request pipeline (order matters)
```
Cloudflare (TLS, WAF, HSTS) → Hetzner firewall (CF ranges only) → nginx → PHP-FPM → Laravel
  global: SecurityHeaders → RequireCanonicalOrigin* (mutations; exemptions per X-01) → TrustedClientAddress
  web group: EncryptCookies → StartSession → EnforceAbsoluteSession → ShareInertiaData (pages only)
  route: auth / admin / project-member policy → controller → Action → response (JSON or Inertia)
  * the auth endpoints add AuthJsonBoundary: JSON-only, 8 KiB streamed cap, generic errors, no-store/no-referrer
```

### 4.2 Code organisation (the domain in Actions, thin controllers)
- **Controllers** do HTTP only: parse, authorise, call **one Action**, shape the response. API controllers return exactly the legacy JSON. Page controllers return Inertia props built by the **same query objects** the API uses (e.g. `ProjectSnapshot::for($project, $user)`), so the first paint and the polled JSON are identical (as today).
- **Actions** (`app/Actions/...`) hold the business transactions: `SubmitBrief`, `RequestRevision`, `ApproveConcept`, `UploadConcept`, `DeliverRevision`, `PublishFinals`, `DownloadFinals`, `ChangeProjectStatus`, `OverrideEntitlements`, `ResetProject`, `FulfilCheckout`, `ProvisionAccess`, `RequestAuthLink`, `ResetCredential`, `VerifyMagicLink`, `ChangeCredential`, `Login`. Each one owns its transaction, locks, audit rows and system messages, and dispatches emails after commit. **They never depend on `Request`**, so Pest L3 calls them directly in race tests.
- **Domain value objects:** `ProjectState` (an enum with the transition table and labels, shared with TS through a fixture test), `EntitlementUsage`, `SafeNext`, `CanonicalOrigin`, `DownloadDisposition`.
- **Errors:** domain exceptions carry `status` and `code`. One renderer maps them to `{error:{message,code,details?}}`, so controllers never build error JSON by hand. A fixed list of codes is kept in `app/Support/ErrorCodes.php`, mirrored by `resources/js/lib/errors.ts` (UX copy).

### 4.3 Data
Tables per `brownfield/data-model-and-ops.md` §1, renamed to snake_case. Changes from Next:
- `users.password` (replaces `AuthAccount`); `AuthVerification` is gone (proofs only);
- `projects.version` int;
- `sessions` (Laravel default) plus the absolute-cap data in the session payload;
- `jobs`, `failed_jobs` and `cache` (Laravel), with the runtime role granted DML;
- the expression index on `audit_events`.

FK `onDelete` behaviours reproduced exactly. Status columns stay strings, validated by enums in code.

### 4.4 Frontend
`resources/js/`:
- `Pages/` (Inertia pages per the UX IA)
- `Components/ui/` (design system)
- `Components/` (domain components)
- `lib/` (the **unchanged TS behaviour modules** from `apps/web/src/lib` per `brownfield/business-rules-and-notifications.md` §1, with their Vitest suites)
- `api/` (typed fetch client for `/api/*`, which sends credentials and parses the error shape)
- `hooks/` (`usePolling`, `usePrivateImage`, `useTheme`)

Theme init runs as an inline script in the Blade root before paint. Fonts are self-hosted (Inter, Sfizia, Geist Mono). **No SSR** (the portal is noindex and every page is authenticated).

### 4.5 Infrastructure (production)
- One Hetzner Cloud server, sized in E9 (start with 4 vCPU / 8 GB; check the price at provisioning), provisioned by Forge.
- Services:
  - nginx;
  - PHP 8.5-FPM;
  - PG 18 (local socket, `listen_addresses=localhost`);
  - one queue worker daemon;
  - the scheduler cron;
  - pgBackRest.
- DNS on Cloudflare, proxied, SSL Full (strict) with a Cloudflare Origin CA certificate on nginx.
- Hetzner Cloud Firewall: 443 and 80 from Cloudflare IP ranges only, and 22 from the owner's IP or the Forge range only.
- Secrets live in the Forge environment (never in the repo). R2 tokens: app (two buckets, object read and write) and backup (backup bucket only) are separate.
- Deploys: the Forge zero-downtime script runs `composer install --no-dev`, `npm ci && npm run build`, `migrate --database=pgsql_migrate --force`, grants, `config:cache`, `route:cache`, `queue:restart`.
- **The PHP patch runbook is separate.** Forge doesn't upgrade PHP.

### 4.6 Local and CI
`apps/portal/compose.yaml`:
- `app` (php-fpm + nginx, or `artisan serve`)
- `worker`
- `vite`
- `postgres:18` (an init script creating the runtime, migrate and limits roles)
- `mailpit`
- `seaweedfs` (bucket bootstrap)
- optional `stripe-cli` (profile)

`apps/web` gets the test seams (SMTP→Mailpit, R2 endpoint → SeaweedFS, `parity:seed`) so the parity suite runs against both apps on the same infrastructure.

## 5. Implementation patterns and consistency rules (agents must follow)

| Area | Rule |
|---|---|
| Naming | PHP PSR-12 via Pint. Classes are singular nouns, Actions are verb phrases (`RequestRevision`). Tables snake_case plural, columns snake_case. JSON keys **camelCase**, exactly as today (API resources map them; no automatic casing) |
| JSON shape | API Resources per endpoint, with **golden contract tests**. A field is never added or removed without updating the parity schema and the inventory |
| Transactions | Every multi-row change goes inside an Action transaction. Lifecycle changes use `Db::serializable()` plus the version guard. Advisory locks only through the `Locks` helper (`Locks::credential($id)`, `Locks::provision($email)`, `Locks::conceptUpload($projectId, $key)`) |
| Side effects | Emails, storage cleanup and any external call happen **after commit**, except storage *upload*, which happens before the publication transaction (the existing protocol) |
| Audit | Only through `Audit::record(type, project, actor, payload)`. Payloads never contain secrets, signed URLs or tokens (a unit-tested scrubber) |
| Authorisation | Policies (`ProjectPolicy`, `ConceptPolicy`). Membership misses return 404 `PROJECT_NOT_FOUND`. Admin endpoints use the `admin` middleware. Clients use the concept scope (ADR-020) |
| Config | Every env var is read only in `config/*.php`. Boot-time validators for `PUBLIC_SITE_URL`, proxy config, the DB role pair and price IDs (production refuses to boot or to serve auth) |
| Frontend | Pages use only `Components/ui`. Tokens only. One primary button per view. All copy goes in components or `lib/copy.ts` (no stray strings in API code). Every list and panel defines empty, loading, error and partial states |
| Tests | Every Action has a Pest feature test. Every endpoint has a parity contract test. Every concurrency guard has an L3 race test. Every screen has an L7 baseline and an axe check |
| Docs | Per `03-documentation-protocol.md`. A new pattern goes into `apps/portal/AGENTS.md` in the same commit |

## 6. Project structure

```
apps/portal/
  app/
    Actions/{Auth,Checkout,Brief,Concepts,Revisions,Finals,Projects,Admin}/
    Domain/{ProjectState.php, EntitlementUsage.php, SafeNext.php, ...}
    Http/Controllers/{Api,Api/Admin,Pages,Pages/Admin,Webhooks}/
    Http/Middleware/{RequireCanonicalOrigin,TrustedClientAddress,EnforceAbsoluteSession,AuthJsonBoundary,SecurityHeaders,EnsureAdmin}.php
    Http/Resources/            # exact legacy JSON shapes
    Mail/                      # lifecycle + auth mailables (branded base)
    Models/ Policies/ Support/{Db.php,Locks.php,ErrorCodes.php,Audit.php,RateLimits.php}
    Storage/{PrivateObjectStore.php, ImageValidator.php, ZipValidator.php}
    Console/Commands/{AdminBootstrap,ParitySeed,DevSeed,SecurityCheck,ProxyPreflight}.php
  config/ database/{migrations,seeders} ops/postgres/runtime-grants.sql
  resources/{css/app.css (tokens), js/{Pages,Components/ui,Components,lib,api,hooks}, views/app.blade.php, views/mail/}
  routes/{web.php (pages + /api group), console.php}
  tests/{Unit,Feature,Concurrency,Arch}/   # Pest
  compose.yaml  AGENTS.md  docs/ (runbooks)
tests/parity/   (repo root: shared Playwright suite, adapters, page objects, fixtures, journeys)
```

**Requirements → structure:**
- A-series → `Actions/Auth`, `Http/Middleware`, `Support/RateLimits`
- K-series → `Actions/Checkout`, `Http/Controllers/Webhooks`
- C and D series → `Actions/{Brief,Concepts,Revisions,Finals,Projects,Admin}` plus `Pages`
- N-series → `Mail/`
- X-series → `Support/`, `Storage/`, `Http/Middleware`, `Domain/`
- O-series → `Console/Commands`, `ops/`, `compose.yaml`

## 7. Validation

- **Coherence:** the decisions don't conflict. The CSRF exclusion (008) depends on the origin middleware (008) and the arch test (020/028). Rate limits on their own connection (009) avoid the fence rollback (007). The email modes (018) respect the fence contract.
- **Coverage:** every FR and NFR maps to at least one ADR (table §3, "Satisfies"). FR12–FR22 → 014/015. FR23–FR34 → 002/003/020/021/023. FR35–FR48 → 011/016/017. FR49–FR50 → 018. FR51–FR54 → 016/017/021. FR55–FR57 → 010/013/024–028.
- **Gaps / to settle in E0–E1 spikes:**
  1. The SeaweedFS `If-None-Match` probe.
  2. R2 honouring the presigned `response-content-disposition` (L8/L9).
  3. nginx overwrite of `cf-connecting-ip` / forged-header test (L9).
  4. Whether Sfizia's licence covers app use (owner).
  5. Server size.
- **Readiness:** ready for epics and stories (BMAD 3.2) once the owner has reviewed this document and the PRD validation fixes are applied.
