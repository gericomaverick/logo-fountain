# Brownfield: admin API (as built)

Phase 0 capture, 2026-11-18. Covers **D-01…D-20, K-12, X-07, X-08, X-09, X-13**. Every route below needs `requireUser` + `requireAdmin` (401 or 403). Mutations are Origin-guarded first. Paths are relative to `apps/web/src/app/api/admin/`.

**Optimistic project-version guard.** Almost every lifecycle mutation reads `project.status` and `project.updatedAt`, then does `updateMany WHERE id AND status AND updatedAt` and treats any count other than 1 as a conflict. `updatedAt` therefore acts as the project's **version column**. In Laravel, keep this pattern exactly (a conditional `update()` with both columns, then check the affected-row count). Eloquent's automatic `updated_at` must not silently move the version in other code paths. Decide in architecture: an explicit `version` integer column (preferred), or keep `updated_at` with care.

**Serializable transactions** (`isolationLevel: "Serializable"`, maxWait 2 s, timeout 5 s) are used by: concept upload, publish, delete, revision delivered, status, finals upload, finals notify, finals download, reset, and the client final download. Serialization failures (`P2034`, `P2028`) → `409 LIFECYCLE_CONFLICT` or a route-specific conflict code. Laravel: `DB::transaction` with `SET TRANSACTION ISOLATION LEVEL SERIALIZABLE`, and map SQLSTATE `40001`/`40P01` to the same 409s.

## Projects and dashboard

| Endpoint | Behaviour |
|---|---|
| `GET projects?status=` | Every project (optional exact status filter), newest first: `{projects:[{id,status,packageCode,clientName,latestOrder:{id,status,stripeCheckoutSessionId,createdAt}\|null, stuck, stuckReason}]}`. `stuckReason`: "Missing order record (webhook likely never fulfilled).", "Order needs contact (no purchaser email provisioned).", or "Order status is X." |
| `GET projects/{id}` | `{snapshot}` (the same `getProjectSnapshot` as the client route, with the admin's userId) or `404 PROJECT_NOT_FOUND` |
| `GET projects/{id}/audit` | The latest **100** events (createdAt desc, id desc): `{events:[{id,type,payload,createdAt,actor:{email,fullName}}]}`. Payloads are returned raw |
| `GET projects/{id}/revision-requests` | Every request, newest first, `{revisionRequests:[{id,status,body,createdAt,updatedAt,concept:{id,number},user:{id,email,fullName}}]}` |
| `GET projects/{id}/invoices` | See `checkout-and-payments.md` §8 |

## Status changes `POST projects/{id}/status` `{status, reason}`

- Only `ON_HOLD`, `CANCELLED` and `RESUME` are accepted. Anything else → `400 DOMAIN_ACTION_REQUIRED` ("Lifecycle status must be changed by its domain action"). **Admins can't set REFUNDED or any lifecycle state directly.** Each lifecycle state has its own action.
- Missing status → `400 MISSING_STATUS`. Reason required, 1–500 chars → `400 REASON_REQUIRED`.
- **RESUME:** the project must be `ON_HOLD`. Read the latest `state_changed` audit. It must have `nextStatus = ON_HOLD`, a `heldVersion` (if present) equal to the current `updatedAt`, and a `previousStatus` that may transition to ON_HOLD. Then **revalidate the domain evidence** for the state being restored: every post-brief state needs a brief; CONCEPTS_READY needs a visible concept; REVISIONS_IN_PROGRESS needs a pending revision; AWAITING_APPROVAL and later need an approved concept; FINAL_FILES_READY and DELIVERED need a `final_zip`. Any failure → `409 INVALID_HOLD_RESUME`.
- Transition through the state machine, then a version-guarded update (a new `updatedAt`). Conflict → `409 STATUS_CHANGE_CONFLICT`. Audit `state_changed {previousStatus, nextStatus, reason, source: "hold_resume"|"constrained_admin_exception", heldVersion (when going to ON_HOLD)}`. → `{ok, project:{id,status}}`.

## Concepts

### `GET projects/{id}/concepts`
Every concept (all statuses, by number then createdAt), each with its latest file signed URL, `revisionVersion`, and `pendingRevisionCount` = `unresolvedFeedbackCount` (= non-delivered revision requests for that concept). Plus `projectStatus`, `conceptlessPendingRevisionCount`, and `pendingRevisionRequests[]` (oldest first, `{id,conceptId,body,createdAt,concept:{id,number},user:{email,fullName}}`).

### `POST projects/{id}/concepts` (multipart): upload, replace, or revision
Fields: `file`, `requestKey` (**UUID v4**, required, otherwise `400 REQUEST_KEY_REQUIRED`), `uploadMode` = `concept` (default) | `replace` | `revision`, `conceptNumber` (replace), `conceptId` (revision), `notes` (concept notes), `assetNotes` (file notes).
1. No file or empty → `400 FILE_REQUIRED`. `prepareConceptImage` (see `storage-and-uploads.md`) → `400 {code}` on validation failure.
2. **Idempotency receipt:** digest = sha256(JSON `[projectId, mode, conceptId, conceptNumber, notes, assetNotes, contentType]` + bytes). Look up the newest `AuditEvent(type=concept_upload_request, payload.requestKey=key)`. A different digest → `409 REQUEST_KEY_MISMATCH`. Same digest → return the stored result with `replayed:true`.
3. Project must exist (404). Allowed statuses: revision → `REVISIONS_IN_PROGRESS`/`CONCEPTS_READY`; otherwise → `BRIEF_SUBMITTED`/`IN_DESIGN`/`CONCEPTS_READY`. Wrong status → `409 INVALID_PROJECT_STATUS_TRANSITION`.
4. Mode checks: **revision** needs a `conceptId` (400 `CONCEPT_ID_REQUIRED`), the concept must exist (404) and be `published` (409 `CONCEPT_NOT_REVISIONABLE`). **Replace** needs `conceptNumber` (400 `INVALID_CONCEPT_NUMBER`), the concept must exist (404) and be `draft` or `published` (409 `CONCEPT_NOT_REPLACEABLE`). **Concept**: number = max + 1, new UUID.
5. Pre-checks: concept, or replace-of-draft → the `concepts` entitlement must exist and have room (`400 CONCEPTS_ENTITLEMENT_MISSING` / `CONCEPT_ENTITLEMENT_EXHAUSTED`). Revision → pending requests > 0, a revisions entitlement, reserved ≥ pending, consumed + pending ≤ limit (the 400s listed in the route).
6. **Upload first.** Path `{projectId}/{conceptId}/v{maxVersion+1}.{uuid}.{ext}`, conditional put (never overwrite).
7. Serializable transaction: advisory lock `hashtextextended(projectId + ":" + requestKey, 0)`, then re-check the receipt (return it if found), then the version guard (`CONCEPT_PUBLICATION_CONFLICT`), then re-check the status. Then:
   - concept: `consumeConceptEntitlement` (atomic conditional `consumedInt+1`, null limit = unlimited), create the concept **`published`** straight away;
   - replace: from draft → consume and publish; from published → update notes; a guarded conditional update;
   - revision: mark **all** of that concept's pending requests `delivered`, then `reserved −= n, consumed += n`.
   - Audit `entitlement_consumed {key:"concepts", after, reason:"admin_concept_publish", conceptId, conceptNumber}` when consumed. Create `FileAsset(kind=concept, notes=assetNotes)`. If revision or no other visible concept, move to `CONCEPTS_READY` (+ `state_changed`). Audit `concept_uploaded` or `concept_revision_uploaded {conceptId, conceptNumber, filePath, published:true, uploadMode, deliveredRevisionRequests}`. System message "Concept {n} is ready for review." or "Revision delivered for Concept {n}.". The **receipt** audit `concept_upload_request {requestKey, digest, result, object:{bucket,path}}`.
8. On a transaction error: try to recover the receipt (`recovered:true`). Explicit aborts → delete the new object (if cleanup fails → `500 CONCEPT_UPLOAD_CLEANUP_FAILED` with the object details), then the mapped error. Any other error → `409 CONCEPT_PUBLICATION_UNCONFIRMED` (object kept, retry with the same key).
9. After commit (**not for revisions**): `notifyClientConceptReady`. A failure adds `notificationWarning` "Publication committed; concept-ready notification failed. Do not republish to retry email." and `committed:true`.
→ `{ok, concept, projectStatus}`.
- Client side (`lib/concept-upload-key.ts`): the request key is persisted in `sessionStorage` under an identity built from the form fields and the file sha256, so retries after network loss reuse the key. The key is removed on success.

### `POST projects/{id}/concepts/{cid}/publish`
Serializable. Concept not found → 404. Already `published` → idempotent `{publishedNow:false}`. Not `draft` → `409 CONCEPT_NOT_PUBLISHABLE`. Project must be `BRIEF_SUBMITTED`/`IN_DESIGN`/`CONCEPTS_READY` (400). Consume a concept entitlement, then a conditional draft → published, audits `entitlement_consumed` and `concept_published`, system message "Concept {n} is ready for review.". If it's the first visible concept, move to `CONCEPTS_READY` (+ audit). After commit, if published now → `notifyClientConceptReady`. ⚠️ No UI path creates `draft` concepts any more (upload publishes immediately), so this route mostly exists for legacy or seeded drafts (finding F-10).

### `DELETE projects/{id}/concepts/{cid}`
Serializable. 404 if missing. Already `deleted` → ok (idempotent). Guard: project in `BRIEF_SUBMITTED`/`IN_DESIGN`/`CONCEPTS_READY`, the concept isn't `approved`, and in CONCEPTS_READY you can't delete the last visible concept → `409 CONCEPT_DELETE_PHASE_GUARD`. Version guard → `409 CONCEPT_DELETE_CONFLICT`. Soft delete (`status=deleted`). **Hard-delete** its revision requests and release reservations for the non-delivered ones. **Consumed usage is never rewound.** Audit `concept_deleted {conceptId, conceptNumber, previousStatus, deletedRevisionRequests, deletedRevisionRequestIds}`.

### `POST projects/{id}/revision-requests/{rid}/delivered` `{setConceptsReady?: boolean (default true)}`
Serializable. Missing request or project → `404` (`REVISION_REQUEST_NOT_FOUND`/`PROJECT_NOT_FOUND`). Already delivered → idempotent `{project:null}`. Project must be `REVISIONS_IN_PROGRESS`/`CONCEPTS_READY`. Version guard, then claim the request, then the entitlement checks (`REVISIONS_ENTITLEMENT_MISSING`, `INSUFFICIENT_REVISION_RESERVATION`, `REVISION_LIMIT_EXCEEDED`, all 400), then the conditional `reserved−1, consumed+1`. Audit `revision_delivered {revisionRequestId, consumedEntitlement:true}`, system message "Revision update delivered ({8})." and optionally → `CONCEPTS_READY` (+ audit). After commit: `notifyClientRevisionReady` (errors swallowed). Conflicts → `409 REVISION_DELIVERY_CONFLICT`/`INVALID_PROJECT_STATUS_TRANSITION`.

## Finals

### `POST projects/{id}/finals` (multipart `file`)
- 404 if no project. ⚠️ Inconsistent error shapes here: `400 {error:"ZIP file is required", code:"FILE_REQUIRED"}` (**`error` is a string**), and on validation failure `400 {error: message, code}`. Upload failure → `400 {error:"Failed to upload final ZIP"}`. Finding F-11.
- Repair mode = status `FINAL_FILES_READY`/`DELIVERED`, which requires an approved concept (`400 FINAL_REPAIR_REQUIRES_APPROVAL`). Target status: repair → unchanged; approved concept → `FINAL_FILES_READY`; otherwise → **`AWAITING_APPROVAL`** (an upload before approval moves the project to awaiting approval). Transition check (400).
- `prepareFinalZip`, then upload to `{projectId}/finals/{uuid}.zip` (immutable).
- Serializable transaction: a guarded update (status + updatedAt + approval present/absent), always advancing `updatedAt`, then a new `FileAsset(final_zip)` (the previous one is kept). Audit `finals_uploaded {fileAssetId, path, supersededFileAssetId}` (+ `state_changed`). If it newly became `FINAL_FILES_READY`, system message "Final files are ready to download.".
- On a transaction error the bytes are **always kept**. Look up the asset by bucket and path: found → treat as recovered (`recoveredAfterTransactionError`, `isCurrentPublication`); not found → `409 FINAL_PUBLICATION_CONFLICT` (object kept); lookup failed → `503 FINAL_PUBLICATION_OUTCOME_UNKNOWN`.
- After commit, if `FINAL_FILES_READY` and current: `notifyClientFinalDeliverablesReady`. Throws → `502 FINAL_PUBLISHED_EMAIL_FAILED` with `retry:{method:"POST", path:".../finals/notify"}`. Skipped in production → `503 FINAL_PUBLISHED_EMAIL_SKIPPED`. ⚠️ In repair mode (already FINAL_FILES_READY) the email is sent **again**. In DELIVERED it isn't.
- → `{ok, fileAsset, project, email, retainedPreviousAsset, recoveredAfterTransactionError, currentPublication}`.

### `POST projects/{id}/finals/notify` `{assetId, projectUpdatedAt}`
Both required, otherwise `400 FINAL_NOTIFICATION_VERSION_REQUIRED`. Serializable guard: the status is FINAL_FILES_READY/DELIVERED, `updatedAt` equals the one supplied, there's an approved concept, and the newest final is `assetId`. Otherwise `409 FINAL_NOTIFICATION_CONFLICT`. Then send outside the transaction: skipped → `503 FINAL_NOTIFICATION_SKIPPED`, failed → `502 FINAL_NOTIFICATION_FAILED`, ok → `{ok, committed, finalLive, notification, fileAsset}`.

### `POST projects/{id}/finals/download`
The same as the client download, but admin and without the membership requirement. A **same-status** guarded write (no transition to DELIVERED). Signed URL 3600 s with the same filename rule. `404 FINAL_ZIP_NOT_AVAILABLE` / `409 FINAL_DOWNLOAD_CONFLICT`.

## Entitlements

### `PATCH projects/{id}/entitlements` `{concepts?, revisions?, reason}`
Each limit is an integer 0–1000 or `null` (unlimited), otherwise `400 INVALID_CONCEPTS_LIMIT`/`INVALID_REVISIONS_LIMIT`. At least one is required (`MISSING_LIMITS`). Reason 1–500 (`OVERRIDE_REASON_REQUIRED`/`_TOO_LONG`). Bad JSON → `INVALID_JSON`. Only changed (or missing) rows are upserted. Audit `entitlement_limit_overridden {before, after, changed:{concepts,revisions}, reason}` only if something changed. → `{ok, entitlements, entitlementUsage (computeEntitlementUsage), changed}`. **Limits can be set below current usage.** Nothing stops it.

### `POST projects/{id}/entitlements/reset`
**Disabled:** it always returns `409 ENTITLEMENT_USAGE_RESET_DISABLED` (after the auth checks). Keep it as a stub returning the same response, or drop it with a logged decision. Recommend keeping it for contract parity.

## Clean-slate reset `POST projects/{id}/reset` `{confirm:true, mode:"clean-slate", clearMessages?: boolean (default true)}`
Without exact confirmation → `400 CONFIRM_REQUIRED`. 404 if no project. Serializable: next status = `BRIEF_SUBMITTED` if a brief exists, else `AWAITING_BRIEF` (version-guarded, otherwise `409 PROJECT_RESET_CONFLICT`). **Delete** revision requests, comments, concepts, concept FileAssets, and final FileAssets (metadata only), plus **non-system** messages if `clearMessages`. Set consumed and reserved to 0 for both entitlements (limits kept). Audit `project_reset {mode, clearMessages, previousStatus, nextStatus, deleted:{…counts}, entitlementsReset, entitlementFieldsReset, retainedFinalStorageObjects, retainedConceptStorageObjects, retainedFinalReason:"allow_pre_reset_signed_urls_to_expire_without_reactivating_publication_records"}`. **No storage objects are deleted.** Response echoes the counts, the retained objects and `storageCleanup:{attempted:0,deleted:0,failures:[]}`. Briefs, orders, audit and read state are kept.

## Health `GET health`
Checks: env presence for `BETTER_AUTH_SECRET` (Laravel: `APP_KEY`), `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_CONCEPTS_BUCKET`, `R2_FINAL_DELIVERABLES_BUCKET`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `POSTMARK_SERVER_TOKEN`, `POSTMARK_FROM`, `ADMIN_NOTIFICATION_EMAILS`. A `PUBLIC_SITE_URL` validity check. The Stripe allowlist placeholder check. DB `SELECT 1` (the failure summary includes the DB error message). Stripe `accounts.retrieve` (returns the account ID). R2 `HeadBucket` per namespace. → `{ok, summary:{total,passed,failed}, checks:[{key,label,passed,summary,nextStep,details?}], generatedAt}`. Public `GET /api/health` → `{ok:true}` with no checks.

## Findings

| # | Finding | Recommendation |
|---|---|---|
| F-9 | A revision delivered by **uploading** a revised file (`uploadMode=revision`) sends **no** client email. Only the separate "mark delivered" route sends N-05 | Laravel: send N-05 on revision upload too (deviation, owner OK needed) |
| F-10 | `draft` concepts and the publish route are a legacy path with no current UI entry. Upload publishes immediately | Port them for parity (seeded drafts and contract tests), and mark them in the inventory |
| F-11 | The finals upload uses `{error:"…", code}` (string `error`) in three responses, unlike `{error:{message,code}}` everywhere else | Laravel: normalise to the standard shape **only if** the admin UI is updated in the same story (log a deviation). Otherwise reproduce |
| F-12 | Finals re-upload while `FINAL_FILES_READY` re-sends the "final files ready" email every time | Keep (it's arguably correct for a repair), and document it |
