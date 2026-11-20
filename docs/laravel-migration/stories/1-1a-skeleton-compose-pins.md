# Story 1.1a: Skeleton, compose, pins

**Status:** done (2026-11-20) · **DoD variant:** Laravel-only · **Epic:** 1 · **Covers:** ADR-001, ADR-002, O-01, NFR-M1 · **Gate:** Pest (Laravel-only) · **After:** 0.2

## Acceptance criteria (epics.md §1.1a)
1. **Given** a fresh clone, **when** `docker compose up` runs (in `apps/portal`), **then** `/up` responds.
2. Pest, **Larastan level 9** and Pint pass.
3. Versions match `research-technical.md` §2 (PHP 8.5 ≥ the 2026-11-19 security patch, i.e. ≥ 8.5.13).

## Scope (and what's deliberately left out)
- **In:**
  - the `laravel/laravel` v13 skeleton in `apps/portal`, with no starter kit (ADR-004);
  - pinned composer and npm dependencies;
  - Inertia v3, React 19, TypeScript, Vite 8 and Tailwind 4 wired up, with one placeholder Inertia page;
  - PostgreSQL 18.7 with separate runtime and migrate roles (ADR-013);
  - `compose.yaml` with app (php-fpm + nginx), worker, vite, postgres, mailpit and seaweedfs;
  - Pest 5, Larastan level 9 and Pint;
  - a `bin/` wrapper so no host PHP is needed.
- **Out:**
  - CI (1.1b);
  - `AGENTS.md` (1.2);
  - config validation (1.3);
  - design tokens and the UI (1.7+);
  - any feature work.

## Inventory scope
O-01 (local dev environment). No parity tags.

## Next.js source read
None (Laravel-only foundation). Read: `architecture.md` §3, §4.6, §6; ADR-001, ADR-002, ADR-013; `research-technical.md` §2.

## Behaviour notes
None (no legacy behaviour is ported).

## Laravel implementation
| Piece | Where |
|---|---|
| Skeleton (laravel/laravel 13.11.0, no starter kit) | `apps/portal/` |
| Two DB roles plus a limits connection (ADR-013, ADR-009) | `config/database.php` (`pgsql` runtime, `pgsql_migrate`, `pgsql_limits`); dev roles and default privileges in `docker/postgres/01-roles.sh` |
| Inertia v3 + React 19 + TS 6 + Vite 8 + Tailwind 4 | `bootstrap/app.php` (HandleInertiaRequests), `config/inertia.php` (pages in `resources/js/Pages`), `resources/views/app.blade.php`, `resources/js/app.tsx`, `resources/js/Pages/Home.tsx`, `vite.config.ts`, `tsconfig.json` |
| Dev stack | `compose.yaml`: postgres 18.7, init (one-shot: .env, composer install, key, migrate as `pgsql_migrate`), app (php-fpm 8.5.13), web (nginx 1.28), worker (`queue:work`), vite (node 24), mailpit v1.33.0, seaweedfs 4.51. `docker/php/Dockerfile` |
| Host wrappers (no host PHP) | `bin/artisan`, `bin/composer`, `bin/test` |
| Quality | `phpstan.neon` (Larastan, level 9), `pint.json` (laravel preset), `tests/Pest.php` |

## Tests
| Layer | Test file / title | Inventory IDs |
|---|---|---|
| L1 Pest | `tests/Feature/HealthTest.php`: health check; Inertia `Home` renders | O-01 |
| L1 Pest | `tests/Feature/DatabaseRolesTest.php`: distinct roles; runtime DDL refused; migrate-created table usable by runtime | O-01, ADR-013 |
Test-port ledger rows resolved: none.

## Test evidence
- In the working copy: `bin/test` gives Pint ✓, Larastan level 9 "No errors", Pest **5 passed (13 assertions)**. `npx tsc --noEmit` ✓. `vite build` ✓. `composer audit` and `npm audit --omit=dev` show 0 advisories.
- **Fresh clone (AC 1):** `git clone` into the scratchpad, then `docker compose -p lf-portal-fresh up -d --build`: `/up` returned **200** within about 2 s of the containers starting; `/` returned 200. Inside the clone: Pint ✓, Larastan ✓, Pest 5 passed. Torn down with `down -v`.

**Not run, and why:** CI (story 1.1b). Parity tags (no endpoints yet).

## Gotchas
- **The `laravel/laravel` skeleton ships `AGENTS.md`/`CLAUDE.md` (Laravel Boost bootstrap)** that tell agents to `curl | bash`-install PHP on the host and add Boost. They were replaced with pointers to the migration docs (story 1.2 writes the real guide). → `apps/portal/AGENTS.md`.
- Inertia's default page path is lowercase `resources/js/pages`; we use `Pages` (architecture §6), set in `config/inertia.php`.
- Git drops empty folders: `tests/Unit/.gitkeep` is needed, or Pest stops on a fresh clone.
- TypeScript 6 deprecates `baseUrl`: use a relative `paths` entry.
- The skeleton's Vite config loaded a font from Bunny Fonts (external). Removed; fonts are self-hosted in 1.7.
- The skeleton's `composer setup` script migrated as the default (runtime) role. It now uses `--database=pgsql_migrate`.
- No PHP or Composer on the host. Everything runs in containers (D6).
- `php:8.5.13-*-bookworm` images exist (checked 2026-11-20), which closes the research §2 "UNVERIFIED" note.

## Docs updated
Inventory O-01 · sprint-status · handoff · `research-technical.md` §2 (PHP 8.5.13 verified; framework ^13.40) · DECISIONS.

## Open items
- **2026-11-23 or later:** bump Inertia to `^3.7` / `@inertiajs/react 3.11.0` (pin age reached). Owner: whoever runs the next Epic 1 story after that date.
- Docker image digests are pinned in CI (1.1b), per the pin policy.
- Production grants script `ops/postgres/runtime-grants.sql` (O-06 story). Dev relies on default privileges.
