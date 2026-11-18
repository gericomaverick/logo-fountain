# Feature inventory and parity ledger

Every behaviour the Laravel app must reproduce. **This is the functional requirements list for the PRD and the checklist for cutover.**
Paths are relative to `apps/web/src/` unless shown otherwise. Inventory first drafted 2026-11-18 from the code. Phase 0 (`document-project` and the manual sweep) must complete it: add rows, never delete them (mark them `Dropped` with a decision reference instead).

**Status values:** `Not started` → `In progress` → `Converted` (code exists, tests not yet passing) → `Verified` (parity tags pass against both apps) | `Dropped (DECISIONS.md YYYY-MM-DD)`.
**Tag** = the parity-suite tag (`02-test-strategy.md` §3) that proves the row. The story fills in the **Laravel** column with file references.

Actors: **P** public / anonymous · **C** client (project member) · **A** admin · **S** system (webhook, CLI, job).

---

## A: Authentication and identity

| ID | Actor | Feature and behaviour to preserve | Next.js source | Tag | Laravel | Status |
|---|---|---|---|---|---|---|
| A-01 | P | Email and password login. A failed attempt and a rate-limited attempt return the **same** response. The per-email bucket counts failures only and is cleared on success, keyed on email plus trusted IP | `app/login`, `api/auth/login`, `lib/auth/rate-limit.ts` | `@auth` | | Not started |
| A-02 | C/A | Logout: the POST succeeds, then a fresh session check confirms the session is gone before navigating. On failure the signed-in UI stays with a retryable error | `api/auth/logout`, `lib/auth/logout.ts` | `@auth` | | Not started |
| A-03 | C/A | Session endpoint: DB-backed lookup. `authenticated:false` only when the lookup completes and finds nothing. A DB failure gives sanitized `503 SESSION_VERIFICATION_UNAVAILABLE`. Not cacheable | `api/auth/session`, `lib/auth/current-user.ts` | `@auth` | | Not started |
| A-04 | C/A | 7-day **absolute** session cap. No sliding refresh, no cookie-cache authority. Authorization reads current DB state | `lib/auth/server.ts` (`SESSION_SECONDS`) | `@auth` | | Not started |
| A-05 | P | Magic-link sign-in request plus verify (`/auth/callback`). One hour, hashed, single use. Existing provisioned accounts only. Never grants recovery authority | `api/auth/magic-link`, `api/auth/magic-link/verify`, `app/auth/callback` | `@auth` | | Not started |
| A-06 | C | Set password on first access (`/set-password`), setup link flow. Setup degrades to sign-in once a password exists and never resets an existing password | `app/set-password`, `lib/checkout-fulfillment.ts#ensureAccessProvisioning` | `@auth @checkout` | | Not started |
| A-07 | P | Forgot password: Origin-guarded, uniform anti-enumeration response, rate limited | `app/forgot-password`, `api/auth/forgot-password`, `lib/forgot-password-rate-limit.ts` | `@auth` | | Not started |
| A-08 | P | Reset password: native token proof only. Revokes **all** sessions and older outstanding reset tokens in the same fenced transition. Marks the email verified after token consumption | `app/reset-password`, `api/auth/reset-password` | `@auth` | | Not started |
| A-09 | C/A | Change password (settings): verifies the current password, revokes other sessions, rotates the current one. A public caller can't turn revocation off | `api/auth/password` | `@auth @settings` | | Not started |
| A-10 | S | Per-user credential fencing: serialises reset/reset and reset/change races, revalidates proof after taking the fence, uses `AuthProof` and `credentialVersion` | `lib/auth/fence.ts`, `lib/auth/server.ts` | `@auth @pg-race` | | Not started |
| A-11 | S | Auth emails are queued inside the transaction and sent **after commit**. On send failure the proof is deleted (dead link) and a fixed message is returned with no link leaked. An account that queues no link is an explicit error | `lib/auth/server.ts`, `lib/auth/mail.ts` | `@auth @email` | | Not started |
| A-12 | S | One-time admin bootstrap CLI: verified mailbox only, single winner, locks after first use, no HTTP route, no automatic first-user admin, no `ADMIN_EMAILS` escalation | `scripts/bootstrap-admin.mjs`, `AuthAdminBootstrap` | `@cli` | | Not started |
| A-13 | P | Safe `next` redirect: app-relative only, rejects encoded external-navigation shapes, keeps query and fragment | `lib/auth/safe-next.ts` | `@auth @security` | | Not started |
| A-14 | S | No extra auth endpoints exposed. Next allowlists Better Auth's catch-all; Laravel must not register starter-kit routes | `lib/auth/proxy-config.mjs` | `@security` | | Not started |
| A-15 | P | `/` redirects to `/login` | `app/page.tsx` | `@smoke` | | Not started |
| A-16 | C/A | Route guards: pages and APIs require a session. Admin areas require `isAdmin`. SSR guards and API checks are both enforced | `lib/auth/require.ts`, `app/admin/layout.tsx` | `@authz` | | Not started |

## K: Checkout, payments, entitlements

| ID | Actor | Feature and behaviour to preserve | Next.js source | Tag | Laravel | Status |
|---|---|---|---|---|---|---|
| K-01 | P | `GET /checkout/start?package_code=essential\|professional\|complete[&campaign_slug=]` creates a Checkout Session from the server allowlist only (raw price IDs rejected). Success URL `/checkout/success?session_id=…`, cancel URL marketing origin `/#packages` | `app/checkout/start/route.ts`, `lib/stripe-price-allowlist.ts` | `@checkout` | | Not started |
| K-02 | P | Checkout success page polls `GET /api/checkout/status`, which returns minimal coarse data | `app/checkout/success`, `api/checkout/status`, `lib/checkout-success.ts` | `@checkout` | | Not started |
| K-03 | P | Checkout continue page and `POST /api/checkout/magic-link`: possession of the session ID → **emails** the link, never returns it. Normal sign-in for existing accounts | `app/checkout/continue`, `api/checkout/magic-link` | `@checkout @security` | | Not started |
| K-04 | P | `POST /api/checkout/resend-magic-link`, bounded per-session and per-destination limits | `api/checkout/resend-magic-link`, `lib/checkout-auth-email-rate-limit.ts` | `@checkout` | | Not started |
| K-05 | S | Stripe webhook: raw-body signature check, `StripeEvent` idempotency ledger. A transient failure stays retryable (it's never stuck "in flight"). Handles `checkout.session.completed`, `async_payment_succeeded`, `async_payment_failed`. Fulfils only when `payment_status=paid` | `api/stripe/webhook`, `lib/webhook-error-classification.ts`, `docs/webhook-delivery-semantics.md` | `@webhook @pg-race` | | Not started |
| K-06 | S | Fulfilment: Client, Project (`AWAITING_BRIEF`), Order (`FULFILLED`/`NEEDS_CONTACT`), entitlements per package, message thread, user, profile and membership provisioned by normalized email (concurrent retries converge). The required emails are sent after durable fulfilment and can be retried | `lib/checkout-fulfillment.ts` | `@webhook @checkout` | | Not started |
| K-07 | S | Package entitlements: Essential 1 direction / 1 revision, Professional 2/2, Complete 3/3 (verify the current values in code during Phase 0) | `lib/entitlements.ts` | `@entitlements` | | Not started |
| K-08 | C | Upsell checkout `POST /api/projects/[id]/checkout/session`: extra revision £95, Essential→Professional £495, Professional→Complete £750. The display price lives beside the price ID | `api/projects/[id]/checkout/session`, `lib/stripe-price-allowlist.ts`, `components/revision-purchase.tsx` | `@upsell` | | Not started |
| K-09 | S | Upsell fulfilment: **additive-from-current** deltas, consumed counts kept, order `campaignSlug` set to `addon:…`/`upgrade:a->b`, audit `entitlement_addon_applied`/`package_upgrade_applied` | `lib/checkout-fulfillment.ts` | `@upsell @webhook` | | Not started |
| K-10 | C | Post-purchase return to `/project/[id]?upsell…&session_id`, a confirmation banner that polls until fulfilled, double-click guard, survives refresh, shows the delayed-webhook pending state | `app/project/[id]`, `lib/project-hub.ts` | `@upsell` | | Not started |
| K-11 | C/A | Invoices and receipts pulled from Stripe (invoice PDF, hosted invoice or receipt URL; settled only). VAT number shown when present, at £0 VAT | `api/invoices`, `api/projects/[id]/invoices`, `api/admin/projects/[id]/invoices`, `lib/client-invoices.ts`, `docs/invoice-email-behavior.md` | `@invoices` | | Not started |
| K-12 | A | Admin reprocess of a stuck purchase `POST /api/admin/checkout/reprocess` | `api/admin/checkout/reprocess` | `@admin @webhook` | | Not started |
| K-13 | S | Promotion codes handled by Stripe (e.g. `PRO40FIRST5`). Phase 0: confirm how the session enables them | `app/checkout/start/route.ts` | `@checkout` | | TBC |
| K-14 | S | Revision accounting: **reserve on request, consume on delivery**. The UI shows pending vs delivered | `lib/entitlements.ts`, `lib/concept-entitlement.ts` | `@revisions` | | Not started |

## C: Client portal

| ID | Actor | Feature and behaviour to preserve | Next.js source | Tag | Laravel | Status |
|---|---|---|---|---|---|---|
| C-01 | C | Dashboard `/dashboard`: welcome with first name, project cards, "New concepts" and "New message" badges | `app/dashboard`, `components/project-welcome.tsx` | `@client` | | Not started |
| C-02 | C | Project list `GET /api/projects` and project snapshot `GET /api/projects/[id]` (canonical snapshot, polled) | `api/projects`, `lib/project-snapshot.ts` | `@client @contract` | | Not started |
| C-03 | C | Project hub `/project/[id]`: current state and the **next action** card, timeline (with the derived "Approved" step), activity feed (attention events highlighted, repeated system noise de-duplicated), allowances, pending-feedback block, "New" badges, display name | `app/project/[id]`, `lib/project-hub.ts`, `lib/project-journey.ts`, `lib/project-overview.ts`, `lib/concept-activity.ts`, `components/allowances.tsx` | `@client` | | Not started |
| C-04 | C | Upsell panel rules: add-on only when revision capacity is exhausted, upgrade when headroom is low, none in completed or non-revision phases. "Not now" snooze per session | `lib/project-hub.ts`, `components/revision-purchase.tsx` | `@upsell` | | Not started |
| C-05 | C | Brief wizard `/project/[id]/brief`: multi-step, progress, choice answers for hard questions, spaces and newlines kept in answers | `app/project/[id]/brief`, `lib/brief-wizard.ts`, `lib/brief-choices.ts`, `components/brief-*.tsx` | `@brief` | | Not started |
| C-06 | C | Server-side brief draft `GET/PUT/DELETE /api/projects/[id]/brief/draft` | `api/projects/[id]/brief/draft`, `lib/brief-draft.ts` | `@brief @contract` | | Not started |
| C-07 | C | Brief submit `POST /api/projects/[id]/brief` (versioned `ProjectBrief`), status → `BRIEF_SUBMITTED`, system message, confirmation, admin notification. `GET` returns the current brief | `api/projects/[id]/brief`, `lib/brief.ts`, `lib/brief-submission-confirmation.ts` | `@brief` | | Not started |
| C-08 | C | Concepts gallery `/project/[id]/concepts`, `GET /api/projects/[id]/concepts` (published only) | `app/project/[id]/concepts`, `api/projects/[id]/concepts` | `@concepts` | | Not started |
| C-09 | C | Concept detail `/project/[id]/concept/[conceptId]`: signed asset URLs `GET …/assets` (authorization rechecked before every presign) | `app/project/[id]/concept/[conceptId]`, `api/projects/[id]/concepts/[conceptId]/assets` | `@concepts @security` | | Not started |
| C-10 | C | Concept comments `GET/POST …/comments` (concept thread vs project thread) | `api/projects/[id]/concepts/[conceptId]/comments`, `lib/concept-thread.ts` | `@concepts` | | Not started |
| C-11 | C | Revision request `POST /api/projects/[id]/revision-requests`, scoped to a concept: reserves an entitlement, status → `REVISIONS_IN_PROGRESS`, admin email | `api/projects/[id]/revision-requests` | `@revisions` | | Not started |
| C-12 | C | Approve a concept `POST /api/projects/[id]/approve` with the acknowledgement-confirmation copy, the resulting status transition (Phase 0: record the exact one from code), audit `concept_approved`, client and admin emails | `api/projects/[id]/approve`, `lib/final-approval.ts` | `@approval` | | Not started |
| C-13 | C | Final files download `POST /api/projects/[id]/finals`: paid plus lifecycle plus exact active-asset guard, presigned ≤3600 s, sanitized Content-Disposition filename | `api/projects/[id]/finals`, `lib/final-deliverable-access.ts`, `lib/final-deliverable-filename.ts` | `@finals @security` | | Not started |
| C-14 | C | Messages `/project/[id]/messages`, `GET/POST /api/projects/[id]/messages`: chat with system messages shown, admin notification | `app/project/[id]/messages`, `api/projects/[id]/messages`, `lib/chat-messages.ts` | `@messages` | | Not started |
| C-15 | C | Read state `POST /api/projects/[id]/read-state {area: messages\|concepts}` clears the badges | `api/projects/[id]/read-state` | `@messages @concepts` | | Not started |
| C-16 | C | Entitlements view `GET /api/projects/[id]/entitlements` | `api/projects/[id]/entitlements` | `@entitlements @contract` | | Not started |
| C-17 | C | Settings `/settings`: profile `GET/PUT /api/profile` (first and last name, VAT number), change password (A-09) | `app/settings`, `api/profile` | `@settings` | | Not started |
| C-18 | C | Invoices page `/settings/invoices` (K-11) | `app/settings/invoices` | `@invoices` | | Not started |
| C-19 | C/A | App frame, header nav, theme switcher (light/dark), feature notice cards, status badges, premium design tokens | `components/app-frame.tsx`, `header-nav.tsx`, `theme-switcher.tsx`, `ui.tsx`, `app/globals.css` | `@visual` | | Not started |
| C-20 | C | Tenant isolation: a client can never read or mutate another client's project, concept, asset, message or invoice | all `api/projects/**` | `@authz` | | Not started |

## D: Admin portal

| ID | Actor | Feature and behaviour to preserve | Next.js source | Tag | Laravel | Status |
|---|---|---|---|---|---|---|
| D-01 | A | Admin dashboard `/admin`, `GET /api/admin/projects`: sections needs-action / in-progress / delivered, urgency sort (pending feedback and unread first), unread-message badges, a "Resolve pending feedback" link | `app/admin/page.tsx`, `lib/admin-dashboard.ts` | `@admin` | | Not started |
| D-02 | A | Project overview `/admin/projects/[id]`, `GET /api/admin/projects/[id]`: summary cards, quick-action grid, pending feedback, thread-choice cues | `app/admin/projects/[id]/page.tsx` | `@admin` | | Not started |
| D-03 | A | Status change `POST …/status`: state-machine transitions only, `ON_HOLD` remembers the previous state, reason, audit `state_changed` | `api/admin/projects/[id]/status`, `lib/project-state-machine.ts` | `@admin @state` | | Not started |
| D-04 | A | Brief view `/admin/projects/[id]/brief` (brief document rendering) | `app/admin/projects/[id]/brief`, `components/brief-document.tsx` | `@admin @brief` | | Not started |
| D-05 | A | Concepts manager `/admin/projects/[id]/concepts`, `GET/POST …/concepts`: upload with durable request receipts and advisory locks, a pending-feedback inbox with one-click actions | `app/admin/projects/[id]/concepts`, `api/admin/projects/[id]/concepts`, `lib/concept-upload-request.ts`, `lib/concept-upload-key.ts` | `@admin @concepts` | | Not started |
| D-06 | A | Publish a concept `POST …/concepts/[conceptId]/publish`: status → `CONCEPTS_READY`, system message, client email "Your concept is ready for review" | `api/admin/projects/[id]/concepts/[conceptId]/publish` | `@admin @concepts @email` | | Not started |
| D-07 | A | Delete a concept `DELETE …/concepts/[conceptId]`, audit `concept_deleted` (receipt-backed objects kept) | `api/admin/projects/[id]/concepts/[conceptId]` | `@admin @concepts` | | Not started |
| D-08 | A | Revision page `/admin/projects/[id]/concepts/[conceptId]/revision`: upload the revised concept, `GET …/revision-requests` | `app/admin/projects/[id]/concepts/[conceptId]/revision`, `api/admin/projects/[id]/revision-requests` | `@admin @revisions` | | Not started |
| D-09 | A | Mark a revision delivered `POST …/revision-requests/[rid]/delivered`: reserved → consumed, client email "Your revised concept is ready" | `api/admin/projects/[id]/revision-requests/[rid]/delivered` | `@admin @revisions` | | Not started |
| D-10 | A | Upload page `/admin/projects/[id]/upload` | `app/admin/projects/[id]/upload` | `@admin @concepts` | | Not started |
| D-11 | A | Final files upload `POST …/finals`: ZIP validation, immutable versioned assets, guarded publication, newest-asset selection, superseded records and objects kept, repair or replace in `FINAL_FILES_READY`/`DELIVERED` | `api/admin/projects/[id]/finals`, `lib/admin-final-publication.ts`, `docs/upload-lifecycle-hardening.md` | `@admin @finals` | | Not started |
| D-12 | A | Retry the final-files notification `POST …/finals/notify` (notification only) | `api/admin/projects/[id]/finals/notify` | `@admin @finals @email` | | Not started |
| D-13 | A | Admin final download `POST …/finals/download` | `api/admin/projects/[id]/finals/download` | `@admin @finals` | | Not started |
| D-14 | A | Entitlement override `PATCH …/entitlements` (validated inputs, audit `entitlement_limit_overridden`), and reset `POST …/entitlements/reset` | `api/admin/projects/[id]/entitlements*`, `lib/admin-override-inputs.ts` | `@admin @entitlements` | | Not started |
| D-15 | A | Project reset `POST …/reset`: a clean slate that **keeps** immutable final bytes and receipt-backed concept objects, audit `project_reset` | `api/admin/projects/[id]/reset` | `@admin` | | Not started |
| D-16 | A | Audit log `/admin/projects/[id]/audit`, `GET …/audit` | `app/admin/projects/[id]/audit`, `lib/admin-audit.ts` | `@admin @audit` | | Not started |
| D-17 | A | Admin messages `/admin/projects/[id]/messages`: reply in the right thread, client email "New message from your Logo Fountain designer" | `app/admin/projects/[id]/messages` | `@admin @messages` | | Not started |
| D-18 | A | Health `/admin/health`, `GET /api/admin/health` (DB, R2 bucket HEAD, config; no secrets or diagnostics leaked). Public `GET /api/health` | `app/admin/health`, `api/admin/health`, `api/health`, `docs/admin-health.md` | `@admin @ops` | | Not started |
| D-19 | A | Admin invoices view (K-11) | `api/admin/projects/[id]/invoices` | `@admin @invoices` | | Not started |
| D-20 | A | Admin-only enforcement on every `/admin/**` page and `/api/admin/**` route | `app/admin/layout.tsx`, `lib/auth/admin.ts` | `@authz` | | Not started |

## N: Notifications (email and system messages)

| ID | Recipient | Trigger → email subject or system message | Next.js source | Tag | Status |
|---|---|---|---|---|---|
| N-01 | C | Setup link: "Finish setting up your Logo Fountain account" | `lib/auth/mail.ts` | `@email @checkout` | Not started |
| N-02 | C | Sign-in link: "Your Logo Fountain sign-in link" | `lib/auth/mail.ts` | `@email @auth` | Not started |
| N-03 | C | Reset: "Reset your Logo Fountain password" | `lib/auth/mail.ts` | `@email @auth` | Not started |
| N-04 | C | "Your concept is ready for review" | `lib/project-lifecycle-email.ts` | `@email` | Not started |
| N-05 | C | "Your revised concept is ready" | ″ | `@email` | Not started |
| N-06 | C | "New message from your Logo Fountain designer" | ″ | `@email` | Not started |
| N-07 | C | "Concept approved - final files in progress" | ″ | `@email` | Not started |
| N-08 | A | "Client approved a concept" | ″ | `@email` | Not started |
| N-09 | C | "Your final logo files are ready" | ″ | `@email` | Not started |
| N-10 | A | "New project created" | ″ | `@email` | Not started |
| N-11 | A | "New client message" | ″ | `@email` | Not started |
| N-12 | A | "New concept feedback submitted" | ″ | `@email` | Not started |
| N-13 | C | Brief submission confirmation (Phase 0: confirm whether this is an email, a UI message or both) | `lib/brief-submission-confirmation.ts` | `@email @brief` | TBC |
| N-14 | All | Email branding (logo, HTML and text bodies), HTTPS-only CTA URLs, recipients from `ADMIN_NOTIFICATION_EMAILS` | `lib/email-branding.ts` | `@email` | Not started |
| N-15 | C/A | System messages in the thread: brief received, concept ready, revision requested/delivered, final files ready (`Message.kind=system`) | `lib/system-messages.ts`, `lib/message-kind.ts` | `@messages` | Not started |
| N-16 | S | Email matrix: `docs/email-lifecycle-verification-matrix.md` is the cross-check for N-01…N-15 | | `@email` | Not started |

## X: Cross-cutting, security and robustness (the NFRs)

| ID | Feature and behaviour to preserve | Next.js source | Tag | Status |
|---|---|---|---|---|
| X-01 | Mutation Origin and Referer guard runs **before** auth, body parsing or I/O. `403 INVALID_ORIGIN`, `503 PUBLIC_SITE_URL_REQUIRED`. The documented exemptions (webhook, checkout email flows, `/checkout/start`, GETs, health) | `lib/request-origin.ts`, `docs/security-boundaries.md` | `@security` | Not started |
| X-02 | Response headers: report-only CSP (same directives), X-Frame-Options DENY, nosniff, Referrer-Policy, Permissions-Policy. `no-referrer` and `no-store` on `/auth/callback`, `/set-password`, `/reset-password` | `next.config.ts` | `@security` | Not started |
| X-03 | JSON error shape `{error:{message,code?,details?}}` and status codes per endpoint | `lib/api-error.ts` | `@contract` | Not started |
| X-04 | Canonical origin from server-only `PUBLIC_SITE_URL` (HTTPS in production). Loopback-only HTTP in dev | `lib/request-origin.ts` | `@security` | Not started |
| X-05 | Trusted client IP only from `AUTH_CLIENT_IP_HEADER` or `AUTH_TRUSTED_PROXY_HOPS`; otherwise per-IP limits are off | `lib/auth/client-address.ts` | `@security` | Not started |
| X-06 | Rate limits (auth, forgot password, checkout emails). Laravel version is shared-store, not process-local | `lib/auth/rate-limit.ts`, `AuthRateLimit` | `@security` | Not started |
| X-07 | Project state machine: the 11 states, the transition table, the timeline labels and primary CTA per state | `lib/project-state-machine.ts`, `lib/project-status.ts`, `docs/state-machine-v1.0.md` | `@state` | Not started |
| X-08 | Audit events: every type written today (`brief_submitted`, `concept_published`, `concept_deleted`, `concept_revision_uploaded`, `concept_upload_request`, `concept_approved`, `entitlement_*`, `finals_uploaded`, `message_sent`, `order_fulfilled`, `package_upgrade_applied`, `project_reset`, `revision_requested`, `revision_delivered`, `state_changed`, `auth.password_changed`, `auth.password_reset`, Stripe event types) with equivalent payloads | `lib/audit.ts` | `@audit` | Not started |
| X-09 | Transaction advisory locks and bounded retries on fulfilment, auth fencing and concept uploads | `lib/checkout-fulfillment.ts`, `lib/auth/fence.ts`, `api/admin/projects/[id]/concepts` | `@pg-race` | Not started |
| X-10 | R2 storage: two private logical buckets (`concepts`, `final-deliverables`), random immutable version paths, `IfNoneMatch:*`, canonical MIME, SHA-256 metadata, never overwrite, collision fails closed | `lib/storage/r2.ts`, `docs/private-r2-runbook.md` | `@storage` | Not started |
| X-11 | Presigned GET: expiry an integer from 1 to 3600, never persisted or logged, authorization rechecked right before issuing | `lib/storage/r2.ts` | `@storage @security` | Not started |
| X-12 | Upload validation: concept image ≤10 MiB and ≤40 MP; final ZIP ≤100 MiB, ≤1000 entries, ≤500 MiB uncompressed, compression ratio ≤100, CRC checks | `lib/upload-validation.ts`, `lib/zip-validation.ts` | `@uploads` | Not started |
| X-13 | Ambiguous-commit object retention, upload before publication, committed-receipt recovery | `docs/upload-lifecycle-hardening.md` | `@uploads @pg-race` | Not started |
| X-14 | No secrets, signed URLs or bearer links in API responses, logs or audit payloads | everywhere | `@security` | Not started |
| X-15 | UUID primary keys throughout. `Profile.id` equals the auth user ID | `prisma/schema.prisma` | `@contract` | Not started |

## O: Ops and developer tooling

| ID | Feature | Next.js source | Status |
|---|---|---|---|
| O-01 | Local run with a disposable PG cluster | `scripts/local-run.mjs`, `scripts/local-dev-pg.mjs`, `docs/local-dev-pg-handoff.md` | Not started |
| O-02 | Seed fixtures (packages, projects with allowances drawn down, extra project), with a guard against running on non-local DBs | `lib/local-dev-seed*`, `lib/local-dev-fixture-guard.ts` | Not started |
| O-03 | Isolated real-Postgres test runner | `scripts/isolated-postgres-test.mjs` | Not started |
| O-04 | Security check and predeploy check | `scripts/security-check.mjs` | Not started |
| O-05 | Production proxy-config preflight | `scripts/auth-proxy-preflight.mjs` | Not started |
| O-06 | DB runtime grants (least-privilege runtime role) | `ops/postgres/runtime-grants.sql` | Not started |
| O-07 | Environment variables: `DATABASE_URL`, `DIRECT_URL`, `PUBLIC_SITE_URL`, `PUBLIC_MARKETING_SITE_URL`, `STRIPE_*`, `POSTMARK_*`, R2 vars, `ADMIN_NOTIFICATION_EMAILS`, `EMAIL_LOGO_URL`, `AUTH_CLIENT_IP_HEADER`, `AUTH_TRUSTED_PROXY_HOPS` (the full list comes from `grep process.env` in Phase 0) | | Not started |
| O-08 | Runbooks: auth, checkout troubleshooting, webhook ops, R2, test runbook, all rewritten for Laravel | `apps/web/docs/*` | Not started |

## Phase 0 sweep checklist

- [ ] Every `route.ts` (49) and `page.tsx` (27) maps to a row above.
- [ ] Every `src/lib/*.ts` module maps to a row (or is marked UI-only and ported with its component).
- [ ] Every Vitest file (95) and its test names are listed in the test-port ledger (`02-test-strategy.md` §6).
- [ ] Every doc in `docs/` and `apps/web/docs/` has been read for behaviour that isn't visible in code.
- [ ] `TBC` rows resolved.
