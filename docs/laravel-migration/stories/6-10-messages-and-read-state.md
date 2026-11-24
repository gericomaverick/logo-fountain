# Story 6.10: Messages and read state

**Status:** review, **API half only** (UI half pending the owner's key-screen approval) · **DoD variant:** Conversion · **Epic:** 6 · **Covers:** C-14, C-15, FR31, FR32, N-11, DV-14, DV-17 · **Gate:** `@messages&@api`, `@messages&@ui` · **After:** 6.2b, 2.7. Test mode only.

## Story
As a signed-in client (or admin), I can read and post project messages and mark messages or concepts as seen; system lines never repeat after a clean-slate reset except as the owner decided.

## Acceptance criteria
1. `GET /api/projects/{id}/messages` → `{messages:[{id,kind,body,createdAt,sender}]}` oldest first; admin or member; anonymous 401; non-member, unknown or non-UUID id 404 `PROJECT_NOT_FOUND`. (API, done)
2. `POST …/messages {body}` trims; 1-2000 chars else 400 `INVALID_MESSAGE_BODY`; 201 `{ok, message}`. Client sender queues the admin notice; admin sender queues N-11 to the client, once per message id (marker `email_sent:client_new_message:<id>`). (API, done)
3. DV-14: an admin POST succeeds; `is_admin` is never written. (API, done)
4. `POST …/read-state {area}`: `messages` stamps the newest non-system message time, `concepts` the newest of published/approved concept created/updated and comment time (now if none); other area → 400 `INVALID_AREA`; the other column is kept. (API, done)
5. DV-17: `PostSystemMessage` skips a system line only if the same body exists after the project's latest `project_reset` audit event with `mode: clean-slate`. (Action done and tested; no caller yet, the feature stories that post system lines (6.6 brief, 7.x) call it.)
6. Messages page, tab dot, system lines as events. **Pending: UI waits for the owner's key-screen approval.**

## Inventory scope
C-14, C-15 (API half); DV-14, DV-17 (test due here: done at action level; end-to-end with 7.9's reset route).

## Next.js source read
`apps/web/src/app/api/projects/[id]/messages/route.ts` and `read-state/route.ts` with `route.test.ts` beside each; `lib/system-messages.ts`, `lib/message-kind.ts`, `lib/concept-activity.ts`, `lib/project-lifecycle-email.ts` (N-11 and admin notice). Pest cases compared against both route tests (invalid body shape, admin sender, read-state invalid area, admin allowed, member fallback): all covered; the Next admin-upsert case is replaced by DV-14.

## Laravel implementation
`app/Http/Controllers/Api/MessageController.php`, `app/Actions/Messages/ProjectMessages.php`, `app/Actions/Messages/PostSystemMessage.php`; routes `messages.index|store|readState` in `routes/checkout.php`; codes `INVALID_MESSAGE_BODY`, `INVALID_AREA`. Concept activity goes through `Project::clientVisibleConcepts()` (ADR-020).

## Deviations from Next.js
| Behaviour | Next.js | Laravel | Why | Decision ref |
|---|---|---|---|---|
| Admin message POST | 500 (profile upsert blocked) | 201 | profile never written | DV-14 |
| System-message dedupe | whole thread | since last clean-slate reset | owner | DV-17 |
| Unknown or foreign project id | membership error | 404 `PROJECT_NOT_FOUND` (IDOR-safe) | same as 6.7 | n/a |

## Tests
| Layer | Test | IDs |
|---|---|---|
| L2 | `tests/Feature/Checkout/MessagesApiTest.php` (9 cases) | C-14, C-15, DV-14, DV-17, N-11 |
| L4 | `client-messages.spec.ts`, `client-authz.spec.ts`, `authz-matrix.spec.ts`, `client-concepts.spec.ts` (read-state), `dv-email.spec.ts` | C-14, C-15, DV-14 |

## Test evidence
`bin/test` (Pint, Larastan 9, Pest): exit 0, 2175 passed, 1 warning (pre-existing). `npm run typecheck` (vite container): exit 0. Parity `laravel-stack.mjs "@messages&@api"`: 10 passed, 1 failed: `admin-brief-and-system-messages.spec.ts:20` (X-16), which calls the admin clean-slate reset route (`api/admin/projects/{id}/reset`, story 7.9, not built).
**Not run:** `@messages&@ui`; the same specs against Next; `converted-tags.txt`, inventory and ledger not updated.

## Open items
Owner: approve key screens, then the UI half. X-16/DV-17 end-to-end needs 7.9's reset route; callers of `PostSystemMessage` come with the stories that post system lines.
