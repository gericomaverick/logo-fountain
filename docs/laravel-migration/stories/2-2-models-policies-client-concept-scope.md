# Story 2.2: Models, policies, client concept scope

**Status:** ready-for-dev (2026-11-21) · **DoD variant:** Laravel-only · **Epic:** 2 · **Covers:** C-20, D-20, DV-7, ADR-020 · **Gate:** Pest (arch plus unit) · **After:** 2.1 (stack on `workbench/schema`, the 2.1 builder's branch; unmerged)

> Created with BMAD `create-story`, from the researcher draft in `reports/story-drafts-60.md` (Workbench), with its `file:line` citations spot-checked against `apps/web` and the docs and corrected (see *Doc / code disagreements*). The BMAD workflow files are not reachable on this machine, so the structure follows `stories/2-1-schema-migrations-and-roles.md` and `templates/story-conversion-record.md`. Docs only: no portal code was written for this file.

## Story
As the portal, I need Eloquent models and authorisation/query boundaries for projects and concepts, so that client-facing lookups can never expose a concept or asset outside the client-visible scope, and admin and membership checks behave as they do today.

## Acceptance criteria
From `epics.md:243-245` (§2.2), expanded into testable items.

1. **Models represent the 2.1 schema.** An Eloquent model per 2.1 domain table, with Laravel naming and relationships, `HasUuids` (v7) where the key is uuid, and the timestamp configuration listed in `2-1-schema-migrations-and-roles.md:185` (`UPDATED_AT = null` for `client_memberships`, `project_briefs`, `messages`, `concept_comments`, `audit_events`; `CREATED_AT = null` for `project_brief_drafts`; no Eloquent timestamps for `auth_proofs`, `auth_rate_limits`, `stripe_events`). `Profile` is keyed by the user id (`$incrementing = false`, no generated id). `is_admin` is never fillable (DV-14). Models for tables without `updated_at` never try to write it. Also from the 2.1 handover (`2-1-…md:185`): (a) `$dateFormat = 'Y-m-d H:i:s.v'` (milliseconds) on every model, because 2.1 decision 1 keeps `timestamp(3)` and read-state "new" dots and ordering depend on it (`2-1-…md:53,197`): a saved and re-read timestamp keeps its milliseconds; (b) email mutators on `users.email` and `profiles.email` normalise as Next's `normalizeAuthEmail` (`apps/web/src/lib/auth/service.ts:14`, `trim().toLowerCase()`), using `NodeCompat::trimEnv()` (the UTF-8 JS `trim()` set) and `NodeCompat::lower()`; (c) `is_admin` is never written on the runtime connection: not fillable, no setter, no model code path sets it (the 2.1 `protect_operator_admin_flag` trigger rejects it anyway). → `tests/Unit/Models/*`, `tests/Feature/Models/RelationshipsTest.php`.
2. **Policies enforce membership and admin access.** "Admin" means `profiles.is_admin` **and** a verified email (`users.email_verified_at IS NOT NULL`), as `isAdminUser` (`apps/web/src/lib/auth/admin.ts:4`: unverified → not admin); an unverified admin is treated as an ordinary user. `ProjectPolicy` has three abilities, matching the three patterns Next uses (no `Gate::before` admin bypass, because some client routes deny admins):
   - `participate` (membership only, as `requireProjectMembership`, `require.ts:49-61`): admins get no exemption. Next uses this on the client mutations and private client data: `projects/[id]/revision-requests`, `approve`, `invoices`, `checkout/session`, `entitlements`, `brief/draft`, and `brief` POST (`brief/route.ts:71`).
   - `view` (admin **or** member; the `authorizeProjectAccess` pattern: `requireAdmin`, else `requireProjectMembership`): `projects/[id]` GET, `concepts` GET, `concepts/[conceptId]/assets`, `concepts/[conceptId]/comments`, `brief` GET, `read-state`, `messages` (e.g. `projects/[id]/concepts/route.ts:10-21`, `messages/route.ts:21-34`).
   - `administer` (admin only, as `requireAdmin`, `require.ts:41-47`, `403 FORBIDDEN`).
   A membership miss surfaces as `404 PROJECT_NOT_FOUND` (never 403). → `tests/Feature/Policies/ProjectPolicyTest.php`.
3. **Client-visible concepts are explicitly scoped.** `Concept::visibleToClient()` returns only `published` and `approved`; it excludes `draft`, `archived` and `deleted`. Client paths resolve concepts and concept assets only through it (ADR-020), **for admins too**: Next's client concept routes filter to published/approved even when the caller is an admin (`projects/[id]/concepts/route.ts:37`). → `tests/Unit/Models/ConceptVisibilityScopeTest.php` (one dataset row per status).
4. **No bypass by identifier.** A client supplying the id of a draft, archived or deleted concept (or of its asset) gets exactly what a non-existent id gets (DV-7, `01-feature-inventory.md:178`); the policy/query layer gives no signal that distinguishes them. → `tests/Feature/Policies/ConceptPolicyTest.php`.
5. **Architecture test (controllers only).** Classes in the client controller namespaces (`App\Http\Controllers\Api` and `App\Http\Controllers\Pages`, ignoring their `Admin` sub-namespaces) do not use `App\Models\Concept` or `App\Models\FileAsset` at all; they reach concepts and assets only through `Project`'s scoped relationships (Task 2). Actions are shared between client and admin paths, so they are **not** covered by the arch rule; on client paths they are covered by `ConceptPolicyTest` here and by the DV-7 `@deviation` tests when the client routes land. No client controllers exist yet, so the test also applies the same rule to a negative fixture (`tests/Fixtures/Arch/LeakyClientController.php`, which calls `Concept::find()`) and asserts that the rule **fails** on it, so the rule can't pass vacuously. → `tests/Arch/ClientConceptScopeTest.php`.
6. **Admin queries are unaffected.** The scope is local (not a global scope); admin paths can read concepts in every status. → covered in `ConceptVisibilityScopeTest`.

## Inventory scope
- **C-20** (`01-feature-inventory.md:80`): tenant isolation. This story provides the policy layer; the row completes when the client endpoints and `contract/authz-matrix.spec.ts` pass on Laravel (Epic 6/7). Leave the row open; record the Laravel layer.
- **D-20** (`01-feature-inventory.md:105`): admin-only enforcement. Policy/ability here; the `admin` middleware and contract tests complete it later. Leave open.
- **DV-7** (`01-feature-inventory.md:178`): concept visibility by construction. Scope + arch test here; the `@deviation` tests (`contract/concept-status-matrix.spec.ts`) pass when the client concept routes land (C-09…C-11).
- **ADR-020**: implemented (scope, policy, arch test). Record consequences in the ADR's *Consequences* section only if something new is found (that section is for consequences; the decision text is not edited).

## Next.js source read
- `apps/web/src/lib/auth/require.ts:41-61` (`requireAdmin` 403 `FORBIDDEN`; `requireProjectMembership` 404 `PROJECT_NOT_FOUND`, membership via `client.memberships.some(userId)`)
- `apps/web/src/lib/auth/admin.ts:3-6` (`isAdminUser`: `emailVerified` required, then `profile.isAdmin`)
- Client route auth patterns: `api/projects/[id]/concepts/route.ts:10-21` and `messages/route.ts:21-34` (`authorizeProjectAccess`: admin, else member); `brief/route.ts:71` (membership only); `apps/web/src/lib/auth/service.ts:14` (`normalizeAuthEmail`)
- `apps/web/src/lib/project-snapshot.ts:11` (`PUBLISHED_OR_APPROVED`) and the ad-hoc `status: { in: ["published","approved"] }` filters, e.g. `api/projects/[id]/read-state/route.ts:56`, `api/admin/projects/[id]/concepts/[conceptId]/publish/route.ts:53`
- Docs: `brownfield/data-model-and-ops.md:19-20` (concept statuses; `file_assets`), `brownfield/api-admin.md:49-53` (publish/delete guards that use "visible" = published/approved), `epics.md:145-149` (0.7d matrix × concept status), `adr/ADR-020-client-concept-visibility.md:8`, `apps/portal/AGENTS.md` §5 *Authorisation* row (line 59 on main `b115b95`), `2-1-schema-migrations-and-roles.md:185` (model notes for 2.2), `:53,197` (decision 1, `timestamp(3)`)

## Behaviour notes (written before converting)
- Concept statuses: `draft`/`published`/`approved`/`archived`/`deleted` (`data-model-and-ops.md:19`). "Visible" everywhere in Next is `published` + `approved` (`project-snapshot.ts:11`).
- Next has no single scope: each client route filters by hand, which is how DV-7 (client reaches draft/deleted concepts by UUID) arose. Laravel makes it one scope plus an arch test (ADR-020; `AGENTS.md:59`).
- DV-7 response contract (owned by the client route stories, recorded here so the scope can support it): non-visible concept → the route's own not-found response, byte-identical (404 `CONCEPT_NOT_FOUND` for assets/comments/approve, 400 `CONCEPT_NOT_FOUND` for revision requests; unknown-concept assets become 404, no longer `200 []`) (`01-feature-inventory.md:178`).
- Membership miss → `404 PROJECT_NOT_FOUND` with `nextStep` "Check the project link."; non-admin on admin → `403 FORBIDDEN`, "Use an admin account." (`require.ts:41-61`). In the `view` pattern an admin passes without a membership or existence check (the route's own lookup then 404s for an unknown id); the policy keeps that: `view` for an admin does not query membership. The error *rendering* exists from 1.6; the policy must make the mapping possible (e.g. `Response::denyAsNotFound()` or a domain exception), not render it.
- Admin lifecycle routes read non-visible concepts (publish a draft, delete guards, "last visible concept" counts, `api-admin.md:49-53`), so the scope must not be global.

## Laravel guidance (for the dev agent)
- Follow the 2.1 model notes (`2-1-…md:185`) and Laravel conventions over Prisma shapes (owner rule, `docs/governance/DECISIONS.md`).
- Scope as a local scope (`scopeVisibleToClient` or `#[Scope]`), plus a scoped relation for assets (e.g. `Project::clientVisibleConcepts()`), so client code never calls `FileAsset::find($id)`.
- Policies: `ProjectPolicy`, `ConceptPolicy` (`AGENTS.md` §5 *Authorisation*). No controllers or routes in this story; test policies directly via `Gate::forUser()`. Don't register a `Gate::before` admin bypass (see AC 2).
- `is_admin` lives on `profiles`, verification on `users`: resolve "admin" in one place (e.g. `User::isAdmin()`), used by `view` and `administer` and later by the `admin` middleware.
- jsonb casts: name the cast per column. `audit_events.payload` is returned verbatim by the admin audit endpoint (`api/admin/projects/[id]/audit/route.ts:16-19`), so it must round-trip `{}` and `[]` exactly: use the `'object'` cast (decodes to `stdClass`), not `'array'` (an empty PHP array encodes as `[]`, Next stores `{}`). `project_briefs.answers` and `project_brief_drafts.answers` are objects in Next too: same cast unless the dev agent shows no endpoint returns them verbatim. Record the choice in the Conversion record.
- Arch test with Pest `expect(...)->not->toUse(...)`. There is no `Client` controller namespace: client controllers are `app/Http/Controllers/Api` and `Pages`, admin ones `Api/Admin` and `Pages/Admin` (`AGENTS.md` §7 *Controllers* row, line 84 on main). Scope the rule to the non-admin namespaces with `->ignoring(...Admin)` (`Webhooks` doesn't touch concepts). Wrap the rule in a helper so the negative-fixture case runs exactly the same expectation.

## Planned deviations from Next.js (confirm in the Conversion record)
| Behaviour | Next.js | Laravel | Why | Ref |
|---|---|---|---|---|
| Client concept lookup | per-route `status in [...]` filters | one `visibleToClient()` scope + arch test | DV-7 by construction | ADR-020, DV-7 |
| Membership check | `requireProjectMembership` / `authorizeProjectAccess` / `requireAdmin` helpers | `ProjectPolicy` `participate` / `view` / `administer` | Laravel convention | `AGENTS.md` §5 |
The DV-7 change is visible to the parity suite (it's a DV row with `@deviation` tests); the policy form is not.

## Tasks
1. **Models** (AC 1): one per 2.1 domain table, relationships, casts (jsonb per *Laravel guidance*), key/timestamp config and `$dateFormat` per `2-1-…md:185`, email mutators, `is_admin` guarded; factories needed by these tests only (2.6 owns seed scenarios).
2. **Scope** (AC 3, 6): `Concept::visibleToClient()`; scoped asset relation.
3. **Policies** (AC 2, 4): `ProjectPolicy` (`participate` / `view` / `administer`, admin = flag + verified email), `ConceptPolicy` (visible + `view`); not-found mapping.
4. **Arch test** (AC 5), with the negative fixture.
5. **Tests** per *Test plan*; run against the 2.1 harness (migrate as `pgsql_migrate`). Don't change 2.1 migrations; if a model needs a schema change, stop and raise it on 2.1.
6. **Docs**: Conversion record; inventory C-20/D-20/DV-7 Laravel/Tests columns (rows stay open, see *Inventory scope*); `AGENTS.md` if a new pattern is added (e.g. the scoped relation name); DECISIONS/ASSUMPTIONS one-liners.

## Test plan
| Layer | File | Cases | IDs |
|---|---|---|---|
| L1/L2 Pest | `tests/Unit/Models/*`, `tests/Feature/Models/RelationshipsTest.php` | keys (uuid v7, `Profile` = user id), timestamps per table, relationships both ways, `is_admin` not mass-assignable and never written by a model save; a timestamp with milliseconds saved and re-read keeps them (`.123`); `users.email` / `profiles.email` set to `" \u{00A0}A@B.Test\u{FEFF} "` read back as `a@b.test`; `audit_events.payload` `{}` and `[]` each read back and re-encode unchanged | X-15 (consumes) |
| L1 Pest | `tests/Unit/Models/ConceptVisibilityScopeTest.php` | dataset: 5 statuses → only published/approved returned; scope not global (admin query sees all) | DV-7, ADR-020 |
| L2 Pest | `tests/Feature/Policies/ProjectPolicyTest.php` | member: `participate` and `view` allowed; non-member / other tenant → not-found (404 `PROJECT_NOT_FOUND`) on both; verified admin who isn't a member: `view` allowed, `participate` → not-found; `administer`: verified admin yes, client no (403 `FORBIDDEN`); admin flag with unverified email → treated as a non-admin on all three | C-20, D-20 |
| L2 Pest | `tests/Feature/Policies/ConceptPolicyTest.php` | draft/archived/deleted concept id and its asset id → same outcome as a random uuid, for a member **and** for an admin on the client path; published/approved → allowed for member | DV-7, C-20 |
| Arch | `tests/Arch/ClientConceptScopeTest.php` | client controller namespaces (minus `Admin`) don't use `Concept` or `FileAsset`; the same rule fails on `tests/Fixtures/Arch/LeakyClientController.php` | ADR-020 |
No parity runs: the endpoints don't exist yet. Ledger rows: none resolved by this story (the authz matrix is a parity spec).

## Definition of done (Laravel-only, `epics.md:35`)
The gate is green on Laravel, plus the full Laravel suite (`bin/test`: Pint, Larastan 9, Pest incl. Arch and Concurrency). Inventory rows updated (they stay open, see above). Story record, handoff, pushed (branch).

## Dependencies and follow-ups
- **Depends on:** 2.1 (schema, harness). Stack on `workbench/schema` (the 2.1 builder's branch); rebase if 2.1 changes.
- **2.6** seed scenarios use these models and factories.
- **Epic 6/7 client routes** (C-09…C-11 and every route taking a concept id): must use the scope and policies; they own the DV-7 response bodies and the `@deviation` tests.
- **4.8 / admin middleware:** D-20 completes with the `admin` middleware and contract tests; it uses the same "admin = flag + verified email" check.
- **2.4** `Audit::record` writes `audit_events.payload` through the cast chosen here (keep `{}` as `{}`).

## Open questions (with recommendations)
1. **Model breadth.** The epic says "models" without a list. *Recommendation:* a model for every 2.1 domain table now (cheap, and 2.6 needs them), factories only where a test here needs one.
2. **Asset scope API.** Not specified. *Recommendation:* assets reachable on client paths only through a scoped concept relationship, never by raw `FileAsset` id; the arch test enforces it.
3. **Not-found mapping location.** *Recommendation:* the policy denies as not-found (`Response::denyAsNotFound()`), and the 1.6 renderer maps it to the route's code; confirm with the 1.6 error renderer when the first client route lands.
No owner decision needed for 2.2.

## Doc / code disagreements and citation fixes
- Draft cited `apps/portal/AGENTS.md:5` for the Authorisation rule; the row is at `AGENTS.md:59` (line 5 is the "Start here" heading). Fixed. AGENTS.md citations now name the section and row (2.1 edits §3 and §8, which shifts line numbers); line numbers are as on main `b115b95`.
- Review (critic, 2026-11-21) said Next's client routes use membership even for admins. Only partly: seven client routes let a verified admin in without membership (`authorizeProjectAccess`) and seven don't. AC 2 now has both abilities and no global bypass.
- Draft cited `epics.md:164-174` for story 0.7d; 0.7d is at `epics.md:145-149` (164-174 is 0.8d–0.9). Fixed.
- ADR-020 (`adr/ADR-020-client-concept-visibility.md:8`) says "published and approved … 404 is indistinguishable"; the inventory DV-7 row (`01-feature-inventory.md:178`) refines it per route (400 `CONCEPT_NOT_FOUND` for revision requests). Not a conflict: "indistinguishable from a non-existent concept on that route". Recorded above.

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
