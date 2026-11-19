# Story 0.7c: Contract suite: admin endpoints

Status: done

**Covers:** D-01…D-19, K-12 (+ D-20/X-01 guards) · **Gate:** `@admin&@api` · **After:** 0.4 (0.5 for reprocess success) · **DoD:** E0

## Delivered
- `tests/parity/journeys/contract/_admin-helpers.ts`: `test` with a cross-process DB lock (auto fixture; seeding truncates the shared DB, so tests never interleave across workers), `scenario(name)` (seed + deterministic IDs + signed-in admin), `client()`, `expectError` (X-03 shape), in-test PNG/ZIP generators, multipart helpers.
- Specs (`journeys/contract/`): `admin-guards` (401/403 sweep over all 19 endpoints, INVALID_ORIGIN before auth), `admin-projects` (list/?status, snapshot, audit, revision-requests, invoices), `admin-status`, `admin-concepts` (GET, upload/replace/revision, receipts, replay, mismatch, validation), `admin-concept-actions` (publish, delete, delivered), `admin-finals` (upload incl. F-11 string errors, notify, download), `admin-entitlements` (+ reset stub), `admin-reset`, `admin-ops` (health, public health, reprocess 400).

## Evidence (2026-11-19, Next on PG 18.7 :55520, SeaweedFS 4.51 `weed mini` :8343)
- `@admin&@api`: **55 passed, 4 fixme**, 0 failed; stable with 1–4 workers. `npm run check` OK (61 tests).
- SeaweedFS 4.51 honours `If-None-Match: *` on PUT (second PUT → 412 PreconditionFailed).

## Fixme (not covered)
- D-06 publish of a **draft** (no scenario has a draft concept, F-10).
- D-11 `FINAL_REPAIR_REQUIRES_APPROVAL` (needs FINAL_FILES_READY without an approved concept).
- D-03 RESUME evidence / stale `heldVersion` revalidation (no scenario; or L3).
- K-12 reprocess success / deduped / `CHECKOUT_SESSION_NOT_PAID` → story 0.5 (stripe-fake).
- Not attempted (race-only, `@pg-race`): STATUS_CHANGE_CONFLICT, CONCEPT_*_CONFLICT, LIFECYCLE_CONFLICT, FINAL_PUBLICATION_*, CONCEPT_UPLOAD_CLEANUP_FAILED, audit 100-row cap.

## Next behaviour vs brownfield/api-admin.md (tests assert Next)
- Publish idempotent response is `{ok, concept, projectStatus:null}`, no `publishedNow` (`concepts/[conceptId]/publish/route.ts:43,104`).
- Status: any refused transition (e.g. CANCELLED→ON_HOLD, DELIVERED→CANCELLED) returns `409 INVALID_HOLD_RESUME` (`status/route.ts:59,76`).
- Concept upload: in-transaction aborts (NO_PENDING_REVISION_REQUESTS, CONCEPT_NOT_REPLACEABLE…) are **400**, pre-checks of the same codes are 409 (`concepts/route.ts:369`); FILE_REQUIRED precedes REQUEST_KEY_REQUIRED (`:176`).
- Audit / revision-requests / invoices / concepts GET for an unknown project → 200 with empty lists (no 404).
- `entitlementUsage` for a null (unlimited) limit reports `limit:0, unlimited:true` (`lib/entitlements.ts:26`).
- Finals notify/upload in dev without Postmark: notify → `503 FINAL_NOTIFICATION_SKIPPED`; upload → 200 with `email.status:"skipped"` (503 only in production) (`finals/route.ts:236`).

## Gotchas
- Worktree `next dev` needs `--webpack`: Turbopack rejects the symlinked `node_modules` (root is `apps/web`).
- Shared scratchpad directories collide between parallel agents; keep stack scripts in a per-story subfolder.


## Parent review (2026-11-19)
Cherry-picked to main. `npm run check` OK (10 specs, 61 tests). The Next-vs-doc corrections were copied into `brownfield/api-admin.md`.
**Follow-ups (assigned to 0.8a):** move the DB run-lock from `_admin-helpers.ts` into `fixtures.ts`, so every API suite serialises on the shared DB. **Assigned to 0.8d:** add scenarios with a draft concept, FINAL_FILES_READY without an approved concept, and a stale hold, then turn the 4 fixme cases into real tests.
