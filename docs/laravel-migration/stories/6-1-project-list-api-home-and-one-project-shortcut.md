# Story 6.1: Project list API, home and one-project shortcut (API half)

**Status:** review (API half only; created from `origin/workbench/epic-6-1-api` 9a79fbe) · **DoD variant:** Conversion · **Epic:** 6 · **Covers:** C-02 (list) · **Gate:** `@client&@api` (list) · **After:** 1.9, 4.8, 2.3

> The home screen, the one-project sign-in shortcut, `/dashboard` and the admin redirect (`/project/{id}` → `/admin/projects/{id}`, DV-UX) are NOT in this branch: the owner holds the 6.1 screens until key-screen designs are approved. `apps/web` is frozen and untouched.

## Story
As a signed-in client, `GET /api/projects` lists my projects so the portal can build its home.

## Acceptance criteria
1. `GET /api/projects` returns `{projects:[{id,status,packageCode}]}` (`apps/web/src/app/api/projects/route.ts`), the projects of every client the user is a member of, newest first.
2. Membership only: an admin with no memberships gets `{projects:[]}` (`client-projects.spec.ts:77`).
3. No session → 401 `UNAUTHORIZED` (`client-projects.spec.ts:82`).
4. Turn pills and new-dots: the contract and the parity specs carry no such fields on the list. The turn derives from `status` (UX §5.3 table) and new-dots from the polled snapshot flags, both in the UI half. Nothing is added to the list payload.

## Inventory scope
C-02 (list half). Snapshot (6.2a) and all UI are out.

## Next.js source read
`api/projects/route.ts:1-34`, `route.test.ts`.

## Behaviour notes
Next orders per client membership (unordered) then by `createdAt` desc; Laravel orders all projects by `created_at` desc, then id. Identical for one client; differs only in how several clients interleave (Next's order there is undefined).

## Planned deviations from Next.js
None.

## Tasks
1. Controller + route. 2. Pest feature test. 3. Parity run. 4. Record, sprint-status.

## Test plan
| Layer | Test | Covers |
|---|---|---|
| L2 | `tests/Feature/ProjectListApiTest.php` | AC 1-3 |
| L4 | `client-projects.spec.ts` "project list" (3 tests, `@client&@api`) | AC 1-3 |

## Definition of done
Conversion DoD (`epics.md:35`) for the API half; screens remain open, so the story stays below `done` after review.

## Conversion record

### Inventory scope
C-02 (list).
### Next.js source read
`api/projects/route.ts:1-34`.
### Tests
| Layer | Test file / title | Inventory IDs |
|---|---|---|
| L2 | `tests/Feature/ProjectListApiTest.php` (3) | C-02 |
| L4 | `client-projects.spec.ts` project list (3), run on Laravel | C-02 |
### Test evidence
`bin/test` exit 0: Pint, Larastan, Pest 2147 passed. Frontend typecheck and lint clean. Parity `@client&@api` project-list titles: 3/3 pass on Laravel (own stack, ports 18090). Not run on Next.
### Gotchas
None.
### Docs updated
`sprint-status.yaml`. Inventory C-02 left "not started": snapshot half and UI remain.
### Open items
Home, one-project shortcut, `/dashboard`, admin redirect: held by the owner.
