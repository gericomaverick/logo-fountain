# Story 6.9: Approval

**Status:** review, API half and UI half built (UI half not visually checked) · **DoD variant:** Conversion · **Epic:** 6 · **Covers:** C-12, N-07, N-08, DV-7 · **Gate:** `@approval&@api`, `@approval&@ui` (UI pending) · **After:** 6.7, 2.7. Test mode only.

## Story
As a signed-in client, I can approve a published concept, which locks my choice and starts final file delivery.

## Acceptance criteria
1. `POST /api/projects/{id}/approve` `{conceptId}`: member only (admin and non-member 404 `PROJECT_NOT_FOUND`; anonymous 401; foreign Origin 403). Missing, blank or non-string `conceptId` 400 `INVALID_CONCEPT_ID`. (API, done)
2. Only a `published` concept of the project can be approved; a draft, deleted, archived, approved, foreign, non-uuid or unknown one answers byte-identically 404 `CONCEPT_NOT_FOUND` (DV-7). (API, done)
3. The project must be allowed to move to AWAITING_APPROVAL, else 400 `INVALID_PROJECT_STATUS_TRANSITION` with `details.allowed`, nothing changed. (API, done)
4. In one serializable transaction, project row locked: every other published or approved concept becomes `archived`, this one `approved`, project `AWAITING_APPROVAL`; audits `concept_approved` `{conceptId, conceptNumber}` and `state_changed`. 200 `{ok, concept:{id,number,status}, project:{id,status}}`. (API, done)
5. N-07 (client, "Concept approved - final files in progress") and N-08 (admin, "Client approved a concept") queued after commit, once each (`email_sent:client_concept_approved:<conceptId>`, `email_sent:admin_concept_approved:<conceptId>`). (API, done)
6. Follow-up: `SubmitBrief`'s system message goes through `Actions/Messages/PostSystemMessage` (DV-17: deduped since the last clean-slate reset, not across the whole thread). (done)
7. Approval confirmation dialog (acknowledgement checkbox, copy from `lib/final-approval.ts`). (UI, done: see UI half.)

## Inventory scope
C-12, N-07, N-08 (API half); DV-7 (approve route).

## Next.js source read
`apps/web/src/app/api/projects/[id]/approve/route.ts` and `route.test.ts`; `lib/final-approval.ts`; `notifyClientConceptApproved` / `notifyAdminConceptApproved` in `lib/project-lifecycle-email.ts`; parity `client-authz.spec.ts`.

## Behaviour notes
Next order: origin guard, sign-in, body (`conceptId` trimmed, else 400 `INVALID_CONCEPT_ID`), membership, published concept (404), transition check (400), then a transaction (archive others in published/approved, approve, project status, two audits), then both emails after it. The acknowledgement is UI-only: the API takes just `conceptId`, so the Laravel route does too. Next's `route.test.ts` is fully mocked; it pins only that both emails are called with `(projectId, conceptId)` and a 200.

## Deviations from Next.js
| Behaviour | Next.js | Laravel | Why | Decision ref |
|---|---|---|---|---|
| Concept and transition checks | before the transaction, no lock | inside one serializable transaction with the project row locked | two parallel approvals of different concepts could both pass on Next | ADR-016 pattern (as 6.8) |
| Emails | sent inline after the transaction, dedupe marker after the send | queued after commit, marker at dispatch | ADR-018, ADR-019, DV-8 | DV-8 |
| Hidden concept | 404 for non-published (same) | same, byte-identical for every non-published case | DV-7 | DV-7 |

## Laravel implementation
`Actions/Approval/ApproveConcept`, `Http/Controllers/Api/ApproveConceptController`, route `concepts.approve` in `routes/checkout.php`, `ErrorCodes::INVALID_CONCEPT_ID`. `SubmitBrief` now calls `PostSystemMessage::post` (its private whole-thread dedupe removed).

## Tests
| Layer | Test | IDs |
|---|---|---|
| L2 | `tests/Feature/Checkout/ApproveConceptApiTest.php` (8 cases incl. datasets: success and emails, repeat approval, bad state, DV-7 matrix, body, guards) | C-12, N-07, N-08, DV-7 |
| L2 | `ProjectBriefApiTest.php` "DV-17: the brief system message dedupes since the last clean-slate reset" | DV-17 |
| L4 | `client-authz.spec.ts` (C-12 guards, `:104` approve line) | C-12 |
Compared with Next `route.test.ts`: its one case (both emails called with project and concept id) is covered by the marker and job count assertions.

## Test evidence
`bin/test` (check-agents-guide, Pint, Larastan 9, Pest incl. `tests/Concurrency`): 2209 passed, 1 warning (pre-existing `SafeNextTest`), exit 0. `npm run typecheck` exit 0; `npm run lint` exit 0 (in the stack's `vite` container).
**Not run, and why:** the parity suite (`@approval&@api`, `client-authz.spec.ts:104`) against Laravel: `tests/parity` has no `node_modules` here; the builder's note from 6.8 says it is the owner's call to install. UI not built. (Superseded: the concurrency test now exists, see Addendum.)

## Gotchas
The repeat approval of the same concept is a 404 `CONCEPT_NOT_FOUND` (it is now `approved`, no longer `published`), not a transition 400, as on Next.

## Docs updated
sprint-status (6-9 review), this story. Inventory rows C-12/N-07/N-08 not changed (UI half pending).

## Open items
Owner: approve the key screen so the confirmation dialog UI can follow. (The `pg-race` test for parallel approvals now exists.)

## Addendum 2026-11-24
- `tests/Concurrency/ApprovalRaceTest.php` (`pg-race`, child mode `approve` in `Children/race.php`): two parallel approvals of different concepts give one winner and one loser; one approved concept, project AWAITING_APPROVAL, each approval email once. The loser code is pinned to `CONCEPT_NOT_FOUND`; it held in 4 of 4 runs (plus 3 earlier runs under the wider set).
- Rename: the repeat-approval test in `ApproveConceptApiTest` now says 404 `CONCEPT_NOT_FOUND`; `STATUS_CHANGE_CONFLICT` is now `ErrorCodes::STATUS_CHANGE_CONFLICT` in `ApproveConcept`.
- Final merged `bin/test`: 2226 passed, 1 warning, exit 0.

## UI half (2026-11-27)
- **What:** `Components/project/ConceptApproval.tsx`, placed above the feedback on `Pages/Project/Concept.tsx`. Primary "Approve this concept" opens the existing `ConfirmDialog` (focus trap, Escape, "Not yet"): Next's copy (`lib/final-approval.ts`) plus "Your other concepts are archived", an acknowledgement checkbox, confirm "Yes, approve this concept". Posts only `{conceptId}`; a ref guard stops a double submit. `lib/concepts.ts`: `canApprove`, `APPROVAL_COPY`, `approvalError` (`CONCEPT_NOT_FOUND`, `INVALID_PROJECT_STATUS_TRANSITION`, `STATUS_CHANGE_CONFLICT`, `PROJECT_NOT_FOUND`, else the API message); errors show in the dialog, which stays open.
- **States as Next:** the button shows only for a `published` concept while the project is `CONCEPTS_READY`; an `approved` concept shows a final-files notice with a link to the Overview; archived or other stages show nothing. On success the page props reload (`router.reload()`), so the concept, project status and Overview follow the server.
- **Deviation:** "Request a revision" on the concept page is now a secondary button so the page has one primary (Approve). Next's Approve is also a secondary button; Laravel follows UX §3 (one primary).
- **Tests:** `tests/js/concepts.test.ts` (+2); `tests/browser/project-concepts.spec.ts` (+8 `@ui approval`: dialog copy and acknowledgement gate, body, Escape and Not yet with focus return, double click, three error codes, status states; desktop and phone screenshots incl. the dialog); `tests/browser/real-approval.spec.ts` (real stack, no stubs).
- **Run:** `bin/test` 2248 passed (1 warning, existing). `bin/ui-test` exit 0 (246 unit). `project-concepts.spec.ts` on own stack (port 18087): 62 passed (desktop and phone). Real-stack approval ran once against a tinker-seeded project: approved, final-files state shown, Approve button gone, Overview loaded (first attempt failed on an ambiguous locator in my test, fixed, rerun passed).
- **Not run:** parity `@approval&@api` / `@approval&@ui` (the Laravel parity page object `tests/parity/pages/laravel/approval.ts` is still a stub and out of this brief's scope, so `@ui` would fail at "not implemented"; the parity stack was not started); the full browser suite; visual check of screenshots (`tests/browser/screens/concept-approve-dialog-*.png`). The Overview's own final-files state was not changed or checked beyond loading.
