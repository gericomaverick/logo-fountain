# Brownfield: client-facing project API (as built)

Phase 0 capture, 2026-11-18. Covers **C-02, C-05…C-16, K-14, N-04…N-12 (triggers), N-15**. Paths are relative to `apps/web/src/app/api/`.

## Conventions shared by every route here

- **Error shape:** `jsonError(message, status, details?, code?)` → `{error:{message, code?, details?}}`. `details.nextStep` is a human hint. The contract tests assert on `status` plus `error.code`; the message text is asserted only where noted.
- **Auth helpers** (`lib/auth/require.ts`):
  - `requireUser`: `401 UNAUTHORIZED` "Unauthorized", nextStep "Sign in and retry.".
  - `requireAdmin`: `403 FORBIDDEN` "Forbidden", nextStep "Use an admin account.".
  - `requireProjectMembership(userId, projectId)`: project where the client has a membership for the user, otherwise **`404 PROJECT_NOT_FOUND`** "Project not found" (404, not 403, so existence doesn't leak).
  - Any non-`RouteAuthError` exception is rethrown, so the framework returns a 500.
- **"Admin or member" routes** first try `requireAdmin`. If that's a 403, they fall back to the membership check. Admins can therefore read any project.
- **Mutations** call `rejectUntrustedMutationOrigin` **first** (see `auth-and-security.md` §5), then auth, then the body.
- **JSON bodies** go through `req.json().catch(() => null)`. Bad JSON behaves like an empty body (each route's own validation code), except where `INVALID_JSON` is listed.
- Text limits are counted in JS string length (UTF-16 code units) **after `trim()`**. In Laravel use `mb_strlen` after trimming, and note the UTF-16 vs code-point difference for astral characters (a test-port note; both behave the same for BMP text).

## Endpoints

| Method and path | Who | Behaviour |
|---|---|---|
| `GET /projects` | user | All projects of every client the user belongs to: `{projects:[{id,status,packageCode}]}`, newest first per client |
| `GET /projects/{id}` | admin or member | `{snapshot}` from `lib/project-snapshot.ts#getProjectSnapshot`. `404 PROJECT_NOT_FOUND` if null. (The snapshot shape is documented in `business-rules.md`) |
| `GET /projects/{id}/entitlements` | member | `{entitlements:{concepts:n, revisions:n}}` where n = `max(limit − consumed − reserved, 0)` (null limit counts as 0) |
| `GET /projects/{id}/brief` | admin or member | Latest by version `{brief:{id,version,answers,createdAt,createdBy}}`, or `{brief:null}` |
| `POST /projects/{id}/brief` | **member** (not admin) | Validate with `lib/brief.ts#validateBriefSubmission`. Failure → `400 INVALID_BRIEF_PAYLOAD`, nextStep "Fill all required brief fields (…missing)". The project must be `AWAITING_BRIEF`, otherwise `400 BRIEF_LOCKED`. Transition check → `400 INVALID_PROJECT_STATUS_TRANSITION` with `details.allowed`. One transaction: if any brief exists → BRIEF_LOCKED. Create `ProjectBrief` **version 1**, status → `BRIEF_SUBMITTED`, **delete the draft**, system message "Brief received. Your designer will review and reply soon.", audits `brief_submitted {briefId, version:1, isResubmission:false}` and `state_changed`. A unique violation retries once, then `409 BRIEF_CONFLICT`. → `{ok, briefId, version}`. **No email is sent** |
| `GET /projects/{id}/brief/draft` | **member only** (admins deliberately excluded) | `{draft:null}`, or `{draft:{answers (normalised by normalizeBriefAnswers: unknown keys dropped, missing ones empty), updatedAt}}` |
| `PUT /projects/{id}/brief/draft` `{answers}` | member | Normalise, and if invalid → `400 INVALID_BRIEF_DRAFT_PAYLOAD`. The status must be `AWAITING_BRIEF`, otherwise `400 BRIEF_LOCKED`. Upsert `{answers, updatedBy}` → `{ok, updatedAt}` |
| `DELETE /projects/{id}/brief/draft` | member | Idempotent delete → `{ok:true}` |
| `GET /projects/{id}/concepts` | admin or member | Concepts with status `published`/`approved`, ordered by `number`. For each: the newest `FileAsset(kind=concept)` whose path starts with `{projectId}/{conceptId}.` (legacy) or `{projectId}/{conceptId}/v`. A **signed URL** for the newest file, `revisionVersion` = max `vN` (minimum 1). → `{concepts:[{id,number,status,notes,createdAt,updatedAt,revisionVersion,imageUrl}], projectStatus}`. An unknown project → `{concepts:[], projectStatus:null}` |
| `GET /projects/{id}/concepts/{cid}/assets` | admin or member | Every concept file version: `{assets:[{path,version,createdAt,url(signed),notes}]}`, sorted by version desc then createdAt desc. ⚠️ No published-status check (finding F-7) |
| `GET /projects/{id}/concepts/{cid}/comments` | admin or member | The concept must be in the project, otherwise `404 CONCEPT_NOT_FOUND`. `{comments:[{id,body,createdAt,author:{id,email,fullName,isAdmin}}]}` ascending |
| `POST /projects/{id}/concepts/{cid}/comments` `{body}` | admin or member | 1–**2000** chars, otherwise `400 INVALID_COMMENT_BODY`. Upserts the author's `Profile` (sets `isAdmin` to the computed admin flag). → `201 {ok, comment}`. **No email, no audit, no system message** |
| `POST /projects/{id}/revision-requests` `{body, conceptId}` | **member** | Body 1–**5000** chars plus conceptId, otherwise `400 INVALID_BODY`. If the status isn't already `REVISIONS_IN_PROGRESS`, the transition must be allowed, otherwise `400 INVALID_PROJECT_STATUS_TRANSITION`. Concept in project, otherwise **`400` CONCEPT_NOT_FOUND**. Transaction: **atomic reserve** `UPDATE … SET reservedInt+1 WHERE key='revisions' AND limitInt IS NOT NULL AND consumed+reserved < limit` (none → `400 NO_REVISIONS_REMAINING`, nextStep "Buy a revision add-on to continue."). Create `RevisionRequest {status:"requested"}`, status → `REVISIONS_IN_PROGRESS`, audits `revision_requested {revisionRequestId, conceptId}` (+ `state_changed`), system message "Revision request received ({first 8 of id})." After commit: email `notifyAdminFeedbackOnConcept` (N-12). → `201 {ok, revisionRequest, project:{id,status}}` |
| `POST /projects/{id}/approve` `{conceptId}` | **member** | `400 INVALID_CONCEPT_ID`. The concept must be **published**, otherwise `404 CONCEPT_NOT_FOUND`. Transition to `AWAITING_APPROVAL`, otherwise `400 INVALID_PROJECT_STATUS_TRANSITION`. Transaction: every **other** published or approved concept → `archived`, this one → `approved`, project → `AWAITING_APPROVAL`, audits `concept_approved {conceptId, conceptNumber}` and `state_changed`. After commit: emails N-07 (client) and N-08 (admin) in parallel. → `{ok, concept, project}` |
| `POST /projects/{id}/finals` | member (checked in the query) | **Serializable** transaction (maxWait 2 s, timeout 5 s). The project must be `FINAL_FILES_READY` or `DELIVERED`, have an `approved` concept, a `final_zip` asset, and a membership. Pick the newest `final_zip` (createdAt desc, id desc). A **guarded `updateMany`** re-checks all of that plus the exact asset id and path, and sets the status → `DELIVERED` (writing the same value takes a row lock). If the count isn't 1 → `409 FINAL_DOWNLOAD_CONFLICT`. On FINAL_FILES_READY → DELIVERED, audit `state_changed {…, reason:"client_final_zip_download"}`. **The first client download is what marks the project delivered.** Filename from `buildFinalDeliverableFilename(owner name or email, company, createdAt)`. Signed URL valid **3600 s**, created inside the transaction. → `{url}`. Not eligible → `404 FINAL_ZIP_NOT_AVAILABLE`. Serialization failures (P2034/P2028) → 409 |
| `GET /projects/{id}/messages` | admin or member | **All** messages including `kind=system`, ascending: `{messages:[{id,kind,body,createdAt,sender:{id,email,isAdmin,fullName,firstName,lastName}}]}` |
| `POST /projects/{id}/messages` `{body}` | admin or member | 1–**2000** chars, otherwise `400 INVALID_MESSAGE_BODY`. Upserts the Profile as with comments. Transaction: upsert `MessageThread` (**threads are created lazily here**), create `Message` (kind defaults to `user`), audit `message_sent {messageId, isAdmin}`. After commit: admin sender → N-06 to the client, otherwise N-11 to the admin. → `201 {ok, message}` |
| `POST /projects/{id}/read-state` `{area}` | admin or member | `area` must be `messages` or `concepts`, otherwise `400 INVALID_AREA`. The stamp is a **DB timestamp**, not the server clock: messages → max createdAt of **non-system** messages; concepts → `computeLatestConceptActivityAt(max published/approved concept createdAt and updatedAt, max comment createdAt)`. Falls back to now. Upsert `ProjectReadState(userId, projectId)` → `{ok:true}` |
| `GET /invoices`, `GET /projects/{id}/invoices` | user / member | See `checkout-and-payments.md` §8 |
| `POST /projects/{id}/checkout/session` | member | See `checkout-and-payments.md` §5 |
| `GET/PUT /profile` | user | GET → `{profile:{id,email,firstName,lastName,fullName}}`. PUT `{firstName?, lastName?}`: each is a string, null or absent (other types → `400 INVALID_FIRST_NAME`/`INVALID_LAST_NAME`). Trimmed, max **80**, empty becomes null. `fullName` is recomputed from first and last. Upsert. Bad JSON → `400 INVALID_JSON`. **There's no VAT field** (finding F-3) |

## Findings

| # | Finding | Recommendation |
|---|---|---|
| F-7 | Clients can list asset URLs for, comment on, and request revisions against concepts that **aren't published** (drafts the admin uploaded but hasn't released). They'd need the concept UUID, which isn't exposed to clients, so the exposure is low | Laravel: limit the client paths to `published`/`approved` concepts (a security deviation; log a decision). Admins are unchanged |
| F-8 | Lifecycle emails after commit are best-effort (sent inline after the transaction). Check `project-lifecycle-email.ts` for whether failures are swallowed | Laravel: queued mailables dispatched `afterCommit`, with retries. Document it as an improvement with the same visible behaviour |

## Corrections verified by the contract suite (story 0.7b, 2026-11-19)

These are pinned by `tests/parity/journeys/contract/client-*.spec.ts` and the snapshot schema `tests/parity/fixtures/contracts/snapshot.schema.json`. Paths are under `apps/web/src/`.
1. **BUG, F-17:** an admin posting a concept comment or a project message gets a **500**. `…/concepts/[conceptId]/comments/route.ts:76` and `…/messages/route.ts:70` upsert the admin's Profile with `isAdmin:true`, which the DB trigger `protect_operator_admin_flag` refuses for the runtime role (`prisma/migrations/20260901000000_portable_core/migration.sql:527,537`). The admin messages page uses this route (`app/admin/projects/[id]/messages/page.tsx:107`), so **admin replies don't work**. Laravel fixes this (DV-14).
2. Brief POST, revision-requests and approve validate the body **before** membership, so a non-member with a bad body gets 400, not 404 (`…/brief/route.ts:60`, `…/revision-requests/route.ts:33`, `…/approve/route.ts:41`).
3. `POST …/finals` returns `404 FINAL_ZIP_NOT_AVAILABLE` for non-members, admins and unknown projects, never `PROJECT_NOT_FOUND` (`…/finals/route.ts:34`).
4. A missing concept on a revision request is **400** `CONCEPT_NOT_FOUND` (`…/revision-requests/route.ts:62`). Comments and approve return 404. DV-7 wording to be checked in 0.7d.
5. The snapshot **omits** `readState.*`, `latestMessageAt`, `latestConceptAt` and `timeline[].timestamp` rather than sending null (`lib/project-snapshot.ts:28`).
6. With an approved concept, the current timeline step is the derived `APPROVED` step.
7. Profile names are **truncated** to 80 characters, not rejected (`app/api/profile/route.ts:19`).
8. `GET /api/projects` is membership-only, so an admin gets `[]`.
9. Assets for an unknown concept return `200 []` (see F-7).
