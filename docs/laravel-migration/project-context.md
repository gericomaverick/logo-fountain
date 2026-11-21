---
project_name: 'Logo Fountain'
user_name: 'Mat'
date: '2026-11-20'
sections_completed:
  ['technology_stack', 'language_rules', 'framework_rules', 'testing_rules', 'quality_rules', 'workflow_rules', 'anti_patterns']
status: 'complete'
rule_count: 44
optimized_for_llm: true
workflow: bmad-bmm-generate-project-context (story 1.2; run non-interactively by a sub-agent, every menu answered "C", sources below)
sources: [architecture.md, adr/, research-technical.md §2, epics.md, 03-documentation-protocol.md, stories/1-1a-skeleton-compose-pins.md, apps/portal/{composer.json,package.json,phpstan.neon,pint.json,tsconfig.json,vite.config.ts,phpunit.xml,compose.yaml}]
---

# Project Context for AI Agents

_This file contains critical rules and patterns that AI agents must follow when implementing code in this project. Focus on unobvious details that agents might otherwise miss._

Scope: the Laravel portal `apps/portal` (replacing the frozen Next.js `apps/web`). The day-to-day guide with the full rules table, DoD variants, run commands and folder map is **`apps/portal/AGENTS.md`**; this file adds the unobvious details behind it and doesn't repeat that table.

---

## Technology Stack & Versions

- **PHP 8.5.13** (floor: the 2026-11-19 security release; `composer.json` `config.platform.php`), image `php:8.5.13-fpm-bookworm` (ADR-001).
- **Laravel `^13.40`** (raised from ^13.39 for advisory PKSA-yxbx-3c9s-cjt9), skeleton `laravel/laravel` 13.11.0, **no starter kit**.
- **Inertia** `inertiajs/inertia-laravel ^3.5.2` + `@inertiajs/react 3.9.1` (fallbacks; move to ^3.7 / 3.11.0 from 2026-11-23). **React 19.3.1**, **TypeScript 6.0.3** (7.x is an open E1 spike), **Vite 8.3.5** + `laravel-vite-plugin 3.2.0` + `@vitejs/plugin-react 6.1.2`, **Tailwind 4.3.3** via `@tailwindcss/vite` (ADR-002, ADR-022).
- **PostgreSQL 18.7**, Node 24 (build only), nginx 1.28, Mailpit v1.33.0, SeaweedFS 4.51 as the S3/R2 stand-in.
- Tests and quality: **Pest ^5.3** + `pest-plugin-laravel ^5.0`, ParaTest ^7.27, **Larastan ^3.13 at level 9**, **Pint ^1.32** (`laravel` preset).
- Planned (not yet installed; use these when the story arrives): `stripe/stripe-php ^22.1` with `stripe_version=2026-02-25.clover`, `aws/aws-sdk-php ^3.402`, `symfony/postmark-mailer ^8.1`, `spatie/laravel-csp ^3.30`, `@playwright/test 1.64.1`, `@axe-core/playwright 4.14.0`.
- Pin policy (`research-technical.md` §1): new pins ≥ ~3 weeks old, updates ≥ 14 days, security advisories immediately. Composer carets + lock; npm exact + lock; Docker images tag + digest in CI.

## Critical Implementation Rules

### Language-Specific Rules

- **PHP must pass Larastan level 9** over `app`, `bootstrap/app.php`, `config`, `database`, `routes`: no `mixed` leaks. Type `config()`/`env()` reads, request input and JSON decoding explicitly.
- **TypeScript is `strict` with `noUncheckedIndexedAccess`**: indexed reads are `T | undefined`. Import alias `@/*` → `resources/js/*` (relative `paths`; `baseUrl` is deprecated in TS 6).
- **UI-only TS behaviour modules from `apps/web/src/lib` move over unchanged** (with their Vitest suites); don't "improve" them in transit (ADR-002, `brownfield/business-rules-and-notifications.md` §1).
- **Errors are domain exceptions carrying `status` + `code`**, rendered once to `{error:{message,code,details?}}`. Never hand-build error JSON in a controller. Codes are a fixed list in `app/Support/ErrorCodes.php`, mirrored by `resources/js/lib/errors.ts`.
- **bcrypt cost 12, `BCRYPT_LIMIT=72`**; passwords 8 characters min, **72 bytes** (not characters) max (ADR-006).

### Framework-Specific Rules

- **`/api/*` routes go in `routes/web.php` inside the `web` middleware group** (session cookie auth). Don't use `routes/api.php` defaults or Sanctum tokens (ADR-003).
- **`/api/*` is excluded from `PreventRequestForgery`**: the strict Origin/Referer middleware is the CSRF control and must return the legacy `403 INVALID_ORIGIN`, never Laravel's 419 (ADR-008).
- **Middleware order is part of the contract** (arch §4.1): `SecurityHeaders` → `RequireCanonicalOrigin` (mutations) → `TrustedClientAddress` → cookies/session → `EnforceAbsoluteSession` → auth/policy. The origin guard runs before session, auth and body parsing.
- **Session:** database driver, a 7-day **absolute** cap (`auth.issued_at` + `credential_version` in the session), `regenerate()` on login and magic-link verify, cookie `__Host-lf_session` in production (ADR-005).
- **Controllers are thin; Actions own the transaction** and never take `Request`. Page controllers and API controllers share one query object (e.g. `ProjectSnapshot::for()`), so the Inertia first paint equals the polled JSON.
- **Queue:** `database` driver with `after_commit=true`; lifecycle mail is queued `afterCommit` and deduped by `email_sent:*` audit markers. **Auth-link mail is synchronous** after the fence commits; on send failure the proof is deleted (ADR-018, ADR-019).
- **Storage:** AWS SDK v3 directly, `IfNoneMatch '*'` (412 = collision), our own ContentMD5 + sha256 metadata, presigned GET ≤ 3600 s with a sanitised disposition (ADR-016).
- **Inertia:** pages resolve from `resources/js/Pages` (capital P, `config/inertia.php`). **No SSR.** Theme init is an inline script in the Blade root, before paint.
- **React UI:** pages use only `Components/ui` (Radix primitives inside); Tailwind `@theme` tokens only, no raw colours; polling only through `usePolling` (pauses when hidden, backs off, `aria-live`) (ADR-022, ADR-023). `<PrivateImage>` keeps its `src` until `imageKey` changes or the URL is ≤ 5 min from expiry (ADR-021).
- **Client concept and asset lookups only through `Concept::visibleToClient()`** + policy; a 404 must be indistinguishable from "doesn't exist" (ADR-020).

### Testing Rules

- **Layers** (`02-test-strategy.md` table L0–L9; tags per `epics.md` → Overview): `@unit` L1 (Pest/Vitest), `@api` L4/L6 HTTP, `@ui` L5 browser, `@pg-race` L3, `@visual` L7/L7a, `@deviation` a DV- row. L2 Pest feature tests use `Tests\Support\RefreshDatabaseAsOwner` on real PG (RefreshDatabase that migrates as `pgsql_migrate` + `db:grants`, transacting `pgsql` only); `tests/Concurrency` uses `TruncatesDatabaseAsOwner` (no transaction). Never `migrate` on the default connection, in tests too (story 2.1).
- **Pest:** feature tests extend `Tests\TestCase` (`tests/Pest.php` binds it to `Feature/` only). Folders: `tests/{Unit,Feature,Concurrency,Arch}`. Tests hit real **PostgreSQL** (`portal_test`, `phpunit.xml`), not SQLite.
- **Every Action has a Pest feature test; every concurrency guard has an L3 race test** that calls the Action directly (Actions don't depend on `Request`).
- **The parity suite (`tests/parity`) is the executable spec**, black-box against both apps. JSON must be byte-compatible; a field change needs the parity schema and the inventory updated. Laravel page objects go in `tests/parity/pages/laravel/`; `data-testid` only there; shared journeys stay unchanged.
- **A tag expression enters `tests/parity/converted-tags.txt` only when every test it selects has its prerequisites built.** Deviation tests are listed in `expected-next-failures.txt` and must fail on Next.
- Parity DB access is locked: `test.use({ db: "exclusive" | { shared } })` (`tests/parity/README.md`).
- **Record what wasn't run** in the story record's Test evidence; it's required, not optional.

### Code Quality & Style Rules

- Gate: `bin/test` = AGENTS.md drift check → `pint --test` → `phpstan` (level 9) → `pest`. All must pass before commit.
- Naming: classes singular nouns, Actions verb phrases (`RequestRevision`); tables snake_case plural, columns snake_case, **JSON keys camelCase as today**, mapped explicitly in API Resources (no automatic casing).
- `env()` only in `config/*.php`; everything else reads `config()`. Production boot validators guard `PUBLIC_SITE_URL`, proxy config, the DB role pair and price IDs.
- All UI copy lives in components or `resources/js/lib/copy.ts`; no user-facing strings in API code. Every list or panel defines empty, loading, error and partial states.
- Comments: a one-line header naming the story or ADR a file exists for (see `bin/test`, `compose.yaml`, `docker/php/init.sh`).

### Development Workflow Rules

- **Docker only; no host PHP or Composer, no Laravel Boost.** Parallel stacks: `COMPOSE_PROJECT_NAME` + `PORTAL_{HTTP,PG,VITE,MAIL,S3}_PORT`; tear down only your own project (`down -v`).
- Conventional commits naming the story, e.g. `feat(portal): … (story 1.1a)`. Commit after each passing step; the owner's rule is to push main. Sub-agents work in worktrees, commit on their branch and don't push; the parent merges.
- Per story: write *Behaviour notes* from the Next source **before** coding; fill the story record (`templates/story-conversion-record.md`), inventory, `sprint-status.yaml`, `handoff.md` → Now; log DECISIONS/RISKS/ASSUMPTIONS (workspace root files).
- **Done = the story's DoD variant** (E0, Laravel-only, Conversion; `epics.md` → Overview).
- A new pattern goes into `apps/portal/AGENTS.md` **in the same commit**. Docs and code that disagree get fixed in the same commit; git wins over docs.
- Deploy shape (ADR-024): Forge zero-downtime script runs `migrate --database=pgsql_migrate --force`, then grants, `config:cache`, `route:cache`, `queue:restart`. Code must survive `config:cache` (hence `env()` only in config).

### Critical Don't-Miss Rules

- **Migrations run as `pgsql_migrate` only, then `php artisan db:grants`** (O-06; dev init, test harness and deploy). The default `pgsql` role is DML-only and DDL fails; it has no access to `migrations` or `auth_admin_bootstrap`. Only the table owner can set `profiles.is_admin` (DB trigger, A-19). `pgsql_limits` exists for rate limits and must never be used inside a business transaction (asserts `transactionLevel()===0`).
- **Auth actions call `RateLimits` before `Locks::credential()`**, so a fence rollback can't undo a limit hit (ADR-007, ADR-009).
- **The credential fence:** one PG transaction holding `pg_advisory_xact_lock(hashtextextended('auth:'‖id,0))` with `SET LOCAL lock_timeout '5s'` and `statement_timeout '20s'`. Every auth read and write goes inside it.
- **`Db::serializable()` must not nest** (a nested call throws). It retries SQLSTATE 40001/40P01 and maps exhaustion to the existing 409 codes; pair it with the `projects.version` guard.
- **Side effects after commit** (email, storage cleanup, external calls); the one exception is storage *upload*, which happens **before** the publication transaction.
- **Audit payloads never contain secrets, signed URLs or tokens**; write only via `Audit::record()`.
- **Stripe webhook:** raw body + `Webhook::constructEvent`, the existing lease-and-claim `stripe_events` ledger; `allow_promotion_codes=true` on every session; return URLs from the canonical origin. No Cashier.
- **Uploads:** validators are ported byte for byte (`ImageValidator`, `ZipValidator` with streaming `inflate_add`); **never `ZipArchive`**. Final ZIP cap 95 MB (DV-13).
- **Trusted client IP** comes from `cf-connecting-ip` only; production auth fails closed (503) without a valid IP (ADR-010).
- **Never edit `apps/web`** without a parity test and an inventory row; never write under `_bmad/bmm` or `_bmad/core`.
- Silent differences from Next aren't allowed: every deviation is a DV- row plus a logged decision.

---

## Usage Guidelines

**For AI Agents:**

- Read `apps/portal/AGENTS.md`, then this file, before implementing any code.
- Follow ALL rules exactly as documented; when in doubt, prefer the more restrictive option.
- Update this file (and AGENTS.md) when a new pattern emerges.

**For Humans:**

- Keep this file lean and focused on agent needs; update it when the stack changes (e.g. the Inertia bump on 2026-11-23).
- Re-run BMAD `generate-project-context` after each epic, or when AGENTS.md changes materially.
- Remove rules that become obvious over time.

Last Updated: 2026-11-20
