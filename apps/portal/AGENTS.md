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
| Migrations (schema owner, ADR-013), then runtime grants (every time, §3) | `bin/artisan migrate --database=pgsql_migrate && bin/artisan db:grants` |
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
| `pgsql` (default) | runtime | DML only. DDL is refused; no access to `migrations` or `auth_admin_bootstrap` (`tests/Concurrency/RuntimeRoleTest.php`) |
| `pgsql_migrate` | schema owner | `migrate --database=pgsql_migrate` then `db:grants`, `admin:bootstrap` |
| `pgsql_limits` | runtime | rate-limit buckets only, never inside a business transaction |
Config: `config/database.php`. Dev roles (attributes, database `CONNECT`): `docker/postgres/01-roles.sh`. Grants and default privileges: `ops/postgres/runtime-grants.sql`, applied by `php artisan db:grants` after **every** migrate (`docker/php/init.sh`, the Pest harness, deploy). A new operator-only table must be revoked in that file. Production boot fails unless `pgsql_limits` is the runtime role on the runtime's host, port and database (`DatabaseRoles::assertLimitsUsesRuntime`). `profiles.is_admin` can only be set or changed by the table owner (trigger `protect_operator_admin_flag`, A-19; its function qualifies catalog names and pins `search_path`, and the runtime role must have no `TEMP`): runtime code must never write it, including in upserts (F-17).

## 4. Pins (`MIG/research-technical.md` §2 and its pin policy)
- New pins must be ≥ ~3 weeks old; later updates ≥ 14 days, **except security advisories (take immediately)**.
- Composer: caret constraints + committed `composer.lock` (`platform.php` = 8.5.13). npm: **exact** versions (`npm install --save-exact`) + `package-lock.json`; `.npmrc` sets `ignore-scripts=true`. Docker images: tag in compose, tag + digest in CI (1.1b).
- Current: PHP 8.5.13 · laravel/framework ^13.40 (advisory floor) · inertia-laravel ^3.5.2 + @inertiajs/react 3.9.1 (**bump to ^3.7 / 3.11.0 from 2026-11-23**) · React 19.3.1 · TS 6.0.3 · Vite 8.3.5 · Tailwind 4.3.3 · Pest ^5.3 · Larastan ^3.13 · Pint ^1.32 · Node 24 · PG 18.7.

## 5. Rules (architecture §5; one line each)
| Area | Rule | Ref |
|---|---|---|
| Naming | Pint (PSR-12, `laravel` preset). Classes singular nouns; Actions verb phrases (`RequestRevision`). Tables snake_case plural, columns snake_case. JSON keys **camelCase as today**, mapped in API Resources (no auto-casing) | arch §5, ADR-012 |
| JSON shape | One API Resource per endpoint with a golden contract test. Never add or remove a field without updating the parity schema and the inventory | ADR-003, `MIG/02-test-strategy.md` |
| Transactions | Multi-row changes only inside an Action transaction. Lifecycle changes: `Db::serializable($work, $conflict)` (no nesting; 3 attempts on 40001/40P01, then the route's 409) + `Db::guardedProjectUpdate()` (the only writer of `projects.version`). Advisory locks only via `Locks::credential/provision/conceptUpload` | ADR-007, ADR-011, story 2.4 |
| Side effects | Emails, storage cleanup and external calls **after commit**; storage *upload* happens before the publication transaction | ADR-016, ADR-018, ADR-019 |
| Audit | Only `Audit::record(type, project, actor, payload)`. Payloads never hold secrets, signed URLs or tokens (`Scrubber::scrubAuditPayload`, unit-tested) | arch §5, story 2.4 |
| Authorisation | Policies (`ProjectPolicy`, `ConceptPolicy`). Membership miss → 404 `PROJECT_NOT_FOUND`. Admin endpoints use `admin` middleware. Client concept/asset lookups only via `Concept::visibleToClient()` (arch test) | ADR-020, story 2.2 |
| Audit | Only `Audit::record(type, project, actor, payload)`. Payloads never hold secrets, signed URLs or tokens (scrubber is unit-tested) | arch §5, story 2.4 |
| Authorisation | Policies (`ProjectPolicy`, `ConceptPolicy`). Membership miss → 404 `PROJECT_NOT_FOUND`. Admin endpoints use `admin` middleware. Abilities `participate` (member) / `view` (admin or member) / `administer` (admin); no `Gate::before`. Admin = `User::isAdmin()` (flag + verified email). Client concept/asset lookups only via `Concept::visibleToClient()`, `Project::clientVisibleConcepts()` / `clientVisibleAssets()` (arch test) | ADR-020, story 2.2 |
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
- Every model uses `Concerns/HasMillisecondTimestamps` (`timestamp(3)`); jsonb columns returned verbatim use the `'object'` cast, so `{}` stays `{}` (2.2).
- `ProfileFactory::admin()` sets `is_admin` as the owner, so it needs committed rows: use `TruncatesDatabaseAsOwner` (as `Feature/Models`, `Feature/Policies` do) (2.2).
- Never `migrate` on the default (runtime) connection, in tests too. `tests/TestCase.php` migrates `portal_test` once per process as `pgsql_migrate` + `db:grants` (`Tests\Support\MigratesAsOwner`); `Feature/Schema` uses `RefreshDatabaseAsOwner` (transacts `pgsql` only: rows written via `pgsql_migrate`/`pgsql_limits` commit, and the owner can't see uncommitted runtime rows), `Concurrency` uses `TruncatesDatabaseAsOwner`. Never let the owner drop or alter a table the runtime touched inside the test transaction: it waits for that transaction forever (2.1).
- Do not run the credential fence (`Locks::credential`, story 4.2) inside `Db::serializable()`: the lock would be taken after the transaction's snapshot is set, so it would not serialise the data reads. Use a plain `DB::transaction` (2.4 review).
- `Locks::*` outside `Db::serializable()` has no wait limit; add `SET LOCAL lock_timeout` in the caller's plain transaction where Next had Prisma's limits (2.4 review).
- `ON DELETE RESTRICT` raises SQLSTATE `23001` (restrict_violation), not `23503` (2.1).
- `migrate:fresh` drops tables but not functions: raw-SQL functions use `CREATE OR REPLACE` and `down()` drops them (2.1).
- `docker/postgres/01-roles.sh` runs only on a fresh volume: after changing it, `docker compose down -v` (2.1).
- Screens render inside `Layouts/CustomerShell` or `Layouts/AdminShell`. URL-routed section tabs use `TabNav` (a `<nav>` with `aria-current="page"`); `Tabs` is only for in-page panels (1.9).
- Screen specs call `expectOnePrimaryPerView(page)` (`tests/browser/support/views.ts`); "one primary button per view" is checked in the browser, not linted (1.9).
- Every axe run first waits for finite CSS animations to end (`settleAnimations`), or a fading dialog reads as low contrast on slow CI machines (1.9 CI).
- An extended accessible name uses an `aria-label` that starts with the visible text (a hidden suffix span adds a stray space) (1.9).
- ESLint exceptions are an inline disable with a reason. `bin/lighthouse` measures a production build only: stop vite, remove `public/hot`, build (1.9).
- Screens poll only through `hooks/usePolling` plus `PollingStatus` (backoff from the 3rd failure, pause when hidden, one request at a time, polite announcements); new items are appended at the end, never moved above focus (1.8c).
- Private (signed) images only through `PrivateImage` (ADR-021: keeps the shown image until its key changes or the URL nears expiry) (1.8c).
- Playwright: pausing the clock (`pauseAt`) also stops Radix focus restore and axe, which use timers (1.8c).
- Ported Next Vitest suites run unchanged on `node:test` via `tests/js/support/vitest-shim.ts`; don't add Vitest (1.8c).
- Turn, stage and status UI comes only from `resources/js/lib/status.ts` (pinned to Next's `buildTimeline` and `customerActionFor` by a generated fixture; regenerate it if `apps/web` changes). Unknown states count as the designer's turn (1.8b).
- A celebration's Sfizia comes only via `TurnBanner` celebration, and any page showing one must be listed in `config/ui.php` `display_font_pages` (1.8b). Skeletons never loop (UX §8.3) (1.8b).
- Each catalogue area has its own page and spec: `/dev/ui` (1.8a), `/dev/ui/status` (1.8b), `/dev/ui/media` (1.8c), so baselines don't clash (1.8b).
- UI primitives live in `resources/js/Components/ui/` and are shown at `/dev/ui` (local/testing only). A new primitive or state gets a catalogue entry plus baselines: `bin/browser-test --update-snapshots`, only in the pinned Playwright image (1.8a).
- No plain `disabled` on buttons: use `disabledReason`, which keeps the button focusable and announces why (1.8a).
- Radix menus use `modal={false}`. Inside modal dialogs, show errors with `InlineAlert` (a modal hides toasts from screen readers) (1.8a).
- Browser tests wait for page content before checking fonts or running axe (pages load lazily), and move the pointer away before screenshots (1.8a).
- The origin guard is **global** (`bootstrap/app.php`: SecurityHeaders → TrustedClientAddress → RequireCanonicalOrigin, asserted by `tests/Arch/OriginGuardTest.php`). Every new `/api` mutation is guarded automatically; a new exemption needs an ADR-008 change (1.4).
- Pest tests of `/api` mutations must send a canonical `Origin` and use an explicit host (see `tests/Feature/OriginGuardTest.php`). Laravel skips `PreventRequestForgery` under Pest, so CSRF is proven by the arch test, not by feature tests (1.4).
- Security decisions use `$request->getRealMethod()` (a `_method` override must never skip a check) and the decoded routing path (1.4).
- No `serve => true` on local disks: it registers an unguarded `PUT /storage/{path}` (1.4).
- Parity against Laravel: `tests/parity/scripts/laravel-stack.mjs "<gate>" [--only <title regex>]` starts its own portal stack. `tests/parity/converted-tags.txt` lists the gates CI must keep green (1.4).
- Workflow edits: no unquoted `: ` inside a step name or value (YAML reads it as a key, and GitHub rejects the whole file). Validate with `docker run --rm -v "$PWD":/repo -w /repo rhysd/actionlint:1.7.7` before pushing (1.5 merge).
- Never use `$request->ip()` for limits or audit: use `ClientAddress::for($request)` (a Pest scan blocks `->ip()` in `app/`). `TrustProxies` is removed on purpose: it trusts every proxy on `*.on-forge.com` hosts (`vendor/.../TrustProxies.php:69-77`). Don't add it back (1.5).
- Porting a JS rule: JS `$` = PHP `$` with `/D`; the `trim()` sets differ (JS strips `\f` and NBSP, PHP strips `\0`). Use `App\Support\NodeCompat` (1.5).
- Pest runs with no proxy config (`phpunit.xml`); the dev `.env` and nginx use `cf-connecting-ip`. `NginxClientAddressTest` needs the `web` service (1.5).
- A first `docker compose up -d --build` on a new project name can fail with `image ... already exists` (app and worker build one tag in parallel). Re-run `up -d` (1.5).
- Colours, type and spacing come only from the tokens in `resources/css/app.css` (UX §8). Tailwind's default palette is removed, and the design lint (`scripts/design-lint.mjs`, `bin/ui-test`) rejects raw colours (1.7).
- Sfizia only via `Components/ui/DisplayTitle.tsx`. A new use needs a UX §8.2 change, the lint's `DISPLAY_TITLE_CALLERS` allowlist and `config/ui.php` `display_font_pages` (preload) updated (1.7).
- Keep `@viteReactRefresh` before `@vite` in `app.blade.php`, or no React page renders in dev (1.7). Browse the dev app at `localhost`, not `127.0.0.1` (Vite CORS) (1.7).
- Inline text links are always underlined (axe `link-in-text-block`) (1.7).
- UI checks: `bin/ui-test` (lint, node:test unit tests, tsc) and `bin/browser-test` (Playwright L7/L7a in `tests/browser`, against the running stack) (1.7).
- Pest must not depend on Vite: `tests/TestCase.php` calls `withoutVite()` (1.1b).
- L3 concurrency tests go in `tests/Concurrency/*Test.php` (their own testsuite, run serially after L1/L2 in CI) (1.1b).
- A new secret env var goes into `SecurityCheck::PRIVATE_KEYS`; a new token format gets a `bin/log-grep` pattern plus a self-test line (1.1b).
- Images are pinned by tag **and digest** (`compose.yaml`, `docker/php/Dockerfile`, parity compose): bump both together (1.1b).
- Docker Desktop: editing a single-file bind mount with `sed -i` leaves the container's mount stale. Use `docker compose up -d --force-recreate <svc>` (1.1b merge).
- Where Next sends exactly `no-store`, use `RawCacheControlHeaderBag::noStore()` (`app/Http/RawCacheControlHeaderBag.php`) (1.6).
- API errors: throw `ApiException` (envelope `{error:{message,code?,details?}}`); never hand-build error JSON (1.6). 1.3's two 503 middlewares still build theirs inline; refactor them when touched.
- A middleware can't try/catch a route's exceptions (the handler already rendered them): inspect `$response->exception` (1.6).
- Logs are scrubbed by `Support/Scrubber.php` on every channel. `Audit::record` uses its audit profile `Scrubber::scrubAuditPayload()`: a top-level `checkoutSessionId` is kept and emails aren't masked (owner); logs still redact both (1.6, 2.4).
- Tests that reach `Db::serializable()`, directly or through an Action, use the truncation harness (`tests/Concurrency`), never `RefreshDatabase`: its wrapping transaction makes the nesting guard throw (2.4).
- `App\Support\Db` and the `DB` facade are the same name to PHP (class names are case-insensitive): in a file that uses both, `use Illuminate\Support\Facades\DB as Database;` (2.4).
- `Db::serializable()` work can run up to 3 times: no side effects outside the database in it; queue them with `DB::afterCommit()` (a failed attempt discards them) (2.4).
- The truncation harness doesn't disconnect between tests and PG has 100 slots: `afterEach` disconnect `pgsql` and `pgsql_migrate` (see `tests/Concurrency/SerializableTest.php`) (2.4).
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
