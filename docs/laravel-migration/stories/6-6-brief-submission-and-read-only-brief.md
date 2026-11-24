# Story 6.6: Brief submission and read-only brief (API half)

**Status:** review (API half only; UI waits for the owner's key-screen approval) · **DoD variant:** Conversion · **Epic:** 6 · **Covers:** C-07, N-13, N-15 · **Gate:** `@brief&@api` (UI: `@brief&@ui`, pending) · **After:** 6.5. Test mode only.

## Story
As a client I can submit my brief once; as a client or admin I can read the submitted brief.

## Acceptance criteria
API (built):
1. `POST /api/projects/{id}/brief` with the answers → `{ok:true,briefId,version:1}`. In one transaction: `project_briefs` row version 1; status `AWAITING_BRIEF` → `BRIEF_SUBMITTED` (version-guarded); the draft deleted; the system message "Brief received. Your designer will review and reply soon." (once per thread); audit rows `brief_submitted` then `state_changed`. **No email** (N-13); nothing else changes (N-15).
2. Invalid payload (not an object, or brandName, industry or offerSummary empty) → 400 `INVALID_BRIEF_PAYLOAD` naming those three; any other required field empty → 400 naming the empty ones. Checked before project access, as Next.
3. Already submitted, or status not `AWAITING_BRIEF` → 400 `BRIEF_LOCKED`; nothing written. A lost race → 409 `BRIEF_CONFLICT`.
4. `GET /api/projects/{id}/brief` → `{brief:{id,version,answers,createdAt,createdBy}}` (latest) or `{brief:null}`; admin or member.
5. POST is member only (admin non-member 404). Anonymous 401; non-member, unknown or malformed id 404 `PROJECT_NOT_FOUND`; origin guard on POST.
UI (pending, not built): send disabled until the confirmation checkbox is ticked; confirmation; read-only brief page.

## Inventory scope
C-07.

## Next.js source read
`api/projects/[id]/brief/route.ts`, `lib/brief.ts`, `lib/system-messages.ts` (`lib/brief-submission-confirmation.ts` is UI).

## Behaviour notes
The system message sender is the first admin profile, else the submitting user. The submit locks the project row (`FOR UPDATE`) inside `Db::serializable`.

## Laravel implementation
`app/Actions/Brief/SubmitBrief.php`, `ProjectBriefController` (`show`, `submit`), routes `projects.brief.show`, `projects.brief.submit`.

## Deviations from Next.js
| Behaviour | Next.js | Laravel | Why | Decision ref |
|---|---|---|---|---|
| Concurrent submit | transaction without row lock, unique-violation retry | row lock plus version guard, 409 `BRIEF_CONFLICT` on conflict | ADR-011 | none |

## Tests
| Layer | Test | IDs |
|---|---|---|
| L2 | `tests/Feature/Checkout/ProjectBriefApiTest.php` (submit effects, no mail, 400/locked, auth/IDOR, origin, admin read) | C-07, N-13, N-15 |
| L4 | `client-brief.spec.ts`, `client-authz.spec.ts`, `j3-brief.spec.ts` (`@brief&@api`) | C-07 |

## Test evidence
`bin/test`: exit 0, 2158 passed, 1 warning (pre-existing). Typecheck exit 0; `npm run lint` exit 0. Parity `laravel-stack.mjs "@brief&@api"` (own infra and stack, torn down): 14 passed, 1 failed: `admin-brief-and-system-messages.spec.ts` D-04, the admin brief **page** `/admin/projects/{id}/brief` (404; an Epic 7 admin route, not this story).
**Not run:** `@brief&@ui`; the specs against Next; a real concurrent-submit race.

## Gotchas
`Illuminate\Support\Facades\DB` collides with `App\Support\Db` on import: alias it `Database` as FulfilCheckout does.

## Docs updated
sprint-status only.

## Open items
UI half. Owner: D-04 needs the admin brief page (Epic 7).
