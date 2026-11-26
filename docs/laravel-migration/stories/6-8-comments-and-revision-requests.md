# Story 6.8: Comments and revision requests

**Status:** review, API half and UI half (UI half: owner to check the screens listed below) · **DoD variant:** Conversion · **Epic:** 6 · **Covers:** C-10, C-11, DV-7, DV-14 · **Gate:** `@concepts&@api` (C-10 cases), `@revisions&@api` (C-11 cases), `@pg-race` · **After:** 6.7, 2.4, 2.7. Test mode only.

## Story
As a signed-in client (or admin, for comments), I can comment on a published concept and request a revision against it.

## Acceptance criteria
1. `GET/POST /api/projects/{id}/concepts/{cid}/comments`: admin or member; `{comments}` ascending; POST 201 `{ok, comment:{id,body,createdAt,author:{id,email,fullName,isAdmin}}}`; body trimmed, 1-2000 chars else 400 `INVALID_COMMENT_BODY`; no system message, no email; a thread per concept. (API, done)
2. Anonymous 401; non-member or non-uuid project 404 `PROJECT_NOT_FOUND`. A draft, deleted, archived, foreign or unknown concept answers byte-identically: 404 `CONCEPT_NOT_FOUND` (DV-7). (API, done)
3. An admin reply does not 500 and writes no admin flag (DV-14). (API, done)
4. `POST /api/projects/{id}/revision-requests`: member only (admin 404). Body 1-5000 and `conceptId` else 400 `INVALID_BODY`. In one serializable transaction: project locked, transition to `REVISIONS_IN_PROGRESS` checked (400 `INVALID_PROJECT_STATUS_TRANSITION` with `details.allowed`), concept must be published (else 400 `CONCEPT_NOT_FOUND`, DV-7), one `revisions` entitlement reserved by a single guarded UPDATE (else 400 `NO_REVISIONS_REMAINING`), request row, status, system message and audit written. 201 `{ok, revisionRequest, project}`. (API, done)
5. One admin email per request (`email_sent:admin_feedback_on_concept:<requestId>`), queued after commit. (API, done)
6. Concept comment and revision-request UI (done, below).

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


## UI half (C-10, C-11, K-14; UX §3, §12, §14)
**Built:** `Components/project/ConceptFeedback.tsx` on `Pages/Project/Concept.tsx`: the feedback thread (comments from `GET …/comments` plus this concept's revision requests from the snapshot, one timeline, as Next's `buildUnifiedConceptThread`) using `Thread`; one textarea with two buttons, "Send comment" (secondary, free) and "Request a revision" (primary). The preview "This uses 1 of your N revisions. You'll have M left." shows before sending. Rules in `lib/concepts.ts` (`revisionPreview`, `revisionBlock`, `feedbackError`). After a revision request the page reloads the `snapshot` prop only, so the allowance and project status update; the allowance meter itself lives on the Overview.
**Blocked states:** concept not published (approved/archived): no composer, a sentence says why (Next hides it too). Project not CONCEPTS_READY/REVISIONS_IN_PROGRESS: revision button disabled with reason, comments still work. No revisions left: revision disabled, link to the project Overview (where the upsell panel is). API codes mapped to plain sentences: `NO_REVISIONS_REMAINING` (+ Overview link), `CONCEPT_NOT_FOUND`, `INVALID_PROJECT_STATUS_TRANSITION`, `INVALID_COMMENT_BODY`, `INVALID_BODY`; typed text is always kept on error. Thread load failure: retry, composer still works.
**Deviations from Next:** Next disables the revision button on `entitlements.revisions <= 0` only, shows a raw message for errors, and lets a client see the composer on any non-approved concept; here the stage and concept-status blocks are explicit. Comments from the client show as "You"; a designer shows by name. Unlimited packages: Next treats a null limit as unlimited (`concept-entitlement.ts:25,36`); the Laravel API does not (`RequestRevision.php:62` reserves only where `limit_int IS NOT NULL`; `ProjectSnapshot.php:221` reports `unlimited`), so an unlimited package would get `NO_REVISIONS_REMAINING`. **Open item for the owner:** the API differs from Next; `app/` unchanged. The UI copy no longer promises unlimited ("This asks your designer for a new version."). Comment box capped at 2000 (Next's and the API's cap); a ref guard stops a double submit; focus returns to the box after a send. No new primitives (the gap: the thread has no "Revision request" badge or status chip, so a request reads "Revision requested: …" in the bubble).
**Dev fixtures:** `/dev/project-concept?left=N&project=STATUS&status=CONCEPT_STATUS` (routes/web.php); no new routes, so `DevUiRouteTest` is unchanged.
**Tests:** `tests/js/concepts.test.ts` (3 new), `tests/browser/project-concepts.spec.ts` (@ui, 11 new incl. each error code, blocked states, desktop+phone screenshots `tests/browser/screens/concept-feedback-*.png`, not viewed).
**Run:** `bin/test` 2248 passed, exit 0. `bin/ui-test` exit 0 (244 unit). Browser suite on its own stack (port 18087): 406 passed, 10 skipped, 14 failed; all 14 are existing `@visual` axe/baseline specs in ui-catalogue, ui-media, ui-shells and ui-status that timed out at 30 s in `page.evaluate` (machine load, not touched by this change); no `project-concepts` test failed. Parity `@revisions&@api`: 13 passed, 7 failed, all admin (D-05/D-08/D-09, `dv-email`): admin side not built. Parity `@revisions&@ui` (J5): fails at "Laravel page object concepts.comment: not implemented (story 6.8)"; the Laravel page objects in `tests/parity/pages/laravel` were out of scope, and J5 also needs the admin delivery step (D-09). **Critic round:** added browser tests for double click (one POST), the 2000 cap and focus, preview with reserved>0, unlimited copy. Real-stack: `tests/browser/real-feedback.spec.ts` (skipped without `REAL_STACK_PROJECT`, no stubs) ran once on port 18087 against a tinker-seeded project (revisions limit 3): posted a comment and a revision request, thread and allowance (2 left, then 1 left after reload) passed, desktop. The 14 `@visual` files (ui-catalogue, ui-media, ui-shells, ui-status) rerun alone: 242 passed, 8 skipped, 0 failed (the earlier failures were load). `bin/test` 2248 passed, `bin/ui-test` exit 0. **Not run:** visual check of screenshots.
**Owner check:** `/dev/project-concept?left=1`, `?left=0`, `?project=AWAITING_APPROVAL`, `?status=approved`, desktop and phone: the preview line wording, the two-button composer, the "Revision requested: …" bubble in place of a badge, and that "Request a revision" is the one primary action.
