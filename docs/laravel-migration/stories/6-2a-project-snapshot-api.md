# Story 6.2a: Project snapshot API

**Status:** review (from `origin/workbench/epic-6-2a-snapshot` 9a79fbe) · **DoD variant:** Conversion · **Epic:** 6 · **Covers:** C-02 (snapshot half), C-16 · **Gate:** `@client&@api` · **After:** 2.3, 3.1. Test mode only.

## Story
As a signed-in client (or admin), I can fetch a project's snapshot and entitlements, shaped exactly as Next serves them.

## Acceptance criteria
1. `GET /api/projects/{id}` → `{snapshot}`; admin or member; anonymous 401; non-member/unknown/malformed id 404 `PROJECT_NOT_FOUND`.
2. Snapshot keys and types match `tests/parity/fixtures/contracts/snapshot.schema.json` for every scenario; keys Next leaves `undefined` are absent (not null); `concepts[].imageKey` is the only additive key (DV-12).
3. `GET /api/projects/{id}/entitlements` → `{entitlements:{concepts,revisions}}` remaining, clamped at 0; member only (an admin non-member gets 404). No package defaults here (as Next).
4. Concepts only through the client-visible scopes (ADR-020).
5. `GET /api/projects` (list) is not touched (6.1).

## Inventory scope
C-02 (snapshot), C-16.

## Next.js source read
`lib/project-snapshot.ts`, `lib/brief.ts:306-375`, `lib/entitlements.ts`, `api/projects/[id]/route.ts`, `api/projects/[id]/entitlements/route.ts`.

## Behaviour notes
Primary contact = owner membership else first. Timeline timestamps: inferred, then first `state_changed` audit per `nextStatus` wins. Usage: rows win; package defaults (1/2/3) only when neither row exists, `configured:false`, no `unlimited`. `readState` is `{}` when unset. Stuck reasons come from the latest order. Revision requests/messages: newest 10 / all, system messages included in `messages`.

## Laravel implementation
`app/Queries/ProjectSnapshot.php` (builder), `app/Domain/BriefAnswers.php` (brief normaliser), `app/Http/Controllers/Api/ProjectSnapshotController.php`, routes in `routes/checkout.php` (`projects.snapshot`, `projects.entitlements`).

## Deviations from Next.js
| Behaviour | Next.js | Laravel | Why | Decision ref |
|---|---|---|---|---|
| `concepts[].imageKey` | absent | present | DV-12 | DV-12 |
| Brief answer length cap | UTF-16 units | characters | only differs for astral chars | none |

## Tests
| Layer | Test | IDs |
|---|---|---|
| L2 | `tests/Feature/Checkout/ProjectSnapshotApiTest.php` (3 tests) | C-02, C-16 |
| L4 | `client-projects.spec.ts` snapshot and entitlements specs | C-02, C-16 |

## Test evidence
`bin/test`: exit 0, 2147 passed, 1 warning (pre-existing). Parity `laravel-stack.mjs "@client&@api"`: 15 passed, 62 failed, 1 skipped; all 8 snapshot/entitlement specs in `client-projects.spec.ts` pass on Laravel (including the schema check over every scenario). The 3 `GET /api/projects` list specs fail (6.1's route). The other failures are specs for routes not built yet (revisions, settings, etc.).
**Not run:** the same specs against Next; the full `@client&@api` gate is not green because other stories' routes are missing. `converted-tags.txt`, inventory columns and test-port ledger not updated (left to integration).

## Gotchas
Larastan level 9 needs multi-line docblocks for `@return` on query helpers.

## Docs updated
sprint-status only.

## Open items
Owner: add `@client&@api` to converted-tags once 6.1 and the other client routes land.
