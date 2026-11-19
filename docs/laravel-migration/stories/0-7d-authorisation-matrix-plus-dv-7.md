# Story 0.7d: Authorisation matrix plus DV-7

Status: review

**Covers:** C-20, D-20, A-16, X-01, DV-7 (+ DV-14) · **Gate:** `@authz&@api`, `@security&@api` (+ `@deviation`) · **After:** 0.7a–c · **DoD:** E0

## Delivered (`tests/parity/`)
- `journeys/contract/_authz-table.ts`: the single L6 table. All 49 route files (48 `app/api/**/route.ts` + `/checkout/start`) = **56 method endpoints**, each with its request, a `guarded` flag (Origin guard) and the expected status (+ `error.code`) per actor {anonymous, clientA, clientB, admin} on two-tenants project pA. Values are current Next.
- `authz-matrix.spec.ts`: one generated test per cell (**222**; the 2 admin-reply cells are DV-14 tests instead), a table-size check, and the **2 DV-14 `@deviation` tests** (admin concept comment / project message → 201, `isAdmin:true`).
- `origin-guard.spec.ts` (**237**): 30 guarded endpoints × 6 refused variants (no Origin+no Referer, `Origin: null`, foreign Origin, foreign Origin + canonical Referer, foreign Referer, canonical Referer with fragment) → exact `403 INVALID_ORIGIN` body as an anonymous caller (before auth, never 401); 30 × canonical-Referer-only → passes the guard (normal anonymous answer); 26 exempt endpoints × {no Origin, foreign Origin} → their normal answer; one signed-in sweep (admin for `/api/admin/*`, clientA otherwise) with a foreign Origin → 403 everywhere, sessions alive, project/messages/audit/profile unchanged.
- `concept-status-matrix.spec.ts` (**26**): assets, comments GET/POST, revision-requests, approve (+ list/snapshot) × {draft, deleted, archived, published, approved}. 12 plain tests where Next already hides the concept or the status is visible; **14 DV-7 `@deviation` tests** for the target (hidden = byte-identical to a missing concept).
- `fixtures/scenarios/concept-statuses.json` (new): client A's CONCEPTS_READY project, concepts 1 draft, 2 deleted, 3 archived, 4 published, 5 approved; entitlements concepts `[5,4,0]`, revisions `[2,0,0]`. Existing format and keys only. Next's seeder loads it unchanged.
- `expected-next-failures.txt`: the 16 deviation titles.

## Evidence (2026-11-19, Next 16.4 `next dev --webpack` :4370, isolated stack `-p lf07d`, `--workers=1`)
| Gate | Result |
|---|---|
| `@authz&@api` | 279 passed (3.4 min), including the 16 deviations as expected failures and the earlier 0.7b/c `@authz` tests |
| `@security&@api` | 255 passed (1.1 min): 237 origin-guard plus the earlier 0.7a/c `@security` tests |
| `@deviation` | 16 passed (all 16 fail on Next as expected; an unexpected pass would fail the run) |
- `npm run check`: OK (28 spec files, 221 static titles, 16 expected Next failures).

## Decisions taken (for the parent to confirm)
- **DV-7 "indistinguishable" wins over "404".** A hidden concept must answer exactly like a missing one on the same route. Revision requests answer a missing concept with **400** `CONCEPT_NOT_FOUND` (`app/api/projects/[id]/revision-requests/route.ts:62`, pinned by `client-authz.spec.ts`), so hidden concepts there are 400 too. Everywhere else it's 404. The tests compare the full body with the unknown-concept response. Suggest rewording the DV-7 row to match.
- Revision requests need `published`: archived **and approved** are also refused there. Archived is hidden on assets and comments (DV-7 "anything else").
- Assets for an **unknown** concept become 404 `CONCEPT_NOT_FOUND` (Next: 200 `{assets:[]}`, F-7). Required for indistinguishability, so it's a DV-7 deviation test too.
- "Canonical Referer only" is a positive control (§5: a Referer is accepted when Origin is absent), not a 403 case.

## Next behaviour vs the brownfield docs (tests assert Next)
1. `POST /api/admin/checkout/reprocess` with a session Stripe doesn't know → **500** (an uncaught `StripeInvalidRequestError`, `app/api/admin/checkout/reprocess/route.ts:27,63`). No `session_id` → 400 `{error:{message}}` with **no code** (`:24`). Neither is in `api-admin.md`.
2. The Origin guard covers **29 files / 30 method endpoints**, not 23: the 6 `authMutation` endpoints (`lib/auth/http.ts`) also run it, and brief/draft has PUT and DELETE (`auth-and-security.md` §5 counts only the direct `rejectUntrustedMutationOrigin` callers).
3. Comments POST checks the concept **before** the body (`…/comments/route.ts:68` vs `:71`): a bad body on a missing concept is 404, not 400.
4. `snapshot.status` is the derived display status: a CONCEPTS_READY project with an approved concept reports `AWAITING_APPROVAL` (`lib/project-snapshot.ts:247`).
5. Admin cells are as documented: member-only routes 404 `PROJECT_NOT_FOUND` for admins; `POST …/finals` is 404 `FINAL_ZIP_NOT_AVAILABLE` for every signed-in actor; the unsigned webhook is 400 text for everyone; anonymous logout is 200 `{ok:true}`.

## For the Laravel seeder (story 2.6): `concept-statuses`
- The state isn't reachable through domain actions (CONCEPTS_READY with an approved concept beside a published one). Insert the rows as given, with no state-machine or invariant checks.
- **Every** concept, including draft, deleted and archived, gets its v1 concept file asset and stored object (`{projectId}/{conceptId}/v1.{uuid}.png`), as in Next (`apps/web/scripts/parity-seed.mjs:119-126`). The DV-7 tests then prove that filtering hides the files, not that they're missing.
- Deleted is a row with `status=deleted` (soft delete), not an absent row. No revision requests or comments.

## Gotchas
- Generated titles must start with a literal ID (`check-structure.mjs` parses source titles), and deviation titles must be fully literal so they can be listed.
- The Origin sweeps don't seed (the guard answers before I/O). Everything else reseeds per test through `useScenario`, so run with `--workers=1` until the shared DB lock lands in `fixtures.ts`.
- The old `test.fixme` admin-reply tests in `client-concepts.spec.ts:80` and `client-messages.spec.ts:65` duplicate the DV-14 tests. The parent can delete them (not my files).
