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

## Conversion record: UI half (home, one-project shortcut, admin redirect)

### Built
`DashboardController` (`/dashboard`: one project redirects to `/project/{id}`, otherwise `Pages/Dashboard.tsx`: cards from `Components/ui` (Card, CardLink, StatusPill, EmptyState) with turn pill, "New concepts" / "New message" dot line, empty state). Rows come from `ProjectSnapshot::for` per project (brand name from the latest brief, `hasNewConcepts/hasNewMessages`); `GET /api/projects` is unchanged. `ProjectOverviewController`: an admin on `/project/{id}` redirects to `/admin/projects/{id}` (that page 404s until Epic 7). Dev fixture route `/dev/dashboard`. Parity page object `openProject` (`tests/parity/pages/laravel/project-ui.ts`) now goes through `/dashboard` and the list cards.
### Tests
| Layer | Test | Result |
|---|---|---|
| L2 | `tests/Feature/DashboardPageTest.php` (4), `ProjectOverviewPageTest` admin case changed to the redirect | in `bin/test` exit 0: Pint, Larastan, Pest 2237 passed, 1 warning (`SafeNextTest`, not from this change) |
| L7 | `tests/browser/project-list.spec.ts` (3 tests x desktop+phone = 6), own stack port 18087 | 6 pass. `project-overview.spec.ts` rerun once: 42 passed in total with the list spec, apart from the card-click test fixed afterwards |
| L4 | DV-UX journeys 1 and 2 (`@deviation @ui`) on Laravel via `laravel-stack.mjs --only "DV-UX/C-01/A-01\|DV-UX/D-02"` | 2/2 pass |
`bin/ui-test` exit 0 (237 unit tests, lint, tsc). Screenshots (not baselines, not looked at by me): `apps/portal/tests/browser/screens/project-list-{desktop,phone}.png`, `project-list-empty-{desktop,phone}.png` (git-ignored).
### Deviations / decisions
- **Admin on `/dashboard` is not redirected to `/admin`** (Next does): `/admin` does not exist until Epic 7, so the redirect stranded admin sign-in on a 404 (seen in the DV-UX journey). The admin sees the membership-based list, normally empty. Add the redirect with Epic 7.
- The brief said `@client&@ui` selects nothing; the gate used is the `@deviation @ui` DV-UX journey plus the browser spec.
- The "new" dots are one text line with a dot, not Concepts/Messages tab dots; the Overview's shell tabs still show no dots (`isNew` is not passed in `Project/Overview.tsx`).
### Not run
DV-UX journey 3 (setup link `next`), `@client&@ui` (empty), the Next side, axe on the new page, any other parity gate, the visual look of the screenshots.
### Open items
Admin `/dashboard` → `/admin` and the `/admin/projects/{id}` page (Epic 7). Inventory C-01 row not edited (still "Not started"); the owner or reviewer should update it.
