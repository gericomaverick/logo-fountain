# Story 6.7: Concepts gallery and viewer

**Status:** review, **API half only** (UI half pending the owner's key-screen approval) · **DoD variant:** Conversion · **Epic:** 6 · **Covers:** C-08, C-09, FR26, DV-7, DV-12 · **Gate:** `@concepts&@api`, `@concepts&@ui`, `@deviation` (DV-7) · **After:** 6.2b, 3.4, 2.2. Test mode only.

## Story
As a signed-in client (or admin), I can list a project's published concepts and every version of one concept, with stable image keys.

## Acceptance criteria
1. `GET /api/projects/{id}/concepts` → `{concepts, projectStatus}`, ordered by number; published and approved only; admin or member; anonymous 401; non-member 404 `PROJECT_NOT_FOUND`; an admin asking for an unknown project gets `{concepts:[], projectStatus:null}`. (API, done)
2. `GET …/concepts/{cid}/assets` → `{assets:[{path,version,createdAt,url,notes}]}`, every version, version desc. (API, done)
3. A draft, deleted or archived concept ID, or one from another project, answers byte-identically to an unknown ID: 404 `CONCEPT_NOT_FOUND` (DV-7). (API, done)
4. Concept and asset payloads carry `imageKey` (DV-12). (API, done)
5. Gallery `/project/{id}/concepts` and viewer `/project/{id}/concept/{cid}` pages. **Pending: UI waits for the owner's key-screen approval.**

## Inventory scope
C-08, C-09 (API half).

## Next.js source read
Parity contracts `client-concepts.spec.ts`, `concept-status-matrix.spec.ts`, `client-authz.spec.ts`; `brownfield/api-client.md:30-31`. The Next route files are not in this tree (`apps/web` has no `api/projects/[id]/concepts`), so the contract specs and brownfield notes were the source.

## Behaviour notes
Unknown project: admin lists empty with `projectStatus:null`; a non-admin gets 404. `projectStatus` is the persisted status. `revisionVersion` = highest `v<n>` of the concept's files (min 1); `imageUrl` signs the newest-version file. Legacy `<project>/<concept>.<ext>` files count as v1.

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
| L2 | `tests/Feature/Checkout/ConceptApiTest.php` (7 cases) | C-08, C-09, DV-7, DV-12 |
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
