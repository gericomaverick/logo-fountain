# apps/portal: agent guide

Laravel 13 portal replacing `apps/web` (Next.js). Paths below are relative to `apps/portal/` except `MIG/`, which means `../../docs/laravel-migration/`. Deeper rules: `MIG/project-context.md` (BMAD project context).

## 0. Start here
1. `MIG/RESUME.md` → `MIG/handoff.md` (Now) → the story file in `MIG/stories/`.
2. Then by area: `MIG/architecture.md` (§4 pipeline, §5 rules, §6 structure) · `MIG/adr/` · `MIG/brownfield/` (how Next behaves) · `MIG/01-feature-inventory.md`.
3. If this guide and the code disagree, fix one of them in the same commit (architecture preamble).

## 1. Never
- **Install PHP or Composer on the host**, or `curl | bash` a PHP installer. Docker only (D6).
- **Add Laravel Boost** (the skeleton's AGENTS/CLAUDE files pushed it; not in the architecture).
- Add Fortify, Breeze, Jetstream or a starter kit (ADR-004); Cashier (ADR-014); Redis or Horizon (ADR-019); `ZipArchive` (ADR-017); Flysystem for private objects (ADR-016); SSR (arch §4.4).
- Read `env()` outside `config/*.php` (§5 Config).
- Change `apps/web` (frozen) without a parity test and an inventory row (`MIG/01-feature-inventory.md`).
- Write under `_bmad/bmm` or `_bmad/core` (symlinks to a shared plugin).
- Store secrets, tokens or live signed URLs in any file (`MIG/03-documentation-protocol.md` §4).

## 2. Run things (Docker only)
| Do | Command |
|---|---|
| Start the stack (first run: .env, composer install, key, migrate) | `docker compose up -d --build` → http://localhost:8080, `/up` |
| Quality gate (Pint `--test`, Larastan level 9, Pest; plus this guide's check) | `bin/test` (extra args go to Pest, e.g. `bin/test --filter=Health`) |
| Artisan / Composer | `bin/artisan …` · `bin/composer …` (run in the `app` container) |
| Migrations (schema owner, ADR-013) | `bin/artisan migrate --database=pgsql_migrate` |
| Frontend typecheck / build | `docker compose exec vite npm run typecheck` · `… npm run build` |
| Stop and wipe **your** stack | `docker compose down -v` (never another project's) |

**Parallel copies** (agent worktrees): export a project name and free ports before `up`; `bin/*` inherit them.
```bash
export COMPOSE_PROJECT_NAME=lf-<story> PORTAL_HTTP_PORT=18082 PORTAL_PG_PORT=55512 \
       PORTAL_VITE_PORT=15172 PORTAL_MAIL_PORT=18022 PORTAL_S3_PORT=18332
```
Defaults (`compose.yaml`): HTTP 8080 · PG 55532 · Vite 5173 · Mailpit 8025 · S3 8333, all on 127.0.0.1, distinct from the parity stack (`tests/parity/infra`).

Services: `postgres` 18.7 · `init` (one-shot, `docker/php/init.sh`) · `app` php-fpm 8.5.13 · `web` nginx 1.28 · `worker` `queue:work` · `vite` node 24 · `mailpit` v1.33.0 · `seaweedfs` 4.51 (buckets `portal-concepts`, `portal-finals`).

## 3. DB roles (ADR-013, ADR-009)
| Connection | Role | Use |
|---|---|---|
| `pgsql` (default) | runtime | DML only. DDL is refused (`tests/Feature/DatabaseRolesTest.php`) |
| `pgsql_migrate` | schema owner | `migrate --database=pgsql_migrate`, `admin:bootstrap` |
| `pgsql_limits` | runtime | rate-limit buckets only, never inside a business transaction |
Config: `config/database.php`. Dev roles and default privileges: `docker/postgres/01-roles.sh`. Production grants: `ops/postgres/runtime-grants.sql` (O-06 story).

## 4. Pins (`MIG/research-technical.md` §2 and its pin policy)
- New pins must be ≥ ~3 weeks old; later updates ≥ 14 days, **except security advisories (take immediately)**.
- Composer: caret constraints + committed `composer.lock` (`platform.php` = 8.5.13). npm: **exact** versions (`npm install --save-exact`) + `package-lock.json`; `.npmrc` sets `ignore-scripts=true`. Docker images: tag in compose, tag + digest in CI (1.1b).
- Current: PHP 8.5.13 · laravel/framework ^13.40 (advisory floor) · inertia-laravel ^3.5.2 + @inertiajs/react 3.9.1 (**bump to ^3.7 / 3.11.0 from 2026-11-23**) · React 19.3.1 · TS 6.0.3 · Vite 8.3.5 · Tailwind 4.3.3 · Pest ^5.3 · Larastan ^3.13 · Pint ^1.32 · Node 24 · PG 18.7.

## 5. Rules (architecture §5; one line each)
| Area | Rule | Ref |
|---|---|---|
| Naming | Pint (PSR-12, `laravel` preset). Classes singular nouns; Actions verb phrases (`RequestRevision`). Tables snake_case plural, columns snake_case. JSON keys **camelCase as today**, mapped in API Resources (no auto-casing) | arch §5, ADR-012 |
| JSON shape | One API Resource per endpoint with a golden contract test. Never add or remove a field without updating the parity schema and the inventory | ADR-003, `MIG/02-test-strategy.md` |
| Transactions | Multi-row changes only inside an Action transaction. Lifecycle changes: `Db::serializable()` (no nesting) + `projects.version` guard. Advisory locks only via `Locks::credential/provision/conceptUpload` | ADR-007, ADR-011, story 2.4 |
| Side effects | Emails, storage cleanup and external calls **after commit**; storage *upload* happens before the publication transaction | ADR-016, ADR-018, ADR-019 |
| Audit | Only `Audit::record(type, project, actor, payload)`. Payloads never hold secrets, signed URLs or tokens (scrubber is unit-tested) | arch §5, story 2.4 |
| Authorisation | Policies (`ProjectPolicy`, `ConceptPolicy`). Membership miss → 404 `PROJECT_NOT_FOUND`. Admin endpoints use `admin` middleware. Client concept/asset lookups only via `Concept::visibleToClient()` (arch test) | ADR-020, story 2.2 |
| Config | `env()` only in `config/*.php`. Boot validators for `PUBLIC_SITE_URL`, proxy config, DB role pair, price IDs (production refuses to boot or serve auth) | ADR-010, ADR-013, story 1.3 |
| Frontend | Pages use only `Components/ui`; tokens only; one primary button per view; copy in components or `lib/copy.ts`; every list/panel has empty, loading, error and partial states | ADR-022, `MIG/ux-design.md` §8 §12 §14 |
| Tests | Every Action → Pest feature test. Every endpoint → parity contract test. Every concurrency guard → L3 race test. Every screen → L7 baseline + axe | `MIG/02-test-strategy.md` |
| Docs | Per `MIG/03-documentation-protocol.md`. **A new pattern goes into this file in the same commit** | arch §5 |

Also always:
- **Controllers are thin:** parse, authorise, call **one Action**, shape the response. Actions never take `Request` (so L3 calls them directly). Page props and polled JSON come from the same query object (arch §4.2).
- **Errors:** throw domain exceptions with `status` + `code`; one renderer emits `{error:{message,code,details?}}`. Codes live in `app/Support/ErrorCodes.php` ↔ `resources/js/lib/errors.ts` (arch §4.2, story 1.6).
- **`/api/*` is in the `web` group** (session), excluded from `PreventRequestForgery`; the origin guard is the CSRF control (ADR-003, ADR-008).
- **Pipeline order matters** (arch §4.1): SecurityHeaders → RequireCanonicalOrigin → TrustedClientAddress → session → EnforceAbsoluteSession → auth/policy → controller → Action.

## 6. Definition of done (`MIG/epics.md` → Overview; pick the story's variant)
| Variant | Applies to | Must be true |
|---|---|---|
| **E0 (spec)** | Epic 0 | Gate green **on Next** except `tests/parity/expected-next-failures.txt` (must fail). Inventory Tag + Tests filled, status stays `Not started`. Story record, handoff, pushed |
| **Laravel-only** | Gate is only `@unit`, `@pg-race`, `@visual` or Pest | Gate + full Laravel suite green. Ledger rows resolved. Inventory `Verified` where the row completes. Story record, handoff, pushed |
| **Conversion** | `@api` or `@ui` gates | Gate green on Laravel **and** Next result = `expected-next-failures.txt`. Every earlier gate still green on Laravel. Laravel page objects in `tests/parity/pages/laravel/` (accessible locators first; `data-testid` only there; shared journeys unchanged). Ledger rows resolved, inventory `Verified`, story record, handoff, pushed |
Checklist: `MIG/03-documentation-protocol.md` §3. Story record template: `MIG/templates/story-conversion-record.md`. Record what you didn't run.

## 7. Where things go (architecture §6)
| Thing | Path |
|---|---|
| Business transactions | `app/Actions/{Auth,Checkout,Brief,Concepts,Revisions,Finals,Projects,Admin}/` |
| Value objects, enums (`ProjectState`, `SafeNext`, …) | `app/Domain/` |
| Controllers | `app/Http/Controllers/{Api,Api/Admin,Pages,Pages/Admin,Webhooks}/` |
| Middleware | `app/Http/Middleware/` (`RequireCanonicalOrigin`, `TrustedClientAddress`, `EnforceAbsoluteSession`, `AuthJsonBoundary`, `SecurityHeaders`, `EnsureAdmin`) |
| Legacy JSON shapes | `app/Http/Resources/` |
| Mailables | `app/Mail/` (views in `resources/views/mail/`) |
| Helpers (`Db`, `Locks`, `ErrorCodes`, `Audit`, `RateLimits`) | `app/Support/` |
| R2 store, upload validators | `app/Storage/` |
| Artisan commands | `app/Console/Commands/` |
| Models / policies | `app/Models/` · `app/Policies/` |
| Schema (runs as `pgsql_migrate`) / seeders | `database/migrations/` · `database/seeders/` |
| Inertia pages / design system / domain UI | `resources/js/Pages/` · `resources/js/Components/ui/` · `resources/js/Components/` |
| TS behaviour modules, API client, hooks | `resources/js/lib/` · `resources/js/api/` · `resources/js/hooks/` |
| Tokens / Blade root | `resources/css/app.css` · `resources/views/app.blade.php` |
| Routes (pages + `/api` group) | `routes/web.php` · `routes/console.php` |
| Pest tests | `tests/{Unit,Feature,Concurrency,Arch}/` |
| Runbooks | `docs/*.md` (this app; Laravel versions of `apps/web/docs`) |
| Shared parity suite | `../../tests/parity/` |
Requirement series → code: A → `Actions/Auth`, middleware, `Support/RateLimits` · K → `Actions/Checkout`, `Controllers/Webhooks` · C/D → `Actions/*` + `Pages` · N → `Mail/` · X → `Support/`, `Storage/`, middleware, `Domain/` · O → `Console/Commands`, `ops/`, `compose.yaml`.

## 8. Gotchas (promoted from story records)
- `env()` only in `config/*.php`; a Pest scan (`tests/Feature/ConfigBootValidationTest.php`) backs Larastan's rule (1.3).
- Production-only behaviour: test it with a real `php artisan` subprocess and `APP_ENV=production` (see `ConfigBootValidationTest.php`), not by flipping config in-process (1.3).
- Symfony appends `, private` to `Cache-Control`: `no-store` becomes `no-store, private`, but parity expects exactly `no-store` (1.3, 1.6).
- Inertia pages live in `resources/js/Pages` (capital P), set in `config/inertia.php`; Inertia's default is lowercase (1.1a).
- Empty folders vanish in git: keep `tests/Unit/.gitkeep`, or Pest fails on a fresh clone (1.1a).
- TypeScript 6 deprecates `baseUrl`: use a relative `paths` entry (`tsconfig.json`) (1.1a).
- No external font or asset hosts (the skeleton loaded Bunny Fonts); fonts are self-hosted (1.7) (1.1a).
- Migrations always use `--database=pgsql_migrate`; the skeleton's `composer setup` used the runtime role (fixed in `composer.json`) (1.1a).
- `php:8.5.13-*-bookworm` images exist; don't drop below 8.5.13 (ADR-001) (1.1a).
- `MIG/project-context.md` is the BMAD project context; refresh it (BMAD `generate-project-context`) when this guide changes materially (1.2).

## 9. Keeping this guide honest
- New pattern, rule or cross-story gotcha → add it here **in the same commit** (§5 Docs).
- `bin/check-agents-guide` (run by `bin/test`) fails if §5 above is missing an Area row from `MIG/architecture.md` §5 or a DoD variant from `MIG/epics.md`.
