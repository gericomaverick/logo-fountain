---
stepsCompleted: [init, discovery, vision, executive-summary, success, journeys, domain, project-type, scoping, functional, nonfunctional, polish]
inputDocuments:
  - docs/laravel-migration/product-brief.md
  - docs/laravel-migration/01-feature-inventory.md
  - docs/laravel-migration/brownfield/index.md (and all brownfield docs)
  - docs/laravel-migration/ux-design.md
  - docs/laravel-migration/02-test-strategy.md
workflowType: prd
workflow: bmad-bmm-create-prd (BMAD step 2.1)
status: Draft for owner review (validate with bmad-bmm-validate-prd next)
date: 2026-11-18
---

# Product requirements document: Logo Fountain portal on Laravel

**Author:** Mat (owner), drafted by Claude · **Date:** 2026-11-18

## 1. Executive summary

Rebuild the Logo Fountain client and admin portal on Laravel, with **the same capabilities and guarantees** as the existing Next.js app, a small set of **decided fixes** (DV-1, DV-2, DV-4…DV-9, DV-11…DV-13; DV-3 is deferred), and a **full redesign** to the approved UX spec (direction A, Studio paper). Launch directly on Laravel, hosted on Hetzner. Why and the success criteria are in `product-brief.md`.

**How to read the requirements.** Each FR is a testable capability, stated as *what*, not *how*. The `[ID]` tags cite the feature-inventory rows holding the exact behaviour, limits, error codes and copy (and the brownfield doc behind them). An FR without an inventory ID is new (from a DV- decision or the UX spec). **If a capability isn't an FR here, it won't be built.**

## 2. Success criteria
See `product-brief.md` → Success metrics. In short: 100% of inventory rows verified; the parity suite green on both apps (except tests tagged `@deviation`); the L6 authorisation matrix, L3 concurrency (7 nights) and restore drill green; WCAG 2.2 AA with zero serious axe issues; the UX quality targets met.

## 3. User journeys
Defined in `ux-design.md` §10 (J1 purchase → first visit, J2 brief, J3 concepts, feedback and approval, J4 allowance exhausted, J5 final files, J6 admin daily loop, J7 admin exceptions). Each journey is an L5 parity test (`02-test-strategy.md` §4).

## 4. Domain and project-type requirements
- **Domain:** a paid creative service with fixed entitlements. Money, allowances and approvals must be exact, auditable and idempotent. UK business; prices in GBP; VAT not charged (supplier not VAT-registered; VAT capture deferred, DV-3).
- **Payments and privacy:** card data never touches the portal (Stripe-hosted Checkout, so PCI scope is SAQ A). Personal data is limited to names, emails, brief answers and messages; it's processed for service delivery and kept for the business relationship (formal retention policy post-launch).
- **Project type:** a brownfield rewrite of an authenticated web app (server-rendered SPA via Inertia), with a public Stripe webhook and an operator CLI. No public API, no SEO (`noindex`).

## 5. Scope
**In:** every FR below. **Out:** VAT capture (DV-3), brief attachments, realtime transport, multiple admins, campaign landing pages, the marketing site, data migration. See the product brief.

## 6. Functional requirements

### 6.1 Access and identity
- **FR1:** A customer can sign in with email and password. Failed, unknown, unverified and rate-limited attempts all get an identical response. [A-01]
- **FR2:** A customer can request a one-time sign-in link by email, and must explicitly confirm on the link's page before it signs them in. [A-05, A-18]
- **FR3:** A new customer can set their first password from a single-use setup link sent after purchase. A setup link can never replace an existing password. [A-06]
- **FR4:** A customer can request password recovery without learning whether an account exists, and reset their password from a single-use, one-hour link. Resetting ends all their sessions, invalidates every outstanding setup, reset and sign-in link, marks the mailbox verified, and doesn't sign them in. They sign in with the new password. [A-07, A-08, N-03]
- **FR5:** A signed-in user can change their password by giving the current one. This ends every session, including the current one. [A-09]
- **FR6:** A signed-in user can sign out, and the app confirms the session is really gone before saying so. [A-02]
- **FR7:** The system ends any session 7 days after it was created, regardless of activity, and treats unverified mailboxes as signed out. [A-03, A-04]
- **FR8:** The system sends users only to safe, in-app destinations after sign-in. [A-13]
- **FR9:** An operator can grant the first admin once, through a two-step command-line bootstrap that requires a verified mailbox. Nothing in the running app can grant or remove admin rights. [A-12, A-19]
- **FR10:** The system serialises all credential changes per user, so concurrent reset, change, sign-in and link use can't interleave. [A-10, A-11]
- **FR11:** The system exposes no authentication endpoints beyond those listed in the inventory. [A-14, A-17]

### 6.2 Purchase, payments and entitlements
- **FR12:** A prospect can start checkout for a package (Essential, Professional or Complete) from the marketing site, optionally tagged with a campaign. The Checkout success and cancel addresses are built only from the configured canonical portal and marketing URLs, never from request headers. [K-01, DV-4, DV-5]
- **FR13:** A buyer can enter a Stripe promotion code at any checkout. [K-13, DV-1]
- **FR14:** A buyer can see their purchase being confirmed after payment, with troubleshooting and a resend-email option if it takes longer than expected. [K-02, K-03, K-04]
- **FR15:** The system fulfils a purchase only when Stripe confirms payment (including delayed payment methods), exactly once per Checkout Session, and keeps retries safe after partial failures. [K-05, K-06]
- **FR16:** The system creates the project, its entitlements and the customer's access on fulfilment, and emails a setup link (new customer) or a sign-in link (existing customer), plus a new-project email to the admin. [K-06, K-07, N-01, N-02, N-10]
- **FR17:** A customer can buy an extra revision, or an upgrade to the next package, from their project. [K-08, C-04, DV-5]
- **FR18:** The system applies an upgrade additively: each limit rises by the difference between the tiers, and purchased add-ons are kept. [K-09, DV-2]
- **FR19:** A customer sees confirmation on their project once an add-on or upgrade purchase is fulfilled, including during delays and after a refresh. [K-10]
- **FR20:** A customer and the admin can view invoices and receipts for each purchase. [K-11, C-18, D-19]
- **FR21:** An admin can reprocess a stuck purchase. This performs the same fulfilment and the same customer and admin emails as normal checkout, with no duplicates. [K-12, DV-6]
- **FR22:** The system reserves a revision when it's requested and counts it as used only when it's delivered. [K-14]

### 6.3 Customer project experience
- **FR23:** A customer with one project lands directly on it. A customer with several sees a list showing each project's turn, next step and new activity. The old dashboard address keeps working. An admin who opens a customer address is sent to the admin view of the same project. [C-01, A-16, ux §5.3]
- **FR24:** A customer can see, on the project overview, whose turn it is, the single next action, the stage of the project, their remaining allowances (used, in progress, left) and recent activity. [C-02, C-03, C-16, ux §2.5]
- **FR25:** A customer can complete the structured brief over several steps, with autosave to the server and the device, and must explicitly confirm before submitting. Once sent, the brief is locked and versioned. No email is sent on submission. [C-05, C-06, C-07, N-13]
- **FR26:** A customer can view their published concepts and every version of each. They can never see unpublished concepts. [C-08, C-09, DV-7]
- **FR27:** A customer can comment on a concept without using an allowance. [C-10, DV-7]
- **FR28:** A customer can request a revision on a published concept, seeing beforehand how many revisions it will leave. When none remain, they're offered the add-on or upgrade. [C-11, C-04, DV-7]
- **FR29:** A customer can approve one published concept after an explicit confirmation. The other concepts are archived. [C-12]
- **FR30:** A customer can download their final files once ready, at any later time. The first download completes the project. Final files and that project's invoices and receipts sit together in the project's Files section, and all invoices are also listed under Account. [C-13, ux §5.1]
- **FR31:** A customer can exchange messages with their designer and see project events in the thread. [C-14, N-15, X-16]
- **FR32:** The system marks concepts and messages as new until the customer has seen them. [C-15]
- **FR33:** A customer can update their name and change their password. Customers and admins can choose light, dark or system theme. [C-17, C-19]
- **FR34:** A customer can never see or act on another customer's projects, concepts, files, messages or invoices. [C-20, DV-7]

### 6.4 Admin operations
- **FR35:** An admin can see every project in a queue grouped into needs action, in progress and done, ordered by urgency, with the reason each item needs attention and unread-message badges. The queue is searchable and filterable, and opening an item lands on the section that needs action. [D-01, ux §7, ux §14]
- **FR36:** An admin can open a project workspace showing its state, what's pending, its timeline, client, package, allowances, and order and payment status. [D-02]
- **FR37:** An admin can put a project on hold, cancel it, or resume it, each with a mandatory reason. Resume restores the previous stage only when that stage is still valid. [D-03, X-07]
- **FR38:** An admin can read the submitted brief. [D-04]
- **FR39:** An admin can upload a new concept (published immediately), replace a concept, or upload a revised version. Retries never duplicate work. [D-05, D-10, X-19]
- **FR40:** An admin can publish a draft concept and delete a concept where the project's stage allows it. [D-06, D-07, F-10]
- **FR41:** An admin can see pending revision requests and mark them delivered. Uploading a revised version also delivers that concept's pending requests and emails the customer. [D-08, D-09, N-05, DV-9]
- **FR42:** An admin can upload final files, replace them (old files stay available until their links expire), retry the customer notification, and download the current final files. [D-11, D-12, D-13, DV-11]
- **FR43:** An admin can override a project's concept or revision limits with a mandatory reason. [D-14]
- **FR44:** An admin can perform a clean-slate reset, confirmed by typing the project name. It returns the project to brief-submitted (or awaiting-brief if there's no brief); deletes concepts, revision requests, comments and file records, and optionally the non-system messages; zeroes usage while keeping limits; and keeps the brief, orders, audit and every stored file. [D-15]
- **FR45:** An admin can view a project's audit log and filter it by event type. The system records an audit event for every lifecycle transition, entitlement change, payment, email marker and credential change. [D-16, X-08]
- **FR46:** An admin can message the customer in the project thread, and reply in any concept's feedback thread. [D-17, C-10]
- **FR47:** An admin can view system health (configuration, database, Stripe, storage) without exposing secrets. Anyone can query a minimal public liveness check that reveals nothing but `ok`. [D-18]
- **FR48:** Only admins can reach admin screens and actions. Every non-public page and endpoint requires a signed-in user, and the site root sends visitors to sign-in. [D-20, A-15, A-16]

### 6.5 Notifications
- **FR49:** The system emails the customer when a concept is ready, a revision is ready, the designer messages them, a concept is approved, and final files are ready. It emails the admin about new projects, client messages, revision requests and approvals. Comments send no email. Each email is sent at most once per event under normal operation (the marker can't prevent a rare duplicate after a crash), except that a finals re-upload while files are ready re-notifies (F-12). This is cross-checked by the email verification matrix. [N-04…N-12, N-16, X-18, DV-8]
- **FR50:** All emails are branded to the design system and link to the exact place they refer to. [N-14]

### 6.6 Files and storage
- **FR51:** The system stores concept images and final files privately and never overwrites or deletes a stored file during normal operation. [X-10, X-13]
- **FR52:** The system gives access to stored files only through short-lived links, issued after a fresh permission check, with safe download names. [X-11, C-13]
- **FR53:** The system accepts only valid PNG, JPEG or WebP images (≤ 10 MiB = 10,485,760 bytes, ≤ 40,000,000 pixels) and only safe ZIP archives (≤ 95,000,000 bytes (DV-13), ≤ 1,000 entries, ≤ 500 MiB = 524,288,000 bytes expanded, compression ratio ≤ 100 per entry), and rejects malformed or malicious files with clear reasons. [X-12, DV-13]
- **FR54:** Polling never re-downloads an image that hasn't changed. [DV-12]
- **FR58:** Project screens refresh by themselves without a reload (customer overview every 10 s, admin workspace every 2 s, audit log every 2.5 s, checkout confirmation every 2 s, slowing to 10 s after 45 s). After 3 consecutive failures they show a quiet "Reconnecting…" notice and keep trying. [C-02, D-02, D-16, K-02, ux §12, ADR-023]

### 6.7 Platform and operations
- **FR55:** An operator can run the app locally, seed test scenarios, run all test suites and the security check in Docker, and configure every environment setting from a documented list. [O-01…O-04, O-07]
- **FR56:** An operator can deploy to Hetzner with runtime and migration database roles separated, and can back up and restore the database and stored files. [O-06, `00-migration-plan.md` §6, ADR-025]
- **FR57:** The system refuses to start authentication in production without valid proxy and canonical-URL configuration. [A-17, X-04, X-05, O-05]

## 7. Non-functional requirements

### Security
- **NFR-S1:** Every cookie-authenticated state-changing request passes the canonical Origin/Referer check **before** any other processing. Documented exemptions only. [X-01] *Measured by:* L4 security contract tests plus the L6 matrix, and the arch test that every non-exempt mutating route carries the guard.
- **NFR-S2:** Response security headers per X-02. CSP ships report-only, and HSTS is set at the TLS edge.
- **NFR-S3:** No secret, password, token, signed URL or provider response body appears in any response, log or audit record. [X-14] *Measured by:* Pest tests on the log scrubber and audit scrubber, plus a CI grep of test-run logs for token and URL patterns.
- **NFR-S4:** Rate limits use a shared atomic store, hold across processes and restarts, and keep counting even when the surrounding business transaction rolls back. [X-06, ADR-009] *Measured by:* Pest tests of the limiter, including a parallel-process test and a rollback test.
- **NFR-S5:** The authorisation matrix (every endpoint × anonymous / client A / client B / admin, and every concept status for client routes) passes 100%. [L6]
- **NFR-S6:** `composer audit` and `npm audit --omit=dev` report zero known vulnerabilities at release. Laravel and PHP are on versions inside their security-support window.

### Reliability and data integrity
- **NFR-R1:** Webhook processing is idempotent under concurrent and repeated delivery: zero double fulfilments in the L3 race suite. [K-05, X-09]
- **NFR-R2:** Allowance counters can never exceed their limits under concurrent requests. [K-14, X-17] *Measured by:* L3 race tests (parallel revision requests and concept publications).
- **NFR-R3:** Lifecycle mutations use optimistic versioning and serializable transactions. Conflicts return defined 409 responses, never corrupt state. [X-17] *Measured by:* L3 tests forcing SQLSTATE 40001 and 40P01, and version conflicts.
- **NFR-R4:** Encrypted off-box backups go to two repositories (an R2 bucket and a Hetzner Storage Box), with continuous WAL archiving (RPO ≤ 15 min), 30 days of point-in-time recovery and 12 monthly backups. Stored files are copied nightly. A timed restore drill happens before launch and quarterly (RTO ≤ 2 h). [ADR-025]
- **NFR-R5:** Lifecycle emails are queued after commit and retried automatically with backoff, never blocking or undoing the user's action. **Sign-in, setup and reset link emails are sent synchronously after commit.** If one fails, its link is invalidated and the user gets the fixed error. [DV-8, A-11, ADR-018] *Measured by:* Pest tests with a failing transport for both modes.

### Performance
- **NFR-P1:** Authenticated API p95 ≤ 500 ms and page TTFB p95 ≤ 600 ms on the production server with 50 concurrent virtual customers plus 1 admin polling. *Measured by:* a k6 load script run in E9 against the production-spec server.
- **NFR-P2:** Project overview Largest Contentful Paint ≤ 2.5 s and CLS ≤ 0.1 (no layout shift from polling or images). *Measured by:* Lighthouse mobile preset (Moto G Power emulation, slow 4G) in CI, median of 3 runs.

### Accessibility and UX
- **NFR-A1:** WCAG 2.2 AA. Zero serious or critical axe violations on every screen and state. Manual screen-reader and keyboard passes for J1–J7.
- **NFR-A2:** Every screen matches `ux-design.md` (structure, priority order, patterns, tokens), verified by approved visual baselines and the design-system lint.
- **NFR-A3:** UX quality targets: the 5-second test 5/5; revision, approval and download in ≤ 3 taps on a phone; the admin reaches any needs-action item in 1 click; a concept upload takes < 60 s without errors.
- **NFR-A4:** Light and dark themes are both complete, follow the system preference by default, and never flash the wrong theme on load. *Measured by:* L7 baselines in both themes, plus a Playwright check of the first-paint theme with `prefers-color-scheme` emulated.

### Maintainability
- **NFR-M1:** Conventional Laravel structure, Larastan level 9, Pint-formatted, no framework replacements except the documented auth fencing and conditional storage writes.
- **NFR-M2:** Every converted feature has its story record, inventory status, tests and runbook updates (`03-documentation-protocol.md`). Every old runbook has a Laravel replacement. [O-08]
- **NFR-M3:** Every JSON error uses the standard `{error:{message, code?, details?}}` shape and the documented status codes. All identifiers are UUIDs, and a user's profile shares the user's ID. [X-03, X-15, DV-11]
- **NFR-M4:** Every `/api/*` endpoint keeps the Next.js contract: path, method, request shape, response shape (camelCase keys) and status codes. The only exceptions are the decided deviations, and an added field must be backward-compatible. [ADR-003, DV- rows] *Measured by:* the L4 parity contract suite on both apps.
- **NFR-O1:** The queue worker and scheduler are supervised and restarted on every deploy and PHP patch. Backup failures, stale backups, failed jobs and failed health checks email the owner within 1 h. [ADR-019, ADR-026, O-08] *Measured by:* an alert drill in E9.

## 8. Assumptions and open items
- A single admin at launch (brief, open question 2).
- The **one-project shortcut** (ux §5.3.1) and the **Files tab** are pending explicit owner approval (UX §15 item 3).
- Turnaround copy for empty states is pending from the owner (UX §15.2).
- Exact versions, hosting tool and backup tooling come from `research-technical.md` and the architecture ADRs.

## 9. Traceability check
Every inventory row in the A, K, C, D, N, X and O series is cited by at least one FR or NFR above. The coverage script (`tests/parity/scripts/coverage.mjs`, E0) enforces inventory → test coverage. **PRD validation (`bmad-bmm-validate-prd`) must confirm FR → inventory coverage before architecture is finalised.**
