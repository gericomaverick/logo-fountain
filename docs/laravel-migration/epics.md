---
stepsCompleted: [validate-prerequisites, design-epics, create-stories, final-validation]
inputDocuments: [prd.md, architecture.md, adr/, ux-design.md, 01-feature-inventory.md, 02-test-strategy.md, test-port-ledger.md, brownfield/]
workflow: bmad-bmm-create-epics-and-stories (BMAD step 3.2)
status: Draft for owner review
date: 2026-11-18
---

# Logo Fountain portal on Laravel: epic breakdown

## Overview

There are 10 epics and 74 stories, ordered by dependency. **Every story also carries the standard definition of done from `03-documentation-protocol.md` §3**, which isn't repeated in each story: parity tags green on Laravel *and* Next, no regressions, ledger rows resolved, inventory set to Verified, the story record complete, handoff updated, and the change pushed. Full story files are generated from this list by BMAD `create-story` into `stories/` when each story starts. The acceptance criteria here are the *minimum*. The story file adds the full brownfield behaviour (every code, limit and copy string) from the cited docs.

**Notation:** each story lists **Covers** (inventory IDs, FRs), **Tags** (parity-suite tags that must go green), and **After** (dependencies).

## Requirements inventory

- Functional: **FR1–FR57** (`prd.md` §6). Non-functional: **NFR-S1…S6, R1…R5, P1…P2, A1…A4, M1…M3** (`prd.md` §7).
- Additional: ADR-001…028 (`architecture.md`). UX spec §§1–16. Test layers L0–L9.

### FR coverage map

| FRs | Epic |
|---|---|
| FR1–FR11 | E4 |
| FR12–FR22 | E5 |
| FR23–FR34 | E6 |
| FR35–FR48 | E7 |
| FR49–FR50 | E8 (built inside E5–E7, verified in E8) |
| FR51–FR54 | E3 (+ E6/E7 for FR54) |
| FR55–FR57 | E0, E1, E9 |
| FR58 | E6 (6.2, 5.4), E7 (7.2, 7.10): one shared `usePolling` hook built in 1.8 |
| NFR-M4 | E0 (0.7 contract suite) plus every API story |
| NFR-O1 | E9 (9.3) |
| NFR-S* | E1, E4, E9 |
| NFR-R* | E2, E5, E9 |
| NFR-P* | E6, E9 |
| NFR-A* | E1 (system), E6/E7 (screens), E9 (usability) |
| NFR-M* | all |

## Epic list

| # | Epic | Stories | Outcome |
|---|---|---|---|
| E0 | Parity harness on Next.js | 9 | The executable spec: a black-box suite green against today's app |
| E1 | Laravel foundations and design system | 9 | A running skeleton, security middleware, the design system as code, CI |
| E2 | Data layer and domain core | 6 | Schema, roles, models, state machine, audit, locks, seeds |
| E3 | Private storage and upload validation | 4 | R2 client, validators, golden corpus |
| E4 | Authentication and identity | 9 | Every sign-in, setup and reset flow with fences and limits |
| E5 | Checkout, payments and entitlements | 8 | Purchase to project, upsells, invoices, reprocess |
| E6 | Customer portal (new design) | 11 | Every customer screen and capability |
| E7 | Admin portal (new design) | 11 | Every admin screen and capability |
| E8 | Notifications verification | 2 | Every email and system message proven end to end |
| E9 | Operations, hardening and cutover | 5 | Production on Hetzner, backups drilled, launch |

---

## Epic E0: Parity harness on Next.js
Build the framework-agnostic black-box test suite and make it green against the current Next.js app **before any Laravel code**, so it becomes the executable specification.

### Story 0.1: Parity suite scaffold
As the delivery team, I want a shared Playwright project at `tests/parity/` with target adapters, tag conventions and page-object folders, so that one suite can drive either app.
**Covers:** test strategy §3 · **Tags:** n/a · **After:** none
- **Given** `PARITY_TARGET=next` and `PARITY_BASE_URL`, **when** `npx playwright test --grep @smoke` runs, **then** it executes against that target, and journeys can't import target-specific code (lint rule).
- **And** test titles must start with inventory IDs (an enforced naming rule).

### Story 0.2: Test infrastructure stack
As the team, I want `docker-compose.test.yml` with postgres 18, Mailpit and SeaweedFS (with bucket bootstrap), so that both apps test against identical infrastructure.
**Covers:** O-01, O-03 · **After:** 0.1
- **Given** the stack is up, **when** the SeaweedFS probe PUTs the same key twice with `If-None-Match: *`, **then** the second PUT returns 412. (If it doesn't, record the fallback per test strategy §3 and log a risk.)
- **And** the Mailpit API is reachable from the test runner.

### Story 0.3: Next.js test seams
As the team, I want Next.js test-mode seams (SMTP → Mailpit in place of the Postmark API, an R2 endpoint override → SeaweedFS), so that it runs on the shared stack without affecting production paths.
**Covers:** test strategy §7 · **After:** 0.2
- **Given** `PARITY_MODE=1`, **when** an auth link is requested, **then** the email arrives in Mailpit. **And** with the flag unset, production code paths are unchanged (unit test).
- **And** each seam is logged as an allowed `apps/web` freeze exception (an inventory note).

### Story 0.4: Seed scenarios (Next)
As the team, I want `npm run parity:seed -- <scenario>` for all 13 named scenarios, guarded to local databases, so that tests start from known states.
**Covers:** O-02 · **After:** 0.2
- **Given** a non-local `DATABASE_URL`, **when** the seed runs, **then** it refuses.
- **Given** the `two-tenants` scenario, **then** clients A and B exist with known credentials and distinct projects.

### Story 0.5: Stripe fixture signer and checkout fixtures
As the team, I want locally signed `checkout.session.*` fixtures (current timestamp, test secret), so that webhook behaviour is tested offline and deterministically.
**Covers:** K-05, K-06 · **Tags:** `@webhook` · **After:** 0.1
- **Given** a fixture event, **when** it's POSTed twice, **then** the second response is `deduped`. A bad signature returns 400. An unpaid session isn't fulfilled.

### Story 0.6: Golden fixtures (uploads and rules)
As the team, I want the golden upload corpus with expected error codes, and shared rule fixtures (state machine, safe-next, brief normalisation, display status, entitlement usage) captured from Next, so that the PHP ports can be proven against identical expectations.
**Covers:** X-07, X-12, A-13, C-05 · **After:** 0.1
- **Given** each corpus file, **when** Next's validator runs, **then** the recorded code matches. The Vitest suite reads the same fixture files.

### Story 0.7: Contract and authorisation matrix suites
As the team, I want L4 contract tests for all 49 endpoints and the generated L6 matrix (endpoint × anonymous / A / B / admin, plus concept status for client routes), so that API behaviour and permissions are locked.
**Covers:** X-01, X-03, C-20, D-20, A-16 · **Tags:** `@contract @authz @security` · **After:** 0.4
- **Given** client B's credentials, **when** any client-A resource is requested, **then** the response is the documented 404 or 403. Every mutation without a canonical Origin gets `403 INVALID_ORIGIN`.
- `@deviation` tests for DV-7 are present and listed in `expected-next-failures.txt`.

### Story 0.8: Journey suites J1–J7 and abuse cases
As the team, I want the L5 journeys (test strategy §4, items 1–23) written against page objects with a Next implementation, so that behaviour is proven end to end.
**Covers:** all C, D, K, N rows · **Tags:** all · **After:** 0.3–0.7
- **Given** the stack, **when** the full suite runs against Next, **then** everything passes except the listed `@deviation` tests (which must fail).

### Story 0.9: Coverage gate, CI parity job and baseline
As the team, I want the coverage script (every inventory row has a test), the CI `parity` job, and a recorded baseline, so that conversion starts from a proven spec.
**Covers:** test strategy §5 · **After:** 0.8
- **Given** an inventory row without a test, **then** the coverage script fails. **And** `handoff.md` records the baseline counts from three consecutive green runs.

---

## Epic E1: Laravel foundations and design system

### Story 1.1: Skeleton, Docker and pins
As a developer, I want `apps/portal` created from Laravel 13 with the pinned versions, compose services (app, worker, vite, postgres with three roles, mailpit, seaweedfs), Pint, Larastan and Pest, so that every later story has a working base.
**Covers:** ADR-001, 002, 028; O-01, O-04 (security check as `composer`/`artisan` script plus `composer audit` and `npm audit`) · **After:** 0.2
- **Given** a fresh clone, **when** `docker compose up` runs, **then** `/up` responds. Pest, Larastan (agreed level) and Pint pass. Versions match `research-technical.md` §2.

### Story 1.2: Agent guide and project context
As an agent, I want `apps/portal/AGENTS.md` (conventions from architecture §5) and BMAD `generate-project-context` output, so that no agent works without the rules.
**Covers:** NFR-M2 · **After:** 1.1

### Story 1.3: Config validation and canonical origin
As the operator, I want boot-time validators (`PUBLIC_SITE_URL`, proxy settings, DB role pair, price IDs), and the canonical-origin service, so that production misconfiguration fails closed.
**Covers:** X-04, O-05, O-07, A-17 (config part) · **Tags:** `@security` · **After:** 1.1
- **Given** production with an http `PUBLIC_SITE_URL`, **then** auth endpoints return `503 PUBLIC_SITE_URL_REQUIRED`/`AUTH_UNAVAILABLE` as specified.

### Story 1.4: Origin guard as CSRF control
As a user, I want every cookie-authenticated mutation to reject non-canonical origins before any processing, so that cross-site requests can't act for me.
**Covers:** X-01, ADR-008 · **Tags:** `@security` · **After:** 1.3
- **Given** an `Origin: null` header, **then** the response is `403 INVALID_ORIGIN` even with a valid Referer. **And** the arch test fails if a non-exempt mutating route lacks the middleware. **And** `/api/*` is excluded from `PreventRequestForgery`.

### Story 1.5: Trusted client address
**Covers:** X-05, ADR-010 · **Tags:** `@security` · **After:** 1.3
- **Given** `AUTH_CLIENT_IP_HEADER=cf-connecting-ip` and a list value, **then** the address is unknown. Every case in `client-address.test.ts` passes in Pest.

### Story 1.6: Error shape, security headers, JSON boundary
**Covers:** X-02, X-03, X-14, A-17, ADR-027 · **Tags:** `@contract @security` · **After:** 1.1
- **Given** any domain exception, **then** the body is `{error:{message,code,details?}}`. Response headers match X-02. The auth endpoints enforce JSON-only, the 8 KiB cap and generic errors.

### Story 1.7: Design tokens and theming
As a customer, I want the direction A tokens, typography (Inter, Sfizia, Geist Mono), light, dark and system themes with no flash, so that every screen starts from the approved look.
**Covers:** C-19, NFR-A4, ADR-022, UX §8 · **Tags:** `@visual` · **After:** 1.1
- **Given** system dark mode, **when** any page loads, **then** it renders dark on first paint. **And** the token contrast pairs from UX §8.1 are asserted by a unit test.

### Story 1.8: Core UI components and catalogue
As a developer, I want the UX §11 components (Button, Field, Dialog, Tabs, Turn banner, Status pill, Allowance meter, Stage tracker, Toast, Empty state, File card, Upload dropzone, …) built on Radix primitives, with a `/dev/ui` catalogue, so that screens are assembled, not improvised.
**Covers:** UX §11–§13, NFR-A1/A2 · **Tags:** `@visual` · **After:** 1.7
- **Given** the catalogue, **then** every variant and state renders in both themes, axe reports no serious issues, and keyboard operation works (Dialog traps and restores focus).

### Story 1.9: App shells, the design lint and the UI CI job
**Covers:** UX §5 layouts, L7/L7a/L7b · **After:** 1.8
- **Given** a raw hex colour or pixel font size in a component, **then** the lint fails CI. The customer shell (top bar, project tabs, bottom bar on phones) and the admin shell (sidebar, workspace, properties column) render with placeholder content.

---

## Epic E2: Data layer and domain core

### Story 2.1: Schema migrations and roles
**Covers:** X-15, A-19, O-06, ADR-012/013 · **Tags:** `@pg-race` · **After:** 1.1
- **Given** the runtime connection, **when** it updates `profiles.is_admin`, **then** Postgres raises `operator-owned admin flag`. Email check constraints are enforced. The grants script revokes runtime access to `migrations` and `auth_admin_bootstrap`. FK behaviours match the brownfield table.

### Story 2.2: Models, policies and the client concept scope
**Covers:** C-20, D-20, DV-7 (scope), ADR-020 · **After:** 2.1
- **Given** a draft concept, **when** any client-path query resolves it, **then** nothing is returned. The arch test forbids unscoped concept queries in client controllers.

### Story 2.3: Project state machine and display status
**Covers:** X-07, C-03 (status parts) · **Tags:** `@state` · **After:** 2.1, 0.6
- **Given** the shared transition fixture, **then** the PHP `ProjectState` agrees on every case, including the reason rules for ON_HOLD, CANCELLED and REFUNDED.

### Story 2.4: Transactions, locks, versioning and audit
**Covers:** X-08, X-09, X-17, ADR-011 · **Tags:** `@pg-race @audit` · **After:** 2.1
- **Given** two concurrent `Db::serializable` writers, **then** one retries or gets 409, and the state is never lost. **And** `Audit::record` scrubs tokens and URLs from payloads.

### Story 2.5: Shared rate-limit store
**Covers:** X-06, ADR-009 · **Tags:** `@security` · **After:** 2.1
- **Given** a call inside an open transaction, **then** the limiter refuses (assertion). Window and cap semantics match `rate-limit.ts` tests, including clear-on-success for login failures.

### Story 2.6: Laravel seed scenarios
**Covers:** O-02 · **After:** 2.2
- **Given** `php artisan parity:seed two-tenants`, **then** the parity suite's seed adapter produces the same logical state as on Next (verified by the contract suite's read endpoints once they exist).

---

## Epic E3: Private storage and upload validation

### Story 3.1: Private object store
**Covers:** X-10, X-11, ADR-016 · **Tags:** `@storage` · **After:** 1.1, 0.2
- **Given** an existing key, **when** it's uploaded again, **then** the 412 maps to a collision and the bytes are unchanged. Presign expiry outside 1–3600 throws. The disposition sanitiser passes the ported cases. `HeadBucket` health works.

### Story 3.2: Image validator
**Covers:** X-12 (images) · **Tags:** `@uploads` · **After:** 0.6
- **Given** each image in the golden corpus, **then** the PHP validator returns the same code as Next. The size check happens before the bytes are read.

### Story 3.3: ZIP validator
**Covers:** X-12 (ZIP), DV-13 · **Tags:** `@uploads @deviation` · **After:** 0.6
- **Given** each ZIP in the corpus (bomb, ZIP64, symlink, traversal, case collision, CP437, descriptors, 1,001 entries), **then** the codes match. A 96 MB ZIP is `FILE_TOO_LARGE` (DV-13). No `ZipArchive` is used (arch test).

### Story 3.4: Stable private images
**Covers:** DV-12, ADR-021 · **After:** 1.8, 3.1
- **Given** a polled payload whose `imageKey` is unchanged, **then** the rendered `src` is unchanged (component test), and the network panel shows no re-download in an L5 check.

---

## Epic E4: Authentication and identity

### Story 4.1: Sessions with an absolute cap
**Covers:** A-03, A-04, ADR-005 · **Tags:** `@auth` · **After:** 1.6, 2.1
- **Given** a session created 7 days and 1 second ago, **then** `/api/auth/session` returns `{authenticated:false}`. A DB failure returns `503 SESSION_VERIFICATION_UNAVAILABLE`.

### Story 4.2: Credential fence and proofs
**Covers:** A-10, A-11, ADR-007 · **Tags:** `@pg-race` · **After:** 2.4
- **Given** concurrent reset/reset and reset/change, **then** exactly one credential transition wins and stale proofs are dead (the L3 ports of the auth PG tests).

### Story 4.3: Login
**Covers:** A-01, FR1 · **Tags:** `@auth` · **After:** 4.1, 2.5
- **Given** a wrong password, an unknown email, an unverified mailbox or a rate limit, **then** the response is the identical 400 `INVALID_CREDENTIALS`. A successful login clears the failure bucket and regenerates the session.

### Story 4.4: Auth links (request side) and auth emails
**Covers:** A-06, A-11, N-01, N-02, N-03, ADR-018 · **Tags:** `@auth @email` · **After:** 4.2, 1.8
- **Given** a Postmark failure, **then** the proof is deleted and a fixed error is returned with no link anywhere in the logs. Setup degrades to magic when a password exists. Emails match the subjects and copy, restyled to the design system.

### Story 4.5: Magic-link confirm
**Covers:** A-05, A-18, FR2 · **Tags:** `@auth @security` · **After:** 4.4
- **Given** the callback page opened with a valid token, **then** nothing is consumed until "Confirm sign-in" is pressed. The fragment is stripped from history.

### Story 4.6: Forgot, reset and set password
**Covers:** A-07, A-08, FR3, FR4 · **Tags:** `@auth` · **After:** 4.4
- **Given** a reset, **then** all sessions and proofs are deleted, the email is verified, `credential_version` is incremented, and the audit row is written. There's an anti-enumeration response for unknown emails.

### Story 4.7: Change password and logout
**Covers:** A-02, A-09, FR5, FR6 · **Tags:** `@auth @settings` · **After:** 4.3
- **Given** a password change, **then** every session including the current one ends and the response is `{ok:true, signedOut:true}`. Logout is verified through a fresh session check.

### Story 4.8: Safe-next, route guards, endpoint allowlist
**Covers:** A-13, A-14, A-15, A-16 · **Tags:** `@auth @authz` · **After:** 4.1
- **Given** `next=/%2f%2fevil.com`, **then** the fallback `/dashboard` is used. Only the documented auth routes exist (route-list test).

### Story 4.9: Admin bootstrap CLI and auth screens
**Covers:** A-12, FR9; UX sign-in, set/reset and confirm screens · **Tags:** `@cli @auth @visual` · **After:** 4.6, 2.1
- **Given** an existing admin, **then** `admin:bootstrap` refuses. The prepare and grant flow works only on `pgsql_migrate`. The auth screens match the UX spec, with baselines approved.

---

## Epic E5: Checkout, payments and entitlements

### Story 5.1: Checkout start
**Covers:** K-01, K-13, DV-1, DV-4, DV-5 · **Tags:** `@checkout @deviation` · **After:** 1.3
- **Given** `package_code=complete&campaign_slug=x`, **then** the Stripe session has promotion codes enabled, the custom name fields, invoice creation, canonical-origin URLs and `campaign_slug` metadata. A raw price ID is rejected.

### Story 5.2: Webhook ledger and classification
**Covers:** K-05, ADR-014 · **Tags:** `@webhook @pg-race` · **After:** 2.4, 0.5
- **Given** concurrent duplicate deliveries, **then** exactly one fulfilment happens. A transient failure releases the claim (retryable). A permanent failure is marked processed.

### Story 5.3: Fulfilment and access provisioning
**Covers:** K-06, K-07, FR15, FR16, DV-4 · **Tags:** `@webhook @checkout` · **After:** 5.2, 4.4
- **Given** a paid package session, **then** client, project (AWAITING_BRIEF), entitlements, order (with campaign slug), user, profile and membership are created. A setup or sign-in email and the admin new-project email are each sent once.

### Story 5.4: Checkout success, continue and resend
**Covers:** K-02, K-03, K-04 · **Tags:** `@checkout` · **After:** 5.3, 1.9
- **Given** a pending order, **then** status returns only `{fulfilled:false,status:"PENDING"}`. Resend limits hold across processes. The screens follow UX J1 (troubleshooting at 45 s).

### Story 5.5: Upsell checkout and additive fulfilment
**Covers:** K-08, K-09, DV-2, FR17, FR18 · **Tags:** `@upsell @deviation` · **After:** 5.3
- **Given** Essential with 1 bought add-on (limits 1/2), **when** an upgrade to Professional is fulfilled, **then** the limits are 2/3 and consumed/reserved are unchanged.

### Story 5.6: Post-purchase confirmation
**Covers:** K-10, FR19 · **Tags:** `@upsell` · **After:** 5.5, 6.2
- **Given** a return with `?upsell=1&session_id`, **then** the banner moves through confirming → confirmed and survives a refresh.

### Story 5.7: Admin reprocess with full follow-up
**Covers:** K-12, DV-6, FR21, ADR-015 · **Tags:** `@admin @webhook @deviation` · **After:** 5.3
- **Given** a fulfilled-but-unemailed session, **when** it's reprocessed, **then** the customer and admin emails are sent once. Reprocessing again sends nothing new.

### Story 5.8: Invoices and receipts
**Covers:** K-11, C-18, D-19, FR20 · **Tags:** `@invoices` · **After:** 5.3
- **Given** the resolver's test cases (Stripe fakes), **then** the documents chosen match Next.

---

## Epic E6: Customer portal (new design)
Every screen is built to the UX spec §14 priority order and §12 patterns, with L7 and L7a green.

### Story 6.1: Projects home and one-project shortcut
**Covers:** C-01, FR23, UX §5.3 · **Tags:** `@client` · **After:** 1.9, 4.8
- **Given** exactly one project, **when** the customer signs in, **then** they land on its Overview. `/dashboard` still works. With two or more projects, the list shows turn pills and new-dots.

### Story 6.2: Project snapshot API and Overview
**Covers:** C-02, C-03, C-16, FR24, FR58, UX §2.5 · **Tags:** `@client @contract` · **After:** 2.3, 3.4
- **Given** each seed scenario, **then** the snapshot JSON matches the schema, and the Overview shows the correct turn banner, primary action, stage tracker and allowances (used / in progress / left).

### Story 6.3: Upsell panel
**Covers:** C-04 · **Tags:** `@upsell` · **After:** 6.2, 5.5
- **Given** no revisions remaining, **then** the add-on and eligible upgrade appear with their prices, and "Not now" snoozes for 24 h.

### Story 6.4: Brief wizard and drafts
**Covers:** C-05, C-06, FR25 · **Tags:** `@brief` · **After:** 6.2
- **Given** typing in a field, **then** the draft saves within about 1 s to the server and the device, and the status is visible. A reload restores it. Step gating follows the required fields.

### Story 6.5: Brief submission and read-only brief
**Covers:** C-07, N-13, N-15 · **Tags:** `@brief` · **After:** 6.4
- **Given** the confirmation dialog without the checkbox ticked, **then** sending is disabled. On submit, the brief is version 1, the status is BRIEF_SUBMITTED, the system message is posted and the draft deleted.

### Story 6.6: Concepts gallery and concept viewer
**Covers:** C-08, C-09, FR26, DV-7 · **Tags:** `@concepts @deviation` · **After:** 6.2, 3.4
- **Given** a draft concept's ID, **then** the assets endpoint returns 404 `CONCEPT_NOT_FOUND`. Published concepts show every version.

### Story 6.7: Comments and revision requests
**Covers:** C-10, C-11, K-14, FR27, FR28 · **Tags:** `@concepts @revisions @deviation` · **After:** 6.6
- **Given** 2 revisions left, **then** the composer previews "This uses 1 of your 2 revisions". The reservation is atomic under concurrency (L3), and the admin email is sent.

### Story 6.8: Approval
**Covers:** C-12, FR29, N-07, N-08 · **Tags:** `@approval` · **After:** 6.6
- **Given** approval is confirmed, **then** the other concepts are archived, the status is AWAITING_APPROVAL, and the two emails are sent once each.

### Story 6.9: Messages and read state
**Covers:** C-14, C-15, FR31, FR32, X-16 · **Tags:** `@messages` · **After:** 6.2
- **Given** a new designer message, **then** the Messages tab shows a dot until it's viewed. System messages appear as event lines. The dedup-by-body rule holds.

### Story 6.10: Files tab and final download
**Covers:** C-13, FR30 · **Tags:** `@finals` · **After:** 6.2, 3.1
- **Given** FINAL_FILES_READY, **when** the customer downloads, **then** a signed URL with the `{brand}-{date}.zip` disposition is returned and the status becomes DELIVERED. Concurrent changes return 409.

### Story 6.11: Account, theme and invoices
**Covers:** C-17, C-18, C-19, FR33 · **Tags:** `@settings @invoices @visual` · **After:** 4.7, 5.8
- **Given** a name update, **then** the profile is saved (max 80, trimmed). Theme choice persists. The invoice list matches the resolver.

---

## Epic E7: Admin portal (new design)

### Story 7.1: Admin queue
**Covers:** D-01, FR35 · **Tags:** `@admin` · **After:** 1.9, 2.3
- **Given** mixed scenarios, **then** the order follows the urgency score and each row shows its reason chips.

### Story 7.2: Project workspace overview and properties
**Covers:** D-02, FR36, FR58 · **Tags:** `@admin` · **After:** 7.1, 6.2
- **Given** an open workspace, **then** it polls every 2 s without flicker (DV-12) and the properties column shows client, package, allowances and order.

### Story 7.3: Status actions (hold, cancel, resume)
**Covers:** D-03, FR37 · **Tags:** `@admin @state` · **After:** 7.2, 2.4
- **Given** a status other than ON_HOLD, CANCELLED or RESUME, **then** the response is 400 `DOMAIN_ACTION_REQUIRED`. Resume to a phase whose evidence is missing returns 409 `INVALID_HOLD_RESUME`.

### Story 7.4: Brief view
**Covers:** D-04, FR38 · **Tags:** `@admin @brief` · **After:** 7.2

### Story 7.5: Concept upload, replace and revision upload
**Covers:** D-05, D-10, X-13, X-19, DV-9, FR39, FR41 · **Tags:** `@admin @concepts @uploads @pg-race @deviation` · **After:** 3.1, 3.2, 7.2
- **Given** a retried upload with the same `requestKey`, **then** the response is replayed and there's no duplicate. A different digest returns 409 `REQUEST_KEY_MISMATCH`. A revision upload delivers the pending requests and sends one N-05 email.

### Story 7.6: Publish draft and delete concept
**Covers:** D-06, D-07, FR40 · **Tags:** `@admin @concepts` · **After:** 7.5

### Story 7.7: Feedback inbox and mark delivered
**Covers:** D-08, D-09, FR41 · **Tags:** `@admin @revisions` · **After:** 7.5

### Story 7.8: Finals upload, replace, notify and download
**Covers:** D-11, D-12, D-13, DV-11, DV-13, FR42 · **Tags:** `@admin @finals @deviation` · **After:** 3.3, 7.2
- **Given** a replacement in DELIVERED, **then** the newest file is served and the old signed URL still works until it expires. Errors use the standard shape (DV-11).

### Story 7.9: Entitlement override and clean-slate reset
**Covers:** D-14, D-15, FR43, FR44 · **Tags:** `@admin @entitlements` · **After:** 7.2
- **Given** a reset confirmed with the typed project name, **then** work and usage are cleared, files are kept, and the audit row lists what was retained. The legacy reset endpoint still returns 409.

### Story 7.10: Audit log and admin messages
**Covers:** D-16, D-17, FR45, FR46 · **Tags:** `@admin @audit @messages` · **After:** 7.2

### Story 7.11: Health
**Covers:** D-18, FR47 · **Tags:** `@admin @ops` · **After:** 7.2, 3.1
- **Given** SeaweedFS is down, **then** the storage checks fail without diagnostics or secrets.

---

## Epic E8: Notifications verification

### Story 8.1: Lifecycle email system
**Covers:** N-04…N-12, N-14, X-18, DV-8, FR49, FR50 · **Tags:** `@email` · **After:** built incrementally in E5–E7; this story finalises it
- **Given** a Postmark transport failure, **then** the job retries with backoff and the user's action has already succeeded. The marker stops double-sends. Every template matches the design-system email layout in both a light client and a dark client.

### Story 8.2: Email matrix end to end
**Covers:** N-16, all N rows · **Tags:** `@email` · **After:** 8.1
- **Given** the email verification matrix, **then** every trigger produces exactly the documented email (recipient, subject, link) in Mailpit, on both apps (except the DV-9 deviation).

---

## Epic E9: Operations, hardening and cutover

### Story 9.1: Production provisioning (Forge, Hetzner, Cloudflare)
**Covers:** ADR-024, X-05 (L9), O-05 · **After:** E4–E7 feature-complete
- **Given** the production server, **then** the firewall allows 80/443 only from Cloudflare and 22 only from approved IPs. A forged `cf-connecting-ip` sent directly is refused or ignored (L9). HSTS is set.

### Story 9.2: Backups and restore drill
**Covers:** ADR-025, NFR-R4 · **After:** 9.1
- **Given** a scratch server, **when** a restore drill runs, **then** the database and stored files are restored and verified within the RTO target, and the timing is recorded.

### Story 9.3: Observability, alerts and runbooks
**Covers:** ADR-026, O-08, NFR-M2, NFR-O1 · **After:** 9.1
- **Given** a failed job or a stale backup, **then** an email reaches the owner. Runbooks exist for deploy, PHP patching, the webhook, R2, backups and the auth proxy.

### Story 9.4: Pre-cutover verification
**Covers:** test strategy §5 (pre-cutover), NFR-P1/P2, NFR-A3, NFR-S5/S6 · **After:** 9.1–9.3
- **Given** three consecutive full parity runs, 7 nights of L3, a clean audit, the usability tests and the performance budgets, **then** all are green and recorded.

### Story 9.5: Launch and archive
**Covers:** release gates (plan §6) · **After:** 9.4
- **Given** the owner-run gates (secrets, admin bootstrap, live R2 acceptance, the Stripe live webhook on `2026-02-25.clover`, DNS), **then** the portal is live. `apps/web` is archived by a logged decision.

## Final validation

- Every FR (1–58) maps to at least one story (the coverage map plus the per-story **Covers**). Every inventory row appears in some story's **Covers**: a check is to be run by script together with the readiness check (3.3).
- The dependency order is acyclic, and E0 precedes all Laravel work.
- The UX spec is covered by 1.7–1.9 (system) and E6/E7 (screens), with L7/L7a in the definition of done.
