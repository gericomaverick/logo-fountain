# Story 6.5: Brief wizard and drafts (API half)

**Status:** review (API half only; UI waits for the owner's key-screen approval) · **DoD variant:** Conversion · **Epic:** 6 · **Covers:** C-05 (API half), C-06, FR25 · **Gate:** `@brief&@api` (UI: `@brief&@ui`, pending) · **After:** 6.2b, 0.6b. Test mode only.

## Story
As a signed-in client, my unfinished brief is saved to the server and restored on reload; nobody else (admins included) can read it.

## Acceptance criteria
API (built):
1. `GET /api/projects/{id}/brief/draft` → `{draft:{answers,updatedAt}}` or `{draft:null}`. `answers` always has the sixteen keys (unknown keys dropped, old `description`/`styleNotes` mapped); `updatedAt` is ISO with milliseconds.
2. `PUT` → `{ok:true,updatedAt}`; upserts the one draft per project; answers are trimmed and length-capped; empty required fields are kept (a draft is unfinished). Missing or non-object `answers` → 400 `INVALID_BRIEF_DRAFT_PAYLOAD`; project no longer `AWAITING_BRIEF` → 400 `BRIEF_LOCKED`.
3. `DELETE` → `{ok:true}`, also when no draft exists.
4. Members only: anonymous 401; non-member, admin non-member, unknown or malformed id 404 `PROJECT_NOT_FOUND`. Mutations go through the origin guard (403 `INVALID_ORIGIN`).
UI (pending, not built): autosave 800 ms after the last change to server and session storage, status always visible, reload restores the draft, step gating follows the required fields, spaces and newlines kept in answers.

## Inventory scope
C-06 (done), C-05 (API half only).

## Next.js source read
`api/projects/[id]/brief/draft/route.ts`, `lib/brief-draft.ts`, `lib/brief.ts:304-385`.

## Behaviour notes
Next accepts any JSON object as `answers` (arrays included: they normalise to all-empty). Auth runs before the body check, the body check before the status check, as Next.

## Laravel implementation
`app/Http/Controllers/Api/ProjectBriefController.php` (`draft`, `saveDraft`, `discardDraft`), `app/Domain/BriefAnswers.php` (`normalize`, `missing` added; `parse` now built on `normalize`), error codes in `app/Support/ErrorCodes.php`, routes in `routes/checkout.php` (`projects.brief.draft*`).

## Deviations from Next.js
None. (Answer length cap counts characters, not UTF-16 units: as 6.2a.)

## Tests
| Layer | Test | IDs |
|---|---|---|
| L2 | `tests/Feature/Checkout/ProjectBriefApiTest.php` (draft, auth/IDOR, origin, locked cases) | C-06 |
| L4 | `journeys/contract/client-brief.spec.ts`, `client-authz.spec.ts`, `j3-brief.spec.ts` (`@brief&@api`) | C-06 |

## Test evidence
See story 6.6 (one run covers both): `bin/test` exit 0, 2158 passed; typecheck exit 0; eslint exit 0; parity `@brief&@api` 14 passed, 1 failed (admin page, Epic 7).
**Not run:** `@brief&@ui`; the specs against Next.

## Gotchas
Error bodies are `{error:{code,...}}`, so tests assert `error.code`.

## Docs updated
sprint-status only. Inventory columns, `converted-tags.txt` and ledger left to integration.

## Open items
UI half (wizard, autosave, step gating) after the owner approves the key screens.
