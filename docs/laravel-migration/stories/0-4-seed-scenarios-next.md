# Story 0.4: Seed scenarios (Next)

Status: done

**Covers:** O-02 (+ O-09 seam d) · **Gate:** `@unit` · **After:** 0.2 (verified on a throwaway PG 18.7 before 0.2 merged), 0.3 · **DoD:** E0

## Delivered
- `tests/parity/fixtures/scenarios/*.json`: 13 scenarios plus README. Neutral facts with deterministic IDs (`sha256("<scenario>:<kind>:<key>")` → UUID), reused by Laravel story 2.6.
- `apps/web/scripts/parity-seed.mjs`: truncates, then loads a scenario (users with Better Auth `hashPassword`, clients, projects, orders, entitlements, state audits, brief or draft, concepts plus FileAssets, revisions, comments, messages, final ZIP). It uploads objects when `R2_ENDPOINT` is set.
- `apps/web/scripts/parity-seed-guard.mjs`: refuses unless `PARITY_MODE=1`, not production, a local host, the `lf_parity` DB, and the `parity.parity_marker` table.
- `apps/web/scripts/parity-migrate.mjs`: runs `prisma migrate deploy` from an env-free temp copy, then `ops/postgres/runtime-grants.sql`.

## Evidence (2026-11-18)
- `src/lib/__tests__/parity-seed-guard.test.ts`: 9/9 (7 refusal cases plus the marker check).
- Throwaway `postgres:18.7` with roles lf_migrate (owner) and lf_runtime: migrations applied, and **all 13 scenarios seeded**.
- `next dev` on the seeded `two-tenants` DB:
  - `POST /api/auth/login` client A → `{ok:true}`;
  - `/api/projects` lists 1 project;
  - snapshot is CONCEPTS_READY, entitlements `{concepts:0, revisions:2}`, 2 concepts, 3 messages, `hasNewConcepts:true`;
  - **A → B's project: 404**;
  - admin login → session `isAdmin:true`.
- Not run: object uploads (they need 0.2's SeaweedFS).

## Gotchas
- `prisma.config.ts` loads `.env.local` with override, so migrate must run from an env-free copy (`parity-migrate.mjs`).
- Prisma refuses a non-empty `public` schema, so the marker lives in schema **`parity`** (0.2 was told).
- Admin rows must be written by the owner role (DB trigger A-19), so the seed uses the migrate URL.
- Next's `prisma.config` needs **distinct** runtime and migrate users.
