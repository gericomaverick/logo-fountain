# Story 0.7b: Contract suite: client project endpoints, plus the snapshot schema

Status: review

**Covers:** C-02…C-18, K-11, X-03 · **Gate:** `@client&@api`, `@concepts&@api`, `@brief&@api`, `@messages&@api` (also green: `@revisions`, `@approval`, `@finals`, `@settings`, `@invoices`, `@entitlements`, `@authz`, `@contract` each `&@api`) · **After:** 0.4 · **DoD:** E0

## Acceptance criteria
1. L4 contract tests (Playwright `request`) for every client project endpoint in `brownfield/api-client.md`: status, `error.code`, shapes, API-observable side effects.
2. `fixtures/contracts/snapshot.schema.json` (full key set and types) asserted for every scenario with a project. Additive `concepts[].imageKey` allowed (DV-12).
3. 401 anonymous / 404 non-member guards on each endpoint. Only current Next behaviour; no DV tests.

## Delivered
- `tests/parity/journeys/contract/client-{projects,brief,concepts,revisions,approval-finals,messages,settings,authz}.spec.ts`: 82 tests (79 run, 3 `test.fixme`).
- `tests/parity/journeys/contract/_client-helpers.ts`: `useScenario()` (per-test reseed under a cross-process lock), `as()`/`anonymous()`, `expectError()` (X-03 envelope), deterministic IDs, a small JSON Schema validator (type, enum, const, required, properties, additionalProperties, items, `$ref`, minimum, format date-time/uuid). **No new dependency** (no ajv).
- `tests/parity/fixtures/contracts/snapshot.schema.json`: strict (`additionalProperties:false` everywhere); the loop test in `client-projects.spec.ts` also checks each snapshot against the scenario facts (status, entitlements, concept order, messages, brief, draft, finalZip, order, current timeline step).

## Behaviour notes (Next, as pinned; file:line under `apps/web/src/`)
- **Admin POST comment and POST message → 500.** `app/api/projects/[id]/concepts/[conceptId]/comments/route.ts:76` and `.../messages/route.ts:70` upsert `Profile` with `isAdmin:true`; Postgres runs the BEFORE INSERT trigger `protect_operator_admin_flag` (`prisma/migrations/20260901000000_portable_core/migration.sql:527,537`) before ON CONFLICT, so the runtime role gets "operator-owned admin flag". The admin messages page posts to this route (`app/admin/projects/[id]/messages/page.tsx:107`). Pinned as `test.fixme` with the documented contract (201, `isAdmin:true`).
- Absent, not null: `readState.lastSeenMessagesAt/ConceptsAt`, `latestMessageAt`, `latestConceptAt`, `timeline[].timestamp` (`lib/project-snapshot.ts:28` `asIso` → undefined). A never-read project has `readState: {}`.
- Timeline: with an approved concept and AWAITING_APPROVAL, the **current** step is the derived `APPROVED` (not `completed`); ON_HOLD is a current step too.
- `entitlementUsage.*` with rows carries `unlimited` and `configured:true`; unlimited has `limit:0`.
- Body validation runs **before** membership in POST brief (`brief/route.ts:60`), revision-requests (`revision-requests/route.ts:33`) and approve (`approve/route.ts:41`): a non-member with a bad body gets 400, not 404. Guard tests send valid bodies.
- `POST finals` answers 404 `FINAL_ZIP_NOT_AVAILABLE` (not PROJECT_NOT_FOUND) to non-members, admins and unknown projects (`finals/route.ts:34`, membership in the query).
- Revision request with a concept outside the project: **400** `CONCEPT_NOT_FOUND` (`revision-requests/route.ts:62`); comments/approve use 404.
- `GET .../assets` has no concept check: unknown/foreign concept → 200 `{assets:[]}` (F-7). Not asserted (DV-7, 0.7d).
- Admin `GET concepts` for an unknown project → 200 `{concepts:[], projectStatus:null}` (asserted).
- `GET /api/projects` is membership-only: an admin gets `{projects:[]}`.
- Profile names over 80 are **truncated**, not rejected (`profile/route.ts:19`); a valid JSON non-object body (e.g. `null`) would throw → 500 (not tested).
- Read-state stamps are DB times: `lastSeenMessagesAt` = latest non-system message, `lastSeenConceptsAt` = `latestConceptAt`.
- Invoices without Stripe: the resolver catches the error → `documentType:"none"`, all URLs null (`lib/client-invoices.ts:162`). Tests accept any documented `documentType` and check `downloadUrl = pdf ?? hosted ?? receipt`.

## Not covered
- Emails (N-06/07/08/11/12), audit rows, `BRIEF_CONFLICT`/`FINAL_DOWNLOAD_CONFLICT` races: not API-observable here (Mailpit journeys 0.8b/c; L3).
- Stripe document resolution: `test.fixme` → story 0.5 (stripe-fake).
- Unpublished/deleted concepts, cross-tenant assets: 0.7d (DV-7). Origin guard: 0.7d. Non-UUID path IDs (Prisma throws → 500): not pinned.
- `POST /checkout/session`: K-scope (0.7a/0.5).

## Test evidence (2026-11-19, Next 16.4.1 `next dev`, PG 18.7, worktree stack)
| Gate | Result |
|---|---|
| `@client&@api` | 77 passed, 3 skipped (fixme) |
| `@concepts&@api` | 15 passed, 1 skipped |
| `@brief&@api` | 14 passed |
| `@messages&@api` | 8 passed, 1 skipped |
| `@revisions` / `@approval` / `@finals` / `@settings` / `@invoices` / `@entitlements` / `@authz` / `@contract` `&@api` | 8 / 5 / 7 / 4 / 4+1 skipped / 4 / 26 / 1 passed |
- `npm run check`: OK (9 spec files, 82 tests).
- Schema negative check (one-off): an extra key, a missing key, `null` for an absent-able key, a bad enum, an extra concept key and a non-null `finalZip.url` each fail; `imageKey` passes.

## Gotchas
- **Seeding truncates the whole DB**, so parallel workers clobber each other. `useScenario` holds a mkdir lock in `os.tmpdir()` (keyed by base URL, 180 s stale) from seed to test end. Shared candidate: move it into `adapters/seed.ts` (or `workers: 1` for contract projects) so 0.7a/0.7c tests coordinate too.
- Without stripe-fake, Next's Stripe calls go to api.stripe.com; in a sandbox a black-holed connection hangs (80 s timeout × 2 retries). The local stack set `STRIPE_API_BASE` to a tiny fail-fast 404 stub (not committed). Story 0.2/0.5's stripe-fake replaces it.
- Turbopack rejects a symlinked `apps/web/node_modules` that leaves the worktree; use `npm ci` in the worktree and copy `src/generated`.
- Playwright JSON-encodes a string `data`; send malformed JSON as `Buffer.from(...)`.

## Docs updated
This file. Parent: inventory (Tag/Tests for C-02…C-18, K-11, X-03), sprint-status, handoff, RISKS (admin messaging 500).

## Open items
- Owner/parent: decide the admin comment/message 500 (fix Next under the freeze, or record the documented contract as a DV) and un-fixme the two tests.
- 0.5: un-fixme the K-11 Stripe receipt test.
- 0.7d: confirm DV-7 wording vs revision-requests' **400** `CONCEPT_NOT_FOUND` for a missing concept.
