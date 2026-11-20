# Story 1.1a: Skeleton, compose, pins

**Status:** in-progress · **DoD variant:** Laravel-only · **Epic:** 1 · **Covers:** ADR-001, ADR-002, O-01, NFR-M1 · **Gate:** Pest (Laravel-only) · **After:** 0.2

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
_Filled in as built._

## Tests
_Filled in as built._

## Test evidence
_Filled in as built._

## Gotchas
- No PHP or Composer on the host. Everything runs in containers (D6).
- `php:8.5.13-*-bookworm` images exist (checked 2026-11-20), which closes the research §2 "UNVERIFIED" note.

## Docs updated
_Filled in as built._

## Open items
_Filled in as built._
