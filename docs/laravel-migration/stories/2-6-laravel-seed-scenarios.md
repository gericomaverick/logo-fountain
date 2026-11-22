# Story 2.6: Laravel seed scenarios

**Status:** done (2026-11-22) · **DoD variant:** Laravel-only · **Epic:** 2 · **Covers:** O-02 · **Gate:** Pest · **After:** 2.2 (stack on `workbench/2-2-models`, the 2.2 builder's branch, which already contains 2.1 `workbench/schema`; unmerged), 0.4 (Next seed, reference only)

> Created with BMAD `create-story`, from the researcher draft in `reports/story-drafts-2-4100.md` (Workbench). Its `file:line` citations were checked against `apps/web`, `tests/parity`, the 2.2 branch and the docs, and corrected (see *Doc / code disagreements*). The structure follows `stories/2-5-shared-rate-limit-store.md` and `templates/story-conversion-record.md`. Docs only: no portal code was written for this file.

## Story
As the portal team, I need `php artisan parity:seed <scenario>` to produce the same logical facts as the Next seed for every scenario in `tests/parity/fixtures/scenarios/`, so that Laravel parity journeys start from known states and one shared SQL assertion can check both apps against the same expected facts.

## Acceptance criteria
From `epics.md:261-263` (§2.6) and the brief's 2.6 note (`briefs/workbench-epic-2.md:58`), expanded. Split: the **Laravel half** is built and tested here; the **Next comparison** is an owner item with one command (see *Owner items*).

1. **Command.** `php artisan parity:seed {scenario}` reads `{fixtures dir}/{scenario}.json` (dir from config, default `/var/www/parity-fixtures/scenarios`, AC 10). The name must match `^[a-z0-9-]+$`, as Next's does (`parity-seed.mjs:57`). An unknown name, a bad name or malformed JSON exits non-zero with a message and writes nothing. → `ParitySeedTest`.
2. **Guard (0.4 rules, adapted).** Checked before any write, in this order, each with its own message (Next: `parity-seed-guard.mjs:5-15`, `:19-22`):
   - `PARITY_MODE=1` (`:6`).
   - `APP_ENV` is not `production` (Next checks `NODE_ENV`, `:7`).
   - The `pgsql_migrate` host is local: `127.0.0.1`, `localhost`, `postgres`, `::1` (`:3`, `:13`). Inside the portal container `DB_HOST=postgres` (`.env.example:25`).
   - The table `parity.parity_marker` exists (`to_regclass`, `:19-22`).
   Next's database-name check (`lf_parity`, `:14`) can't be copied: the Laravel parity stack's database is `portal` (`tests/parity/scripts/laravel-stack.mjs:80`), the same name as the owner's dev database (`docker/postgres/01-roles.sh`, `2-1-…md:82`). The marker is what stops a seed of the dev database. Where the marker is created is *Open questions* 2. → `ParityGuardTest` (one case per refusal, each asserting nothing was written).
3. **Every fixture seeds.** All **18** JSON files in `tests/parity/fixtures/scenarios/` seed into an empty database without error, and seeding the same scenario twice in a row also succeeds. The seeder truncates first, inside the same transaction as the inserts, as Next does (`parity-seed.mjs:71-72` `BEGIN` + `TRUNCATE … CASCADE`, `COMMIT` `:155`). The dataset is built from the directory listing, not a hard-coded list, so a new fixture is picked up (and fails loudly if unhandled). → `ParitySeedTest`.
4. **Facts match the JSON.** After seeding, the shared SQL facts (AC 6) equal the expectation computed from the JSON file itself. This makes the Laravel gate independent of Next. → `ParitySeedTest` (same dataset).
5. **Deterministic IDs.** Every seeded id is `ScenarioId::for(scenario, kind, key)`: `sha256("<scenario>:<kind>:<key>")` shaped as a v4 UUID, copied exactly from `parity-seed.mjs:45-49` (identical to `tests/parity/adapters/seed.ts:33-37`). The `kind`/`key` strings are Next's (`id("user", u.key)`, `id("project", p.key)`, `id("client", p.key)`, `id("membership", "<project>:<member>")`, `id("audit", "<project>:state:<state>:<tick>")` …; read them from `parity-seed.mjs:60-153`). Seeded rows never take a `HasUuids` v7 id (*Open questions* 5). → `ScenarioIdTest` (golden values produced by the Node function, pasted into the test).
6. **Shared SQL assertion.** `tests/parity/scripts/seed-facts.sql` prints one ordered row per logical fact: user count, verified-user count, admin count, profile count, projects per status, memberships, `state_changed` events per project in order (previous → next status), entitlements `[limit, consumed, reserved]` per key, concept / message / revision / comment counts. Table and column names come from a per-app wrapper (`seed-facts-laravel.sql` now; `seed-facts-next.sql` as part of the owner item), so the body is shared. It compares no absolute timestamps (Next stamps rows from the seed-time clock, `parity-seed.mjs:73`, `:93-94`), only order. → run by AC 4.
7. **2.1 mapping.** `emailVerified: true` ⇔ `users.email_verified_at IS NOT NULL` (2.1 *Decisions*, `2-1-…md:140`). `password: null` (only `fresh-purchase.json`) ⇔ `users.password IS NULL` (2.1 checklist row 1, `2-1-…md:95`); otherwise `Hash::make` (bcrypt). Profile id = user id (2.1 AC 2). Admin: `profiles.is_admin = true` and an `auth_admin_bootstrap` row `id = 1` for the first admin, `ON CONFLICT DO NOTHING` (`parity-seed.mjs:86`; table `2-1-…md:115`). Entitlements: `project_entitlements (key, limit_int, consumed_int, reserved_int)` (`2-1-…md:104`).
8. **Writes go through the migrate role, as raw inserts.** The admin-flag trigger (2.1 AC 3) only lets the owner set `is_admin`, and the README requires it (`scenarios/README.md:8`). Seeding uses `DB::connection('pgsql_migrate')->table(...)`, not Eloquent, so 2.2's rule (`is_admin` not mass-assignable and never written by a model save, `2-2-…md:70`) still holds. → `ParitySeedTest` (admin scenario: flag set; the same insert on the runtime connection is refused).
9. **Adapter routing.** `tests/parity/adapters/seed.ts`'s Laravel branch (`seed.ts:55-57`, host `php` with `cwd=apps/portal` today) runs the seeder **inside the portal container**: `docker compose` with the same project name and compose files as `laravel-stack.mjs` (`COMPOSE_PROJECT_NAME = PARITY_LARAVEL_PROJECT || "lf-parity-laravel"`, `:52`; `-f apps/portal/compose.yaml -f tests/parity/infra/laravel.compose.yaml`, `:57`), then `exec -T -e PARITY_MODE=1 app php artisan parity:seed <name>`. `PARITY_MODE` must be passed explicitly: `exec` doesn't carry the host env. Also remove "Not wired yet: seeding" from the `laravel-stack.mjs` header (`:10`). Verified by reading only (`tests/parity` has no `node_modules`, brief §5).
10. **Mount.** `apps/portal/compose.yaml` mounts `../../tests/parity/fixtures/scenarios` read-only at `/var/www/parity-fixtures/scenarios` on the `app` service, next to 2.3's `/var/www/parity-fixtures/rules:ro` (2.3 AC 8). The container reads the shared JSON in place, so there's no copy to drift. A missing directory fails with a message naming the mount; there is no fallback. → `ParitySeedTest` (config points at a missing dir).

## Inventory scope
- **O-02** (`01-feature-inventory.md:157`): the row is the Next local-dev seed (`lib/local-dev-seed*`) with the parity seed noted in brackets. Fill the Laravel/Tests columns with `parity:seed` and the tests here; the row stays open until the owner runs the Next comparison (*Owner items*).
- No ledger row: `parity-seed-guard.test.ts` belongs to 0.4 (Next); `ParityGuardTest` is the Laravel equivalent. Say so in the record.

## Next.js source read
- `apps/web/scripts/parity-seed.mjs` (168 lines): `scenarioId` `:45-49`; `APP_TABLES` `:51-53` (24 Prisma tables, including `StripeEvent` and every `Auth*` table); name check `:57`; marker `:70`; one transaction `:71`-`:155`; users `:79`, profiles with `isAdmin` `:80-81`, credential account with Better Auth `hashPassword` `:82-85`, admin bootstrap `:86`; per project (`:90`-`:153`) clients, memberships (`role 'owner'`), orders, entitlements, `state_changed` audits one `tick` minute apart (`:93-94`, `:112-113`), brief or draft, concepts, revisions, comments, thread and messages; object uploads after `COMMIT`, only when `R2_ENDPOINT` is set (`:61`, `:162`).
- `apps/web/scripts/parity-seed-guard.mjs` (22 lines): allowed hosts `:3`; env checks `:6-7`; URL/protocol/host/DB name `:8-14`; marker `:19-22`.
- `tests/parity/adapters/seed.ts`: `scenarioId` `:33-37`; `seed()` needs the exclusive lease `:40-46`; `runSeeder` `:48-58`. `target.ts:11-15` (`PARITY_TARGET` is `next` or `laravel`).
- `tests/parity/scripts/laravel-stack.mjs`: project name `:52`, compose files `:57`, `PARITY_DATABASE_URL` = `portal_migrate@…/portal` `:80`. `tests/parity/infra/laravel.compose.yaml`: env override only, no volumes today.
- `tests/parity/fixtures/scenarios/README.md`: entitlements `:5`, IDs `:6`, passwords and `password: null` `:7`, admins through the migrate role `:8`.
- `tests/parity/infra/postgres/init/10-parity.sh:27-36`: how Next's parity database gets its marker (init script of the Next parity stack only).

## Behaviour notes (written before converting)
- Next's seed is all-or-nothing: truncate and every insert in one transaction, uploads after commit. A failure leaves the previous state. Keep that.
- Next truncates exactly `APP_TABLES`. The Laravel list is the 2.1 equivalent of each (per the 2.1 checklist) plus `sessions`, `jobs` and `failed_jobs` (a queued mail from a previous scenario mustn't fire against the new one, story 2.7). Never `migrations`, never the `parity` schema (*Open questions* 6).
- Passwords: Next seeds Better Auth hashes, which Laravel can't read. Laravel seeds bcrypt (`Hash::make`; 2.1 checklist row 1). Passwords are test-only values (`scenarios/README.md:7`).
- Admin id for `state_changed` actors: the first `admin: true` user, or `null` for the first event (`parity-seed.mjs:88`, `:113`). Copy this.
- Storage: rows only until 3.1 builds object storage (*Open questions* 4).

## Laravel guidance (for the dev agent)
- `app/Console/Commands/ParitySeed.php` (`parity:seed {scenario}`; `AGENTS.md` §7 *Artisan commands* row). The guard (AC 2) runs first.
- The loader, `ScenarioId` and the seeder go under `database/seeders/Parity/` (`AGENTS.md` §7 *Schema / seeders* row), so no new §7 row is needed. If you put them elsewhere, add the row in the same commit (`AGENTS.md` §5 *Docs* row: a new pattern goes into the guide in the same commit).
- Inserts: `DB::connection('pgsql_migrate')->table(...)`, in one `transaction()` on that connection. Use the 2.1 column names and timestamp format (`2-1-…md:91`, `ts` = `timestamp(3)`).
- `env()` only in `config/*.php` (`AGENTS.md` §5 *Config* row): `PARITY_MODE` and the fixtures dir are read through config (e.g. `config/parity.php`).
- Test harness: `TruncatesDatabaseAsOwner` (2.1/2.2, `tests/Support/TruncatesDatabaseAsOwner.php` on `workbench/2-2-models`; `AGENTS.md` §8, the `ProfileFactory::admin()` gotcha). Not `RefreshDatabase`: the seeder commits on `pgsql_migrate`, and the test reads back on another connection. Disconnect `pgsql` and `pgsql_migrate` after each test (`AGENTS.md` §8, 2.4's 100-slot gotcha, if 2.4 has merged by then).
- The guard tests need the marker in `portal_test`: create `parity.parity_marker` in the test setup through `pgsql_migrate`, and check the truncation harness doesn't touch the `parity` schema.

## Planned deviations from Next.js (confirm in the Conversion record)
| Behaviour | Next.js | Laravel | Why | Decision ref |
|---|---|---|---|---|
| Password hash | Better Auth `hashPassword` (`parity-seed.mjs:84`) | bcrypt `Hash::make` | No Better Auth; not compared by the facts | ADR-006, 2.1 row 1 |
| Email verified | `emailVerified` boolean (`:79`) | `email_verified_at` timestamp | Laravel convention | 2.1 *Decisions* |
| Guard: database name | must be `lf_parity` (`parity-seed-guard.mjs:14`) | no name check; marker only | Laravel parity DB is `portal`, same as the dev DB | *Open questions* 2 |
| Runner | Node on the host (`seed.ts:51`) | `docker compose exec app php artisan` | Brief §7 | brief §7 |
| Object storage | uploads when `R2_ENDPOINT` is set (`:61`, `:162`) | rows only | Epic 3 not built | epics 3.1 |
None is visible to the parity journeys, which assert facts and behaviour, not hashes.

## Tasks
1. `ScenarioId` + golden test (AC 5).
2. Loader and guard (AC 1, 2), config, `ParityGuardTest`.
3. Seeder: truncate list, users/profiles/admin, projects and children, one transaction (AC 3, 7, 8).
4. `seed-facts.sql` + Laravel wrapper; `ParitySeedTest` dataset over the directory (AC 4, 6).
5. Compose mount (AC 10); `seed.ts` Laravel branch and the `laravel-stack.mjs` header (AC 9).
6. Docs: Conversion record; inventory O-02 columns; `AGENTS.md` §8 gotcha if the parity-marker setup in tests bites; the scenario count note for the owner (*Open questions* 1).

## Test plan
| Layer | File / title | IDs |
|---|---|---|
| L1 Pest | `tests/Unit/Parity/ScenarioIdTest.php`: golden values from Node's `scenarioId` | O-02 |
| L2 Pest | `tests/Feature/Parity/ParitySeedTest.php`: dataset over the directory (18 today) (AC 3, 4); twice in a row (AC 3); admin promoted, runtime insert refused (AC 8); bad name / malformed JSON / missing mount (AC 1, 10) | O-02 |
| L2 Pest | `tests/Feature/Parity/ParityGuardTest.php`: one refusal per guard rule, nothing written (AC 2) | O-02 |
Evidence by hand: `bin/artisan parity:seed admin-only` on the builder's stack (with the marker created in that DB only for the check), then the facts SQL output pasted into the record.

**Not runnable here:** the Next seed and the Next half of AC 4 (no `node_modules`, brief §5); `seed.ts` (TypeScript, not compiled). Say so in the record.

## Definition of done (Laravel-only, `epics.md:35`)
Pest gate green plus the full Laravel suite (`bin/test`: Pint, Larastan, Pest). O-02 Laravel/Tests columns filled; the row stays open for the owner's Next comparison. Story record, handoff, pushed (branch); the record names the base `workbench/2-2-models`.

## Dependencies and follow-ups
- **Depends on:** 2.2 (stack base; the seeder uses raw inserts, models only appear in tests that read back); 2.1 (schema, admin trigger, truncation harness); 0.4 (reference).
- **Shared file:** `apps/portal/compose.yaml` is also edited by 2.3 (AC 8, `rules` mount). Two additive lines on the same `volumes:` list; merge carefully.
- **Follow-ups:** 3.1 adds object uploads to the seeder. Epics 4+ add the Laravel parity journeys that use `seed()` against Laravel.

## Owner items
1. **Next comparison (not run by the builder).** Needs the Next parity stack (brief §5, `tests/parity/README.md`). The builder writes the exact command into the record once the Laravel half exists, in this shape:
   ```
   cd tests/parity && npm run infra:up
   PARITY_MODE=1 PARITY_DATABASE_URL='<Next parity migrate URL, lf_parity>' node ../../apps/web/scripts/parity-seed.mjs <scenario>
   psql '<same URL>' -v ON_ERROR_STOP=1 -f scripts/seed-facts-next.sql > /tmp/facts-next-<scenario>.txt
   <Laravel side: parity:seed <scenario> in the lf-parity-laravel stack, then seed-facts-laravel.sql> > /tmp/facts-laravel-<scenario>.txt
   diff /tmp/facts-next-<scenario>.txt /tmp/facts-laravel-<scenario>.txt
   ```
   The Next URL, port and role come from `tests/parity/infra/docker-compose.test.yml` and `10-parity.sh`; the builder fills them in (a small script that loops all 18 scenarios is better than the snippet).
2. **Scenario count** in `epics.md:115` (*Open questions* 1).
3. **Where the Laravel parity marker is created** (*Open questions* 2).

## Open questions (with recommendations)
1. **Scenario count. Decided (owner): seed all 18.** `epics.md:115` (0.4) says "the 13 scenarios". 0.4 shipped 13 (`76dc9ec`); 0.7d added `concept-statuses.json` (`0abacee`) and 0.8d added `admin-queue`, `draft-concept`, `finals-ready-no-approval`, `stale-hold` (`843079f`). The fixtures are the spec, so 2.6 seeds all 18 (AC 3). **For the owner:** the epic text (`epics.md:115`) and the 0.4 story still say 13; correcting them is the owner's call, not done here.
2. **Where the Laravel parity marker comes from.** The Laravel parity stack runs `apps/portal/compose.yaml` with the same Postgres init as the dev stack (`./docker/postgres` → `/docker-entrypoint-initdb.d`, `compose.yaml:22-23`), so an init script there would put the marker in the dev database too. *Recommendation:* the parity overlay `tests/parity/infra/laravel.compose.yaml` mounts one extra init file (e.g. `90-parity-marker.sql`, modelled on `10-parity.sh:27-36`) into the `postgres` service, so only `lf-parity-laravel` volumes get it; no migration creates it. Existing parity volumes need `down -v` once (`laravel-stack.mjs:97` already does that on teardown). The dev agent applies this unless the owner says otherwise.
3. **Mount conflict with 2.3.** *Recommendation:* two additive lines, each its own path (AC 10).
4. **Storage objects before 3.1.** Rows reference object keys with nothing behind them. *Recommendation:* rows only; the facts don't check objects; note it in the record and as a 3.1 follow-up.
5. **UUIDs.** 2.2 models use `HasUuids` (v7, not deterministic). *Recommendation:* every seeded id is assigned explicitly from `ScenarioId` (raw inserts never trigger `HasUuids`).
6. **Truncation list.** *Recommendation:* the 2.1 tables that correspond to Next's `APP_TABLES` (`parity-seed.mjs:51-53`), plus `sessions`, `jobs`, `failed_jobs`; keep `migrations`, the framework `cache*` tables and the `parity` schema. Record the final list in the record.
No owner decision blocks the start of 2.6.

## Doc / code disagreements and citation fixes
- **Stack base:** the draft said only "Stacks on `workbench/2-2-models`"; header now names it as the 2.2 builder's branch, already containing 2.1 (`workbench/schema`), as the critic asked for 2.2–2.5.
- **AGENTS.md citations** name the section and row (§5 *Config*/*Docs*, §7 *Artisan commands*/*Schema / seeders*, §8 gotchas), not line numbers, because 2.1–2.4 each edit the guide and shift lines. The draft's "AGENTS §7 has no slot for parity code" is half right: §7 has *Artisan commands* and *Schema / seeders* rows, which cover it if the classes live under `database/seeders/Parity/`.
- `epics.md` §2.6 is `:261-263` (the draft cited only `:115`, which is 0.4).
- Guard: the draft listed hosts `127.0.0.1, localhost, postgres`; Next also allows `::1`/`[::1]` (`parity-seed-guard.mjs:3`). Marker check is `:19-22`, not `:20-21`.
- `parity-seed.mjs`: profiles are `:80-81` (draft `:81`); the credential account `:82-85`; uploads are queued in the project loop and sent after `COMMIT` at `:162` (draft `:126-149`); `APP_TABLES` is `:51-53` (draft hadn't read it; now resolved: 24 tables). `COMMIT` `:155` makes the whole seed one transaction, which the draft didn't say.
- `scenarios/README.md`: passwords are `:7` (draft `:6`).
- AC 9: the draft's `docker compose … exec -T app php artisan parity:seed` lacked `-e PARITY_MODE=1` (without it the guard refuses every run) and used only `apps/portal/compose.yaml`; it now uses the same project and files as `laravel-stack.mjs:52,57`.
- Draft OQ 7 (entitlements table name unknown): resolved, `project_entitlements` (`2-1-…md:104`).
- Draft cited "2.2 AC 1(c)" for the `is_admin` rule; 2.2 has no AC 1(c). The rule is in 2.2's tasks and test plan (`2-2-…md:60`, `:70`).
- Inventory O-02 (`01-feature-inventory.md:157`) describes the Next local-dev seed; the parity seed is a bracketed note. Not a conflict, but the row won't close on 2.6 alone.

---

## Conversion record
Builder "2-6-seed" (Workbench), branch `workbench/2-6-seed`, base `workbench/2-2-models` (`39f9bbb`, which contains 2.1 `workbench/schema`). Laravel half only; the Next comparison is owner item 1 below.

### Laravel implementation
- `app/Console/Commands/ParitySeed.php`: `parity:seed {scenario}`. A `ParitySeedError` → its message on stderr, exit 1; success prints the user/project counts and "0 objects".
- `database/seeders/Parity/` (namespace `Database\Seeders\Parity`):
  - `ScenarioId`: Next's `scenarioId`, byte for byte.
  - `Fields`: a strict JSON reader (unknown keys are errors, so a new fixture field fails loudly instead of being dropped).
  - `Scenario`, `ScenarioUser`, `ScenarioProject`: the loader. The whole file is validated before any write: member, author and sender keys exist; comments name a seeded concept; user keys are unique.
  - `ParityGuard`: `assertTarget()` (mode, env, host; config only, no connection) then `assertMarker()`.
  - `ParitySeeder`: the order is name check → guard (mode, env, host) → load → marker → one `transaction()` on `pgsql_migrate`: `TRUNCATE <TABLES> CASCADE` and raw inserts. The order, kind/key strings, timestamps (`now − createdDaysAgo` days, then one minute per event), `state_changed` payloads and actors, ON_HOLD reason, concept/final asset paths and sizes, the message thread and the final `projects.updated_at` stamp all follow `parity-seed.mjs:60-153` (re-read for this record).
- `config/parity.php`: `mode` (`PARITY_MODE === '1'`), `scenarios_dir`, `seed_facts_dir`. Those are the only `env()` reads.
- Shared facts SQL: `tests/parity/fixtures/seed-facts/seed-facts.sql` (the body: `fact|value` lines in a fixed order, read from `f_*` temp views), `seed-facts-laravel.sql` (views over the 2.1 tables) and `seed-facts-next.sql` (views over Prisma's tables, owner item). Run as `psql -X -At -v ON_ERROR_STOP=1 -f seed-facts-<app>.sql -f seed-facts.sql`. No absolute timestamps and no hashes: counts, statuses, ids, `prev>next@actor` chains, entitlement triples.
- `apps/portal/compose.yaml` (x-php volumes): `tests/parity/fixtures/scenarios` and `tests/parity/fixtures/seed-facts` mounted read-only under `/var/www/parity-fixtures/`.
- `tests/parity/infra/laravel.compose.yaml`: a one-shot `parity-marker` service (the pinned postgres image as a client) creates `parity.parity_marker` in the `portal` database of the parity stack. `app` waits for it to finish (`service_completed_successfully`). It is idempotent, and the dev stack never loads this overlay.
- `tests/parity/adapters/seed.ts` Laravel branch: `docker compose -f apps/portal/compose.yaml -f infra/laravel.compose.yaml exec -T -e PARITY_MODE=1 app php artisan parity:seed <name>`, project `PARITY_LARAVEL_PROJECT || lf-parity-laravel` (AC 9). `laravel-stack.mjs` header updated.
- Truncation list (Open question 6, final): `auth_rate_limits, auth_admin_bootstrap, auth_proofs, sessions, project_read_states, audit_events, concept_comments, revision_requests, messages, message_threads, file_assets, concepts, project_entitlements, project_orders, project_brief_drafts, project_briefs, projects, client_memberships, clients, profiles, users, stripe_events, jobs, failed_jobs`. Kept: `migrations, cache, cache_locks, job_batches` and the `parity` schema. A test fails if a new public table is in neither list.

### Deviations from Next.js
| Behaviour | Next.js | Laravel | Why | Decision ref |
|---|---|---|---|---|
| Passwords | Better Auth hash in `AuthAccount` | bcrypt in `users.password`; the fact is "has a password" | Laravel can't read Better Auth hashes | 2.1 checklist row 1 |
| Email verified | `emailVerified` boolean | `email_verified_at` = seed time | 2.1 decision | 2.1 *Decisions* |
| Guard: database name | must be `lf_parity` | no name check; marker in `portal` only | Laravel parity DB is `portal`, like dev | Open question 2; DECISIONS 2026-11-22 |
| Guard: URL parsing | `PARITY_DATABASE_URL` protocol + host | host of the `pgsql_migrate` config (`url` wins over `host`) | the seed writes through that connection | AC 2 |
| Runner | Node on the host | `docker compose … exec -T -e PARITY_MODE=1 app php artisan` | brief §7 | AC 9 |
| Object storage | uploads after COMMIT when `R2_ENDPOINT` is set | rows only, "0 objects" | Epic 3 not built | Open question 4; 3.1 follow-up |
| Truncation | 24 Prisma tables | 2.1 equivalents (no `AuthVerification`/`AuthAccount` tables) + `sessions`, `jobs`, `failed_jobs` | queue rows mustn't outlive a scenario | Open question 6 |
| Version stamp | `Project.updatedAt` = last event | same, plus `projects.version` left at its default | ADR-011 `version` column is Laravel-only | ADR-011 |
None is visible to the parity journeys, which assert facts and behaviour, not hashes.

### Tests
| Layer | Test file / title | Inventory IDs |
|---|---|---|
| L1 Pest | `tests/Unit/Parity/ScenarioIdTest.php`: 8 golden values from Node's `scenarioId` + v4/variant shape | O-02 |
| L2 Pest | `tests/Feature/Parity/ParitySeedTest.php`: dataset over the mounted directory (18) with facts = expectation from the JSON (`Tests\Support\ParityFacts`); count is 18; twice in a row + replace; admin via owner, runtime `is_admin` insert refused; `password: null`/verified mapping; bad name, path, unknown name, malformed JSON, unknown key, ghost member write nothing; missing mount names the mount; truncation list covers every public table | O-02 |
| L2 Pest | `tests/Feature/Parity/ParityGuardTest.php`: one refusal per rule (mode, production, host, URL host, marker), nothing written; all 5 Next local hosts accepted; rule order; mode refused before the file is read | O-02 |

Test-port ledger rows resolved: none. `parity-seed-guard.test.ts` is 0.4's (Next) and has no ledger row; `ParityGuardTest` is its Laravel equivalent. Rows 93–94 (`local-dev-seed*`) are the Next local-dev seed, not this story, and stay `Not started`.

### Test evidence
- `vendor/bin/pest tests/Unit/Parity tests/Feature/Parity` on `lf-wb7`: **51 passed (185 assertions)**. Pint and Larastan (level 9) clean.
- `bin/test` (drift check, Pint, Larastan, full Pest) on `lf-wb7`: **516 passed (1784 assertions)**.
- By hand on `lf-wb7`'s dev database `portal`: `parity:seed admin-queue` without `PARITY_MODE` → "parity seed refused: PARITY_MODE=1 is required", exit 1. Then the marker was created by hand, `exec -e PARITY_MODE=1 … parity:seed admin-queue` → "loaded "admin-queue" (2 users, 6 projects, 0 objects)", and `seed-facts-laravel.sql` + `seed-facts.sql` printed 82 lines. First 10:
  ```
  users|2
  users.verified|2
  users.password|2
  profiles|2
  profiles.admin|1
  admin_bootstrap|222c2620-6a00-4b7b-be21-6a68ef66e9ce
  projects.status:AWAITING_APPROVAL|2
  projects.status:BRIEF_SUBMITTED|2
  projects.status:DELIVERED|1
  projects.status:REVISIONS_IN_PROGRESS|1
  ```
  The marker and seeded rows were dropped afterwards.
- The overlay's `parity-marker` service, run twice against `lf-wb7` (`COMPOSE_PROJECT_NAME=lf-wb7 PARITY_LARAVEL_BASE_URL=http://127.0.0.1:8000 docker compose -f compose.yaml -f ../../tests/parity/infra/laravel.compose.yaml run --rm --no-deps parity-marker`; without `COMPOSE_PROJECT_NAME` the project is `lf-portal` and the marker would land in the owner's dev `portal`, so always set it): the second run inserted 0 rows (idempotent). The runtime role reads the marker in `portal`, `to_regclass('parity.parity_marker')` in the `postgres` database is NULL, and `parity:seed on-hold` then succeeded. `docker compose … config` validates the merged files.

**Not run, and why:**
- The Next seed and the Next half of AC 4 (`seed-facts-next.sql` has never run, so its Prisma column names are unchecked): brief §5, no Next stack. This is owner item 1.
- `seed.ts` (TypeScript, not compiled, no `node_modules`) and a full `laravel-stack.mjs` run with the overlay: the command line was checked only by reading it and by the `config`/`run` above.
- CI.

### Gotchas
- `docker compose exec` doesn't pass the host environment: `-e PARITY_MODE=1` is needed, or the guard refuses (now in AGENTS.md §8).
- Init scripts in the portal postgres image run against the `postgres` database (`POSTGRES_DB` is unset) and the init directory is a read-only bind mount. So the marker can't come from an init file (critic blocker 2).
- The truncation harness only resets `public`. The Pest tests create and drop the `parity` schema around each test in `portal_test` (`ParityFacts::createMarker/dropMarker`).

### Docs updated
This record; `sprint-status.yaml` (→ review); inventory O-02; `docs/governance/{DECISIONS,ASSUMPTIONS,RISKS}.md` (one line each); `apps/portal/AGENTS.md` §8 (one gotcha); `tests/parity/README.md` (seeding line); `laravel-stack.mjs` header; `handoff.md` (Now + session log, last branch of Epic 2).

### Doc / code disagreements found while building
1. **Facts SQL location.** AC 6 says `tests/parity/scripts/seed-facts.sql`. It is `tests/parity/fixtures/seed-facts/`, so it can be mounted read-only into the portal container like the scenarios, and the Pest gate can run it with `psql -f` (critic blocker 1). A psql script can't go through PDO.
2. **Marker location.** Open question 2 recommends an init file (`90-parity-marker.sql`) mounted into the overlay's `postgres` service. That would land in the `postgres` database, not `portal` (gotcha 2). Instead it is a one-shot `parity-marker` service in the same overlay, so it is still parity stack only and needs no `down -v` for existing volumes (critic blocker 2).
3. **Inventory columns.** The story says "fill the Laravel/Tests columns" of O-02, but the O table has only ID / Feature / Next.js source / Status. The Laravel and test paths went into the Status cell, which stays `In progress`.
4. **Mount.** AC 10 names only the scenarios mount; a second read-only line (`seed-facts`) sits next to it for disagreement 1. 2.3 adds a `rules` line in the same list (hand-merge).

### Open items
- **Owner: the Next comparison** (owner item 1). It needs the Next parity stack (`npm ci` in `apps/web`, because `parity-seed.mjs` imports `pg`, `better-auth` and `@aws-sdk/client-s3` from there; `infra:up` is plain `docker compose` and needs no install; disk). From the repo root, as one loop over all 18 scenarios. `seed-facts-next.sql` may need column-name fixes on its first run.
  ```sh
  bash   # run the rest in bash: zsh doesn't word-split $L
  export PATH="$HOME/.orbstack/bin:$PATH"; R=$PWD; F=tests/parity/fixtures/seed-facts
  (cd tests/parity && npm run infra:up)          # Next parity Postgres on 127.0.0.1:55432, DB lf_parity
  NEXT_URL=postgresql://lf_migrate:parity-test-only-migrate@127.0.0.1:55432/lf_parity
  NEXT_RT=postgresql://lf_runtime:parity-test-only-runtime@127.0.0.1:55432/lf_parity
  # infra:up creates only the roles and parity.parity_marker; the Prisma tables come from parity-migrate (as next-stack.mjs does, tests/parity/README.md:51-54):
  env -i PATH="$PATH" HOME="$HOME" PARITY_MODE=1 PARITY_DATABASE_URL=$NEXT_URL PARITY_RUNTIME_DATABASE_URL=$NEXT_RT node apps/web/scripts/parity-migrate.mjs
  # Laravel parity stack, the same project, ports and files as laravel-stack.mjs, left running:
  # (env on the command, not exported: COMPOSE_PROJECT_NAME would also rename the Next infra project lf-parity)
  L="env COMPOSE_PROJECT_NAME=lf-parity-laravel PORTAL_HTTP_PORT=8000 PORTAL_PG_PORT=55541 PORTAL_VITE_PORT=15181
     PORTAL_MAIL_PORT=18031 PORTAL_S3_PORT=18341 PARITY_LARAVEL_BASE_URL=http://127.0.0.1:8000
     docker compose -f apps/portal/compose.yaml -f tests/parity/infra/laravel.compose.yaml"
  $L up -d --build web
  mkdir -p /tmp/seed-compare
  for s in $(ls tests/parity/fixtures/scenarios/*.json | xargs -n1 basename | sed 's/\.json$//'); do
    PARITY_MODE=1 PARITY_DATABASE_URL=$NEXT_URL node apps/web/scripts/parity-seed.mjs "$s" >/dev/null
    cat $F/seed-facts-next.sql $F/seed-facts.sql | docker compose -f tests/parity/infra/docker-compose.test.yml exec -T postgres \
      psql -X -At -v ON_ERROR_STOP=1 -U lf_migrate -d lf_parity > /tmp/seed-compare/$s.next
    $L exec -T -e PARITY_MODE=1 app php artisan parity:seed "$s" >/dev/null
    $L exec -T -e PGPASSWORD=dev-only-migrate app psql -X -At -v ON_ERROR_STOP=1 -h postgres -U portal_migrate -d portal \
      -f /var/www/parity-fixtures/seed-facts/seed-facts-laravel.sql -f /var/www/parity-fixtures/seed-facts/seed-facts.sql > /tmp/seed-compare/$s.laravel
    diff -u /tmp/seed-compare/$s.next /tmp/seed-compare/$s.laravel && echo "same: $s"
  done
  $L down -v --remove-orphans; (cd tests/parity && npm run infra:down)
  ```
  (`parity-seed.mjs` uploads objects only when `R2_ENDPOINT` is set, so the loop leaves it unset; the facts don't check objects.) When all 18 print `same`, O-02's parity part can close. The local-dev seed part of the row is separate.
- **Owner:** the scenario count in `epics.md:115` and the 0.4 story still says 13 (Open question 1).
- **Merge:** `apps/portal/compose.yaml` x-php volumes with 2.3's `rules` line; the AGENTS.md §8 line with the other Epic 2 branches.
- **3.1:** object uploads in `ParitySeeder` (paths and sizes already match Next's).
