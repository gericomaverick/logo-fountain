# Story 6.8: Comments and revision requests

**Status:** review, **API half only** (UI half pending the owner's key-screen approval) · **DoD variant:** Conversion · **Epic:** 6 · **Covers:** C-10, C-11, DV-7, DV-14 · **Gate:** `@concepts&@api` (C-10 cases), `@revisions&@api` (C-11 cases), `@pg-race` · **After:** 6.7, 2.4, 2.7. Test mode only.

## Story
As a signed-in client (or admin, for comments), I can comment on a published concept and request a revision against it.

## Acceptance criteria
1. `GET/POST /api/projects/{id}/concepts/{cid}/comments`: admin or member; `{comments}` ascending; POST 201 `{ok, comment:{id,body,createdAt,author:{id,email,fullName,isAdmin}}}`; body trimmed, 1-2000 chars else 400 `INVALID_COMMENT_BODY`; no system message, no email; a thread per concept. (API, done)
2. Anonymous 401; non-member or non-uuid project 404 `PROJECT_NOT_FOUND`. A draft, deleted, archived, foreign or unknown concept answers byte-identically: 404 `CONCEPT_NOT_FOUND` (DV-7). (API, done)
3. An admin reply does not 500 and writes no admin flag (DV-14). (API, done)
4. `POST /api/projects/{id}/revision-requests`: member only (admin 404). Body 1-5000 and `conceptId` else 400 `INVALID_BODY`. In one serializable transaction: project locked, transition to `REVISIONS_IN_PROGRESS` checked (400 `INVALID_PROJECT_STATUS_TRANSITION` with `details.allowed`), concept must be published (else 400 `CONCEPT_NOT_FOUND`, DV-7), one `revisions` entitlement reserved by a single guarded UPDATE (else 400 `NO_REVISIONS_REMAINING`), request row, status, system message and audit written. 201 `{ok, revisionRequest, project}`. (API, done)
5. One admin email per request (`email_sent:admin_feedback_on_concept:<requestId>`), queued after commit. (API, done)
6. Concept comment and revision-request UI. **Pending: UI waits for the owner's key-screen approval.**

## Inventory scope
C-10, C-11 (API half).

## Next.js source read
`apps/web/src/app/api/projects/[id]/concepts/[conceptId]/comments/route.ts`, `.../revision-requests/route.ts` and `route.test.ts`; parity specs `client-concepts.spec.ts`, `client-revisions.spec.ts`, `client-authz.spec.ts`.

## Deviations from Next.js
| Behaviour | Next.js | Laravel | Why | Decision ref |
|---|---|---|---|---|
| Hidden concept on comments | 200 / thread | 404 `CONCEPT_NOT_FOUND` | DV-7 | DV-7 |
| Revision on unpublished concept | accepted | 400 `CONCEPT_NOT_FOUND` | DV-7 | DV-7 |
| Revision on an approved concept | accepted | 400 `CONCEPT_NOT_FOUND` (lookup is `published` only; the status transition does not block it, a project can stay CONCEPTS_READY after a concept is approved) | approved concepts are not revisable; owner to confirm | DV-7 |
| Admin comment POST | 500 | 201 | DV-14 | DV-14 |

## Laravel implementation
`ConceptCommentController`, `RevisionRequestController`, `Actions/Revisions/RequestRevision`, `Queries/ConceptThread`; routes in `routes/checkout.php`; four new `ErrorCodes`.

## Tests
| Layer | Test | IDs |
|---|---|---|
| L2 | `tests/Feature/Checkout/CommentsRevisionsApiTest.php` (22 cases) | C-10, C-11, DV-7, DV-14 |
| L3 | `tests/Concurrency/RevisionRequestRaceTest.php` (`pg-race`, 6 processes, limit 2) | C-11 |
| L4 | `client-concepts.spec.ts`, `client-revisions.spec.ts`, `client-authz.spec.ts` | C-10, C-11 |

Parity on Laravel: the combined gate ran 41 passed, 26 failed; the failures are admin (D-05..D-09), read-state (C-15, story 6.10), approve (`client-authz.spec.ts:104` stops at the `/approve` line, story 6.9) and `dv-images`. All C-10/C-11 client cases pass.

**Test evidence (after merging 6.10):** `bin/test` (Pint, Larastan, Pest incl. `tests/Concurrency`) full run: 2198 passed, 1 failed, exit 1: `ConceptApiTest` "signs the file created…" (6.7, presigned-URL `X-Amz-Date` fell on a second boundary; passes alone, 8 passed, exit 0). Then `RevisionRequestRaceTest` + `CommentsRevisionsApiTest` + `MessagesApiTest` together: see the report for the count. The earlier parity numbers above are unchanged; `pg-race` ran as part of that Pest run.
