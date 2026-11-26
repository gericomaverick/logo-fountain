# Story 6.7: Concepts gallery and viewer

**Status:** review, **API half only** (UI half pending the owner's key-screen approval) · **DoD variant:** Conversion · **Epic:** 6 · **Covers:** C-08, C-09, FR26, DV-7, DV-12 · **Gate:** `@concepts&@api`, `@concepts&@ui`, `@deviation` (DV-7) · **After:** 6.2b, 3.4, 2.2. Test mode only.

## Story
As a signed-in client (or admin), I can list a project's published concepts and every version of one concept, with stable image keys.

## Acceptance criteria
1. `GET /api/projects/{id}/concepts` → `{concepts, projectStatus}`, ordered by number; published and approved only; admin or member; anonymous 401; non-member 404 `PROJECT_NOT_FOUND`; an admin asking for an unknown project gets `{concepts:[], projectStatus:null}`. (API, done)
2. `GET …/concepts/{cid}/assets` → `{assets:[{path,version,createdAt,url,notes}]}`, every version, version desc. (API, done)
3. A draft, deleted or archived concept ID, or one from another project, answers byte-identically to an unknown ID: 404 `CONCEPT_NOT_FOUND` (DV-7). (API, done)
4. Concept and asset payloads carry `imageKey` (DV-12). (API, done)
5. Gallery `/project/{id}/concepts` and viewer `/project/{id}/concept/{cid}` pages. UI half done (see "UI half record").

## Inventory scope
C-08, C-09 (API half).

## Next.js source read
Parity contracts `client-concepts.spec.ts`, `concept-status-matrix.spec.ts`, `client-authz.spec.ts`; `brownfield/api-client.md:30-31`. Next routes read directly: `apps/web/src/app/api/projects/[id]/concepts/route.ts` and `.../[conceptId]/assets/route.ts` (with `route.test.ts` beside each). An earlier draft of this story wrongly said they were absent (it looked under `apps/web/app`); the contract specs and brownfield notes were the first source, the route files are the conversion evidence and the behaviour below was diffed against them.

## Behaviour notes
Unknown project: admin lists empty with `projectStatus:null`; a non-admin gets 404. `projectStatus` is the persisted status. `revisionVersion` = highest `v<n>` of the concept's files (min 1); `imageUrl` signs the first file by `createdAt` desc (as Next does), which may be a lower version if it was uploaded last; `/assets` sorts version desc then createdAt desc. Legacy `<project>/<concept>.<ext>` files count as v1.

## Laravel implementation
`app/Http/Controllers/Api/ConceptController.php`, `app/Queries/ClientConcepts.php` (reuses `Project::clientVisibleConcepts()` and `SignedImage`), routes `concepts.index`, `concepts.assets` in `routes/checkout.php`. Re-checked per request with `ConceptPolicy` before any signing.

## Deviations from Next.js
| Behaviour | Next.js | Laravel | Why | Decision ref |
|---|---|---|---|---|
| Hidden concept assets | 200 with files | 404 `CONCEPT_NOT_FOUND` | DV-7 | DV-7 |
| Unknown concept assets | `200 []` | 404 `CONCEPT_NOT_FOUND` | DV-7 | DV-7 |
| `imageKey` on concepts and assets | absent | present | DV-12 | DV-12 |

## Tests
| Layer | Test | IDs |
|---|---|---|
| L2 | `tests/Feature/Checkout/ConceptApiTest.php` (8 cases) | C-08, C-09, DV-7, DV-12 |
| Arch | `tests/Arch/ClientConceptScopeTest.php` (existing, still green) | DV-7 |
| L4 | `client-concepts.spec.ts`, `concept-status-matrix.spec.ts`, `client-authz.spec.ts`, `dv-images.spec.ts` | C-08, C-09, DV-7 |

## Test evidence
`bin/test`: exit 0, 2157 passed, 1 warning (pre-existing). Typecheck: exit 0. Parity `laravel-stack.mjs "@concepts&@api"`: 14 passed, 33 failed. All C-08/C-09 list, assets, guard and DV-7 assets specs pass. The 33 failures are other stories: comments (C-10), read-state (C-15), admin concepts (D-05..D-07) and `dv-images.spec.ts` (needs admin D-05).
**Not run:** `@concepts&@ui`; the same specs against Next; lint (no JS change). `converted-tags.txt`, inventory and ledger not updated.

## Gotchas
Arch test forbids `Concept`/`FileAsset` in `App\Http\Controllers\Api`; the queries live in `App\Queries\ClientConcepts`. Parity gates take plain `@a&@b` only (no parentheses/OR).

## Docs updated
sprint-status only.

## Open items
Owner: approve the key screens, then the UI half (gallery, viewer, `@concepts&@ui`). Inventory C-08/C-09 and DV-7 matrix line "pending the client routes" for assets can be closed at integration; comments/revision routes remain 6.8.

## UI half record
**Built:** `Pages/ProjectConceptsController` (`/project/{id}/concepts`, `/project/{id}/concept/{conceptId}`; admin redirect as the Overview; a draft, unknown, malformed or other-project concept is 404, DV-7); `Project/Concepts.tsx` (gallery: `ConceptGallery`/`ConceptCard`, API order (by number, as Next), number + version + approved label, loading, error with retry, empty state) and `Project/Concept.tsx` (`ConceptViewer`: image, version history chips newest first, zoom, designer notes, breadcrumbs, error with retry); `lib/concepts.ts`. Images are the API's signed URLs (`imageUrl`/`imageKey`, `assets[].url`/`imageKey`); props carry no storage path. Opening the gallery POSTs `read-state {area:"concepts"}` after the list loads (Next posts it alongside the list fetch, even if the list fails; ours waits for the list: a recorded improvement); the Concepts tab dot clears only if that call succeeds. The Overview now passes `isNew` (snapshot `hasNewConcepts`/`hasNewMessages`) to the shell, so its dots work too (6.1 finding closed). Dev fixtures `/dev/project-concepts`, `/dev/project-concept` (local/testing only). Laravel parity page objects `hasNewConcepts`, `openGallery`, `openConcept`, `shownImage` implemented in `tests/parity/pages/laravel/areas-0-8b.ts`.
**Not built (omitted, no placeholders):** feedback composer and revision request (6.8, C-10/C-11, K-14 reserve/consume display), Approve (6.9). K-14 here is only the "new" read rule; the revision pending/delivered display belongs to 6.8.
**Deviations:** version history now matches Next: an approved concept shows only its newest file with no history; each version shows "Revision note · vN" for v>1 and the v1 designer note when the concept has no rationale (`ApiAsset.notes`, already in the assets API). Gallery order is the API's (by number), not newest first. Remaining: read-state timing (above); `versionsOf` keeps one file per version, Next lists every file. Cards, not Next's list rows (cards, not Next's list rows; visual design is the owner's later pass). No per-card "New" label: the read state is per project area, not per concept. No polling on the gallery (Next has none).
**Tests:** `tests/Feature/ProjectConceptsPageTest.php` (7), `tests/js/concepts.test.ts` (4), `tests/browser/project-concepts.spec.ts` (7 tests x desktop+phone; screenshots in `tests/browser/screens/`, not looked at).
**Evidence:** `bin/test` exit 0, 2247 passed, 1 warning (Pint, Larastan clean). `bin/ui-test` exit 0 (lint, design lint, 241 unit, tsc). Browser on port 18087: project-concepts 14 passed; project-overview + ui-shells + concepts together 103 passed, 1 failed (an upsell purchase-banner clock test, phone) which passed on rerun (52/52): treated as a flake, unexplained.
**Parity `@concepts&@ui`:** selects J4, J5, J14; all 3 fail for reasons outside this half. J4 stops at the studio's upload: `POST /api/admin/projects/{id}/concepts` does not exist yet (Epic 7); J5 needs 6.8; J14 is admin. So no journey exercises the gallery end to end; the Laravel page objects are written but unrun against a real concept. It ran on the shared `lf-parity` infra already up (my own `infra:up` hit a port clash on 51025), which I left alone.
**Critic fixes (round 2):** IDOR test (concept of project B under A's URL, archived, deleted: 404); `dev/project-concepts`/`dev/project-concept` added to `DevUiRouteTest`; `missing('concept.path')` replaced by an exact-keys assertion; overview "Concepts, new" dot spec (dev overview fixture takes `?new=1`); viewer retry clears the error and shows the skeleton; `hasNewConcepts` throws off a project URL; purchase-banner spec waits for the poll between clock advances (as checkout-success.spec.ts).
**Real-stack check:** `tests/browser/real-concepts.spec.ts` (skipped unless `REAL_STACK_PROJECT`) ran once, no stubs, on the browser-test stack with one hand-seeded published concept with two versions and uploaded objects: signed in, gallery listed it, read-state POST ok, viewer showed v2 and v1 images loaded (naturalWidth>0) and the v2 revision note. Passed (desktop). The parity page objects themselves were not run (the spec mirrors their locators); the seed was manual (parity:seed needs the parity DB marker).
**Not run:** Next-side comparison; Lighthouse; manual look at screenshots.
