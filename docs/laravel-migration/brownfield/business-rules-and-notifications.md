# Brownfield: business rules, snapshot, notifications (as built)

Phase 0 capture, 2026-11-18. Covers **X-07, X-08, K-07, K-14, C-03, C-04, C-05, N-04…N-16, D-01**. Paths are relative to `apps/web/src/lib/`.

## 1. Where each `lib` module goes in Laravel

With Inertia + React (D2), modules that only shape UI can stay **TypeScript** in the React layer, with their Vitest tests unchanged. Modules the server relies on are ported to PHP. Modules needed in both places get a PHP version **plus** a contract test that both produce identical output from a shared JSON fixture (`tests/parity/fixtures/rules/*.json`).

| Module | Used by | Laravel destination |
|---|---|---|
| `project-state-machine.ts` (states, transitions, `applyTransition`) | server + UI (labels, CTA, timeline) | **Both:** PHP enum + transition service. TS kept for labels and timeline. Shared fixture of the transition table |
| `project-status.ts` (`deriveDisplayProjectStatus`, `deriveOverviewBadgeStatus`) | snapshot (server) | PHP (snapshot builder) |
| `project-snapshot.ts` | server | PHP `ProjectSnapshot` builder (**the biggest single contract**, §3) |
| `entitlements.ts#computeEntitlementUsage` | server | PHP |
| `concept-entitlement.ts`, `checkout-fulfillment.ts`, `system-messages.ts`, `audit.ts`, `project-lifecycle-email.ts`, `email-branding.ts`, `client-invoices.ts`, `request-origin.ts`, `auth/*` (except `client.ts`, `logout.ts`, `validation.ts`), `storage/*`, `upload-validation.ts`, `zip-validation.ts`, `final-deliverable-*.ts`, `webhook-error-classification.ts`, `stripe*.ts`, `checkout-auth-email*.ts`, `magic-link-email.ts`, `database-target.ts`, `project-display-name.ts` (also used by the UI) | server | PHP |
| `brief.ts` (field definitions, `normalizeBriefAnswers`, `validateBriefSubmission`) | server + UI | **Both.** Field config could be served to the UI as an Inertia prop, but the existing React wizard imports it directly. Keep TS for the UI and the PHP validator, with a shared fixture |
| `brief-choices.ts`, `brief-wizard.ts`, `brief-draft.ts`, `brief-submission-confirmation.ts`, `project-hub.ts`, `project-journey.ts`, `project-overview.ts`, `concept-thread.ts`, `chat-messages.ts`, `admin-dashboard.ts`, `admin-audit.ts`, `admin-final-publication.ts`, `admin-override-inputs.ts`, `concept-upload-key.ts`, `checkout-success.ts`, `final-approval.ts`, `safe-performance-measure.ts`, `auth/client.ts`, `auth/logout.ts`, `auth/validation.ts`, `auth/safe-next.ts` (also server) | UI | **Keep TS** (moved into `apps/portal/resources/js/lib`). `safe-next` also needs PHP |
| `local-dev-fixture-guard.ts`, `local-dev-seed*` | dev scripts | PHP artisan commands (E9) |
| `forgot-password-rate-limit.ts` | nothing | **Don't port** (dead code) |
| `prisma.ts`, `generated/` | infra | Replaced by Eloquent |

## 2. State machine (`project-state-machine.ts`)

- States: `AWAITING_BRIEF, BRIEF_SUBMITTED, IN_DESIGN, CONCEPTS_READY, REVISIONS_IN_PROGRESS, AWAITING_APPROVAL, FINAL_FILES_READY, DELIVERED, ON_HOLD, CANCELLED, REFUNDED`. `APPROVED` is a **display-only** pseudo-state.
- Transitions: AWAITING_BRIEF → {BRIEF_SUBMITTED, ON_HOLD, CANCELLED, REFUNDED}. BRIEF_SUBMITTED → {IN_DESIGN, CONCEPTS_READY, +3}. IN_DESIGN → {CONCEPTS_READY, +3}. CONCEPTS_READY → {REVISIONS_IN_PROGRESS, AWAITING_APPROVAL, FINAL_FILES_READY, +3}. REVISIONS_IN_PROGRESS → {CONCEPTS_READY, +3}. AWAITING_APPROVAL → {FINAL_FILES_READY, +3}. FINAL_FILES_READY → {DELIVERED, +3}. DELIVERED → {ON_HOLD, REFUNDED}. ON_HOLD → {every lifecycle state, CANCELLED, REFUNDED}. CANCELLED → {REFUNDED}. REFUNDED → {}. ("+3" = ON_HOLD, CANCELLED, REFUNDED.)
- `applyTransition` also needs a non-blank `reason` for ON_HOLD (`HOLD_REASON_REQUIRED`) and for CANCELLED/REFUNDED (`REASON_REQUIRED`). Error codes: `INVALID_STATE`, `INVALID_TRANSITION`. On success it returns `{ok, from, to, label, primaryCta}`.
- ⚠️ Nothing currently moves a project to `IN_DESIGN`. No route sets it (the admin status route only allows ON_HOLD/CANCELLED/RESUME). It's reachable only by seed or resume. Finding F-13.
- Labels, `PRIMARY_CTA_BY_STATE`, `NEXT_STAGE_COPY`, the customer-action states (AWAITING_BRIEF, CONCEPTS_READY, FINAL_FILES_READY) and `buildTimeline` (9 steps including APPROVED; terminal states append a current terminal step) are UI copy and must be reproduced exactly. They stay in TS.

## 3. Project snapshot (`project-snapshot.ts`), served by `GET /api/projects/{id}` and `GET /api/admin/projects/{id}`

Output keys (the contract tests must assert the **full key set and types**):
`projectId, status (display status), overviewStatus, statusLabel, primaryCta, timeline[], packageCode, clientContact{fullName,email}|null, createdAt, updatedAt, entitlements{concepts,revisions} (remaining), entitlementUsage{concepts,revisions:{limit,consumed,reserved,remaining,unlimited?,configured?}}, concepts[] (published/approved, number desc, each {id,number,status,notes,createdAt,updatedAt,revisionVersion,imageUrl|null}), latestConcepts (first 5), revisionRequests (latest 10 with concept{id,number} and user{id,email,fullName}), latestRevisionRequests (5), messages[] (ALL, including system, ascending, with sender{id,email,fullName}), latestBrief{version,createdAt,answers}|null, hasBriefDraft, finalZip{available,url:null,assetId}, latestOrder{id,status,stripeCheckoutSessionId,createdAt}|null, stuck, stuckReason, recentAuditEventsCount, readState{lastSeenMessagesAt,lastSeenConceptsAt}, latestMessageAt, latestConceptAt, hasNewMessages, hasNewConcepts`.

Rules:
- `hasNewMessages`: the latest **non-system** message is newer than `lastSeenMessagesAt` (or it was never seen). `hasNewConcepts`: the latest concept activity (max of each visible concept's createdAt/updatedAt and the latest comment) is newer than `lastSeenConceptsAt`.
- **Display status:** DELIVERED or FINAL_FILES_READY are shown only when there's an approved concept **and** a final asset. A persisted APPROVED, FINAL_FILES_READY or DELIVERED without both is shown as AWAITING_APPROVAL. An approved concept while CONCEPTS_READY or REVISIONS_IN_PROGRESS is shown as AWAITING_APPROVAL. **Overview badge:** shows `APPROVED` when the display status is AWAITING_APPROVAL, a concept is approved, and there's no final yet.
- Timeline timestamps: inferred values (AWAITING_BRIEF = createdAt; CONCEPTS_READY = earliest visible concept or first delivered revision; REVISIONS_IN_PROGRESS = latest requested revision; AWAITING_APPROVAL = approved concept updatedAt; FINAL_FILES_READY = final createdAt) are **overridden** by the first `state_changed` audit per state.
- Concept preview signing failures produce `imageUrl:null`, so the page doesn't fail.
- `finalZip.url` is always null. Downloads go through the guarded POST.
- ⚠️ The client snapshot includes the **admin's email** in `messages[].sender` and revision `user` emails. That's acceptable today, but note it for the contract.

## 4. Entitlements

- Keys are only `concepts` and `revisions`. `limitInt` null = unlimited. `computeEntitlementUsage` clamps to ≥0, remaining = max(limit − consumed − reserved, 0), with `configured:false` and package defaults when neither row exists (essential 1/1, professional 2/2, complete 3/3).
- **Concept slot:** consumed atomically when a concept is created published or a draft is published. Unlimited if null.
- **Revision slot:** reserved on the client's request (atomic conditional update). Converted reserved → consumed on delivery (the mark-delivered route: 1; revision upload: all pending for that concept). Released when a concept is deleted (pending only). Reset only by a clean-slate reset.

## 5. System messages (`system-messages.ts`)

- Stored as `Message(kind="system")` in the project thread (created lazily). **The sender is the first `Profile` with `isAdmin=true`**, falling back to the acting user.
- **Deduplicated by exact body within the thread:** if a system message with the same body already exists, nothing is written. So the second "Concept 1 is ready for review." (for example after a reset) is silently skipped. Reproduce this exactly. The deduplication key is the body text.
- Bodies: "Brief received. Your designer will review and reply soon." · "Revision request received ({8})." · "Concept {n} is ready for review." · "Revision delivered for Concept {n}." · "Revision update delivered ({8})." · "Final files are ready to download.".

## 6. Lifecycle emails (`project-lifecycle-email.ts`)

- Postmark HTTP API, `MessageStream: "outbound"`, text and branded HTML. Not configured → `{status:"skipped", reason:"not_configured"}` (logs a warning). No recipient → `skipped/missing_recipient`. Non-2xx → throw (status only).
- **Exactly-once-ish marker:** before sending, look for an `AuditEvent(projectId, type = dedupeType)`. If it exists → `already_sent`. Write the marker **after** a successful send (actor null, payload `{}`). A crash between the send and the marker can mean a duplicate send.
- Client recipient: `client.billingEmail`, otherwise the owner membership's email. Admin recipients: `ADMIN_NOTIFICATION_EMAILS` (comma list, lowercased) as **one email with all of them in To:**. Admin bodies add "Client: {name}\nBrand: {brief brandName or client.name or "Unknown brand"}".
- CTA URL = `PUBLIC_SITE_URL` origin + path. It must be absolute HTTPS (loopback HTTP is allowed outside production), otherwise `TypeError`.

| ID | Function | dedupeType | Subject | CTA label → path |
|---|---|---|---|---|
| N-04 | notifyClientConceptReady | `email_sent:client_concept_ready:{conceptId}` | Your concept is ready for review | Review concept → `/project/{id}/concepts` |
| N-05 | notifyClientRevisionReady | `email_sent:client_revision_ready:{revisionRequestId}` | Your revised concept is ready | Review revision → `/project/{id}/concepts` |
| N-06 | notifyClientNewMessage | `email_sent:client_new_message:{messageId}` | New message from your Logo Fountain designer | Open messages → `/project/{id}/messages` |
| N-07 | notifyClientConceptApproved | `email_sent:client_concept_approved:{conceptId}` | Concept approved - final files in progress | View project timeline → `/project/{id}` |
| N-08 | notifyAdminConceptApproved | `email_sent:admin_concept_approved:{conceptId}` | Client approved a concept | Open project → `/admin/projects/{id}` |
| N-09 | notifyClientFinalDeliverablesReady | `email_sent:client_final_deliverables_ready:{assetId}` | Your final logo files are ready | Download final files → `/project/{id}` |
| N-10 | notifyAdminNewProject | `email_sent:admin_new_project` | New project created | Open project → `/admin/projects/{id}` |
| N-11 | notifyAdminMessageFromProject | `email_sent:admin_message_from_project:{messageId}` | New client message | Open project messages → `/admin/projects/{id}/messages` |
| N-12 | notifyAdminFeedbackOnConcept | `email_sent:admin_feedback_on_concept:{revisionRequestId}` | New concept feedback submitted | Open concept workflow → `/admin/projects/{id}/concepts` |

The intro and footer copy is in the source and must be copied verbatim. Client footer: "This is a transactional project update from Logo Fountain.". Admin footer: "Admin notification for transactional workflow updates.".
- Checkout auth emails use their own marker `email_sent:checkout_auth:{sessionId}` (see `checkout-and-payments.md`).
- **N-13 resolved:** the brief submission confirmation is **UI only** (a confirmation dialog: "Ready to send this to your designer?", a checkbox, "Yes, send my brief" / "Go back and review"). **No email is sent on brief submission**, to the client or the admin.
- **Branding** (`email-branding.ts`): logo = `EMAIL_LOGO_URL` (HTTPS), otherwise `{PUBLIC_SITE_URL}/img/logo.svg` unless the origin is loopback, otherwise an embedded SVG data URI. Inline-styled HTML with colours `#f8f7ff`, `#5b38f0` CTA and so on (the old purple; it doesn't match the new teal portal, which is cosmetic and out of scope). Every interpolated value is HTML-escaped.
- Laravel: one `Mailable` per row, all extending a branded base view that reproduces this HTML. A `LifecycleMailer` service keeps the audit-marker dedupe and is dispatched as a queued job **after commit** (improves F-8). The visible behaviour stays the same.

## 7. Brief (`brief.ts`, `brief-choices.ts`)

- 16 string fields in 4 sections (brand-core, audience-goals, creative-direction, practical-context), with max lengths (brandName 120, tagline 140, industry 120, offerSummary 700, audiencePrimary 500, audienceSecondary 400, businessGoals 500, brandPersonality 400, styleDirection 700, colorPreferences 400, mustInclude 450, avoidanceNotes 450, usageContexts 500, deliverablesContext 400, competitors 500, additionalNotes 500).
- **Required on submit:** brandName, industry, offerSummary, audiencePrimary, businessGoals, brandPersonality, styleDirection, usageContexts. The wizard gates each step on that section's required fields.
- `normalizeBriefAnswers`: non-object → null. Each field is trimmed and **truncated** to its max (silently, not rejected). Unknown keys are dropped. Legacy v1 keys `description` → offerSummary and `styleNotes` → styleDirection.
- Choice answers are stored as one string: `"Opt1, Opt2 — free note"` (separator ` — `, join `, `). Parsing is case-insensitive against the offered options; any unrecognised part means the whole value is treated as a free note.
- All labels, placeholders, examples and option hints are UI copy (TS). Keep `brief.ts` as the single source for the UI, and generate or mirror the PHP validator constants from it (a shared fixture test).

## 8. Admin dashboard grouping (`admin-dashboard.ts`)

Sections: needs-action = BRIEF_SUBMITTED, CONCEPTS_READY, ON_HOLD; delivered = DELIVERED, CANCELLED, REFUNDED; in-progress = everything else. A project with pending feedback or new messages is forced into **needs-action** with a badge. (Sorting inside sections is done in the page; see `ui-pages.md`.)

## 9. Database roles (`database-target.ts`)

Runtime `DATABASE_URL` and migration `DIRECT_URL` must point at the **same host, port and database** with **different users**, `schema` limited to `public`, no routing-override params, and no `supabase` host. Grants are in `apps/web/ops/postgres/runtime-grants.sql`. Laravel: a `pgsql` connection (runtime role) plus `pgsql_migrate` (migration role), with migrations run via `php artisan migrate --database=pgsql_migrate`. Port the validation as a boot-time check in production.

## Findings

| # | Finding | Recommendation |
|---|---|---|
| F-13 | `IN_DESIGN` can't be reached through any route. The admin has no "start design" action | Keep parity (no route). Ask the owner whether an admin "Mark in design" action is wanted later |
| F-14 | System-message dedupe by body suppresses legitimate repeats (e.g. after a clean-slate reset, "Concept 1 is ready for review." never appears again) | Reproduce now. Raise it as a post-launch fix |
