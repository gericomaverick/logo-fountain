---
stepsCompleted: [validate-prerequisites, design-epics, create-stories, final-validation]
inputDocuments: [prd.md, architecture.md, adr/, ux-design.md, 01-feature-inventory.md, 02-test-strategy.md, test-port-ledger.md, brownfield/, reports/readiness-report.md]
workflow: bmad-bmm-create-epics-and-stories (BMAD step 3.2)
status: v2 (2026-11-18). Readiness findings C1, M1–M13 and the minor items applied
date: 2026-11-18
---

# Logo Fountain portal on Laravel: epic breakdown

## Overview

There are 10 epics and 94 stories, in dependency order. Technical epics (Epic 0–3, 8, 9) and a single schema story (2.1) are deliberate. This is a parity-gated brownfield rewrite, so the test harness and foundations come first. Full story files are generated from this list by BMAD `create-story` into `stories/`. The acceptance criteria here are the **minimum**. The story file adds the full brownfield behaviour (every code, limit and copy string) from the cited docs.

**Notation:** each story lists:
- **Covers:** inventory IDs and FRs.
- **Gate:** the exact parity-suite tag expression that must pass, which goes into `tests/parity/converted-tags.txt`.
- **After:** its dependencies.

Layer tags (test strategy §3):
- `@unit`: Pest/Vitest L1;
- `@api`: L4/L6 HTTP;
- `@ui`: L5 browser;
- `@pg-race`: L3;
- `@visual`: L7/L7a;
- `@deviation`: a DV- row.

A tag expression enters `converted-tags.txt` only when every test it selects has its prerequisites built.

### Definition of done: three variants (replace the single DoD)

| Variant | Applies to | Must be true |
|---|---|---|
| **E0 (spec)** | Epic 0 | The story's gate is green **on Next**, except the entries in `tests/parity/expected-next-failures.txt`, which must fail. Inventory **Tag** and **Tests** columns are filled in, and the status stays `Not started`. Story record and handoff updated. Pushed |
| **Laravel-only** | stories whose gate is only `@unit`, `@pg-race`, `@visual` or Pest (no Next counterpart) | The gate is green on Laravel, plus the full Laravel suite. Ledger rows resolved. Inventory `Verified` where the story completes a row. Story record, handoff, pushed |
| **Conversion** | stories with `@api` or `@ui` gates | The gate is green on Laravel **and** the Next result equals `expected-next-failures.txt` (deviation tests fail on Next, everything else passes). Every earlier gate is still green on Laravel. **Laravel page-object methods** used by the story's journeys are implemented in `tests/parity/pages/laravel/` (accessible locators first; `data-testid` only in Laravel objects; shared journeys unchanged). Ledger rows resolved, inventory `Verified`, story record, handoff, pushed |

## Requirements inventory

- Functional: **FR1–FR58** (`prd.md` §6).
- Non-functional: **NFR-S1…S6, R1…R5, P1…P2, A1…A4, M1…M4, O1** (`prd.md` §7).
- Additional: ADR-001…028 (`architecture.md`), the UX spec §§1–16, and test layers L0–L9.

### FR coverage map

| FRs and NFRs | Stories |
|---|---|
| FR1–FR11 | 4.1–4.9b |
| FR12–FR22 | 5.1–5.7, 6.4 |
| FR23–FR34 | 6.1–6.12 |
| FR35–FR48 | 7.1–7.11 |
| FR49–FR50 | 2.7 (pipeline), 4.4 (base layout), feature stories, 8.1–8.2 (verification) |
| FR51–FR54 | 3.1–3.4, 6.7, 7.5a |
| FR55–FR57 | 0.2, 1.1a, 1.3, 9.1 |
| FR58 | 1.8c (`usePolling`), 5.4, 6.2b, 7.2, 7.10 |
| NFR-S1…S6 | 1.4, 1.5, 1.6, 2.5, 0.7d, 9.1, 9.4c |
| NFR-R1…R5 | 2.4, 2.7, 5.2, 6.8, 9.2 |
| NFR-P1…P2 | 1.9, 9.4a |
| NFR-A1…A4 | 1.7–1.9, every UI story, 9.4b |
| NFR-M1…M4 | 1.1a, 1.2, every story, 0.7a–c |
| NFR-O1 | 9.3 |

## Epic list

| # | Epic | Stories |
|---|---|---|
| Epic 0 | Parity harness on Next.js | 0.1–0.9 (16) |
| Epic 1 | Laravel foundations and design system | 1.1a–1.9 (12) |
| Epic 2 | Data layer and domain core | 2.1–2.7 (7) |
| Epic 3 | Private storage and upload validation | 3.1–3.4 (4) |
| Epic 4 | Authentication and identity | 4.1–4.9b (10) |
| Epic 5 | Checkout, payments and entitlements | 5.1–5.7 (7) |
| Epic 6 | Customer portal (new design) | 6.1–6.12 (13) |
| Epic 7 | Admin portal (new design) | 7.1–7.11 (14) |
| Epic 8 | Notifications verification | 8.1–8.2 (2) |
| Epic 9 | Operations, hardening and cutover | 9.1–9.5 (8) |

---

## Epic 0: Parity harness on Next.js
Build the black-box suite and make it green against today's app before any Laravel code exists. It's the executable specification. **DoD variant: E0.**

### Story 0.1: Parity suite scaffold
As the team, I want `tests/parity/` (Playwright 1.64) with target adapters, `pages/next|laravel/`, `journeys/`, tag conventions and `expected-next-failures.txt`, so that one suite drives either app.
**Covers:** test strategy §3 · **Gate:** `@smoke` · **After:** none
- **Given** `PARITY_TARGET=next`, **when** `--grep @smoke` runs, **then** it targets `PARITY_BASE_URL`. A lint rule forbids journeys from importing `pages/next|laravel` directly. Test titles must start with inventory IDs (checked).
- **Given** a test listed in `expected-next-failures.txt` that passes on Next, **then** the run fails.

### Story 0.2: Test infrastructure stack
As the team, I want `docker-compose.test.yml` with postgres 18 (an init script creating `lf_parity` and the `parity_marker` table), Mailpit, SeaweedFS (bucket bootstrap), **stripe-fake** and **postmark-shim**, so that both apps test against identical, offline infrastructure.
**Covers:** O-01, O-03, FR55 · **Gate:** n/a (infra) · **After:** 0.1
- **Given** the stack, **when** the probe PUTs one key twice with `If-None-Match: *`, **then** SeaweedFS returns 412. If not, record the fallback (L3 stub plus an L9 live check) in test strategy §3 and log a risk.
- **Given** `POST postmark-shim/email`, **then** the message appears in Mailpit. `POST /__fail` makes the next send return 500.
- **stripe-fake** implements the endpoints both apps call:
  - Checkout Session create, retrieve and line items;
  - customers retrieve;
  - invoices retrieve;
  - payment intents retrieve with `latest_charge`;
  - accounts retrieve.

  It's driven by fixtures in `tests/parity/fixtures/stripe/`, with a fake hosted-checkout page that "pays" or "fails" a session and posts a correctly **signed** webhook (current timestamp, test secret) to the target app.

### Story 0.3: Next.js test seams (freeze exceptions)
As the team, I want minimal Next seams that are inert unless `PARITY_MODE=1`, so that Next runs on the shared stack without touching production paths.
**Covers:** O-09 (new) · **Gate:** `@unit` (Vitest for the seams) · **After:** 0.2
- Seams, each about 10 lines:
  - (a) a `POSTMARK_API_URL` override in `lib/auth/mail.ts` and `lib/project-lifecycle-email.ts`, pointing at postmark-shim;
  - (b) `R2_ENDPOINT` plus `forcePathStyle` in `lib/storage/r2.ts`, with SeaweedFS at a host the browser can also reach;
  - (c) `STRIPE_API_BASE` (host, port, protocol) in `lib/stripe.ts` **and** the second client in `api/admin/health/route.ts`;
  - (d) `scripts/parity-seed.mjs` (0.4).
- **Given** `PARITY_MODE` unset, **then** each seam is inert (Vitest), and the existing 614 unit tests still pass.
- Inventory row O-09 lists each seam and file, with a DECISIONS entry approving them.

### Story 0.4: Seed scenarios (Next)
As the team, I want `npm run parity:seed -- <scenario>` for the 13 scenarios, defined once in `tests/parity/fixtures/scenarios/*.json` (reused by 2.6), so that tests start from known states.
**Covers:** O-02 · **Gate:** `@unit` · **After:** 0.2, 0.3
- **Given** any of: `PARITY_MODE` unset; a DB host other than `127.0.0.1`, `localhost` or `postgres`; a DB name other than `lf_parity`; or no `parity_marker` table, **then** the seed refuses (each case unit-tested).
- **Given** `two-tenants`, **then** clients A and B exist with known credentials and distinct projects.

### Story 0.5: Stripe fixtures and webhook scenarios
As the team, I want stripe-fake fixtures for every purchase scenario (package, add-on, upgrade, unpaid, delayed success or failure, missing email, multi-line-item), so that webhook and checkout behaviour is deterministic and runs offline.
**Covers:** K-01, K-05, K-06 · **Gate:** `@webhook&@api` · **After:** 0.2, 0.3, 0.4
- **Given** a fixture event POSTed twice, **then** the second response is `deduped`. A bad signature returns 400. An unpaid session isn't fulfilled. A transient failure is followed by a successful retry.
- Optional `@stripe-live-test` (excluded from CI) uses real Stripe test mode with the owner's test key. It's an owner-run check, no blocker.

### Story 0.6a: Golden upload corpus
**Covers:** X-12 · **Gate:** `@uploads&@unit` · **After:** 0.1
- **Given** each corpus file (valid and malicious PNG, JPEG, WebP and ZIP; the boundaries at exactly 10 MiB, 40,000,000 pixels and the ZIP limit), **then** Next's validator returns the recorded code, read by Vitest from the shared files.

### Story 0.6b: Shared rule fixtures
**Covers:** X-07, A-13, C-05, C-03 · **Gate:** `@unit` · **After:** 0.1
- JSON fixtures for the state-machine transitions and reason rules, the `safeAuthNextPath` cases, brief normalisation and validation, display and overview status, and entitlement usage. Next's Vitest suite asserts every case.

### Story 0.7a: Contract suite: auth, checkout, webhook
**Covers:** A-01…A-18, K-01…K-05, X-03 · **Gate:** `@auth&@api`, `@checkout&@api` · **After:** 0.4, 0.5
- **Given** each endpoint, **then** status, `error.code`, headers (no-store, no-referrer) and cookies match the brownfield spec.

### Story 0.7b: Contract suite: client project endpoints, plus the snapshot schema
**Covers:** C-02…C-17, X-03 · **Gate:** `@client&@api`, `@concepts&@api`, `@brief&@api`, `@messages&@api` · **After:** 0.4
- The snapshot JSON-schema (every key and type) is asserted for each scenario. Additive `imageKey` is allowed (DV-12).

### Story 0.7c: Contract suite: admin endpoints
**Covers:** D-01…D-19, K-12 · **Gate:** `@admin&@api` · **After:** 0.4, 0.5

### Story 0.7d: Authorisation matrix plus DV-7
**Covers:** C-20, D-20, A-16, X-01, DV-7 · **Gate:** `@authz&@api`, `@security&@api` · **After:** 0.7a–c
- The generated matrix covers every endpoint × {anonymous, client A, client B, admin} × (client routes) concept status {draft, deleted, archived, published, approved}.
- Every mutation without a canonical Origin returns `403 INVALID_ORIGIN`.
- The DV-7 `@deviation` tests are listed in `expected-next-failures.txt`.

### Story 0.8a: Page objects, adapters, journeys 1–2
**Covers:** K-02, A-06, N-01, N-02, C-01 · **Gate:** `@checkout&@ui`, `@auth&@ui` · **After:** 0.5, 0.7a
- `pages/next/*`, the mail adapter (Mailpit), the storage adapter. Journey 1: buy → success → setup email → set password → project. Journey 2: a returning customer gets a sign-in link.

### Story 0.8b: Journeys 3–6: brief, concepts, revisions, upsell
**Covers:** C-03…C-11, K-08…K-10, K-14, N-04, N-05, N-12, D-06, D-09 · **Gate:** `@brief&@ui`, `@concepts&@ui`, `@revisions&@ui`, `@upsell&@ui` · **After:** 0.8a

### Story 0.8c: Journeys 7–11: approval, finals, messages, settings, reset and logout
**Covers:** C-12…C-18, A-02, A-07…A-09, N-06…N-09, N-11 · **Gate:** `@approval&@ui`, `@finals&@ui`, `@messages&@ui`, `@settings&@ui` · **After:** 0.8a

### Story 0.8d: Admin journeys 12–18
**Covers:** D-01…D-18, K-12, X-07, X-08, X-13 · **Gate:** `@admin&@ui` · **After:** 0.8a

### Story 0.8e: Abuse cases 19–23 and every remaining deviation test
**Covers:** X-01, A-13, X-06, X-12, K-05, DV-1, DV-2, DV-4…DV-6, DV-8, DV-9, DV-11…DV-13, DV-UX (landing URLs and redirects) · **Gate:** `@security&@ui`, `@deviation` · **After:** 0.8b–d
- Every DV row has at least one `@deviation` test, and all of them are in `expected-next-failures.txt`.

### Story 0.9: Coverage gate, CI parity job, baseline
**Covers:** test strategy §5 · **Gate:** the full suite · **After:** 0.8e
- **Given** an inventory row (other than O-series) with neither a parity test nor a recorded Laravel-only destination (L1–L3, L7) in the ledger or inventory, **then** the coverage script fails. The same applies to a DV row without a `@deviation` test.
- The CI `parity` job runs on Next. `handoff.md` records the baseline from **3 consecutive green runs**, and the "Verify the baseline" commands are re-run and recorded.

---

## Epic 1: Laravel foundations and design system

### Story 1.1a: Skeleton, compose, pins
**Covers:** ADR-001, 002; O-01; NFR-M1 · **Gate:** Pest (Laravel-only) · **After:** 0.2
- **Given** a fresh clone, **when** `docker compose up` runs, **then** `/up` responds. Pest, **Larastan level 9** and Pint pass. Versions match `research-technical.md` §2 (with PHP 8.5 at ≥ the 2026-11-19 security patch).

### Story 1.1b: CI workflow
**Covers:** ADR-028, O-04, NFR-S3 (log grep) · **After:** 1.1a
- Jobs:
  - `laravel-ci` (Pint, Larastan, Pest including the L3 group);
  - `audit` (`composer audit`, `npm audit --omit=dev`, the ported security check);
  - a log grep that fails on token and signed-URL patterns in test logs.

### Story 1.2: Agent guide and project context
**Covers:** NFR-M2 · **After:** 1.1a
- **Given** `apps/portal/AGENTS.md`, **then** it lists every architecture §5 rule plus the DoD variants, and `docs/laravel-migration/project-context.md` exists (BMAD `generate-project-context`).

### Story 1.3: Config validation and canonical origin
**Covers:** X-04, O-05, O-07, A-17 (config), FR57 · **Gate:** Pest · **After:** 1.1a
- **Given** production with an http `PUBLIC_SITE_URL`, **then** mutations return `503 PUBLIC_SITE_URL_REQUIRED` and auth returns `503 AUTH_UNAVAILABLE`. **Given** the runtime and migrate DB users are equal, **then** boot fails in production.

### Story 1.4: Origin guard as the CSRF control
**Covers:** X-01, ADR-008, NFR-S1 · **Gate:** `@security&@api` · **After:** 1.3
- **Given** `Origin: null`, **then** `403 INVALID_ORIGIN` even with a valid Referer. The guard runs before session, auth and body parsing.
- Exempt (verified against `brownfield/auth-and-security.md` §5): `POST /api/stripe/webhook`, `POST /api/checkout/magic-link`, `POST /api/checkout/resend-magic-link`, `GET /checkout/start`, all GETs, `/api/health`.
- `/api/*` is excluded from `PreventRequestForgery`. The arch test fails if a non-exempt mutating route lacks the guard.

### Story 1.5: Trusted client address
**Covers:** X-05, ADR-010 · **Gate:** Pest · **After:** 1.3
- Every `client-address.test.ts` case is ported. A list value or invalid IP gives an unknown address.

### Story 1.6: Error shape, security headers, auth JSON boundary, log scrubber
**Covers:** X-02, X-03, X-14, A-17, ADR-027, NFR-S3 · **Gate:** `@contract&@api` (headers and shape) · **After:** 1.1a
- Domain exceptions render `{error:{message,code,details?}}`. Headers per X-02. The auth endpoints enforce JSON-only, the streamed 8 KiB cap and generic errors. The log processor redacts tokens, signed URLs and secrets (Pest).

### Story 1.7: Design tokens and theming
**Covers:** C-19, NFR-A4, ADR-022, UX §8 · **Gate:** `@visual` · **After:** 1.1a
- **Given** system dark mode, **then** the first paint is dark (Playwright with emulated `prefers-color-scheme`). The UX §8.1 contrast pairs are asserted by a unit test. Inter, Sfizia and Geist Mono are self-hosted.

### Story 1.8a: Form and action primitives
**Covers:** UX §11 · **Gate:** `@visual` · **After:** 1.7
- Button, Link, Field, Input, Textarea, Select (Radix), Checkbox, Radio, Choice chips, Dialog and Confirm (including acknowledgement and type-to-confirm), Menu, Sheet, Toast, Inline alert.
- Every variant and state is in `/dev/ui` in both themes. axe finds no serious issues. Dialog traps and restores focus.

### Story 1.8b: Status components
**Covers:** UX §2.5, §11 · **Gate:** `@visual` · **After:** 1.8a
- Turn banner (5 turns plus celebration), Status pill, Stage tracker (horizontal and vertical, terminal states), Allowance meter (used, in progress, left, unlimited), Empty state, Skeleton.

### Story 1.8c: Media, data components and `usePolling`
**Covers:** UX §11, FR58, ADR-023 · **Gate:** `@visual`, `@unit` · **After:** 1.8a
- Concept card and viewer, File card, Upload dropzone (all states, limits shown), Thread, Data table, Properties panel.
- `usePolling`: **given** 3 consecutive failures, **then** a non-blocking "Reconnecting…" notice appears and polling continues with backoff. **Given** a hidden tab, **then** it pauses. **Given** new items, **then** they're announced via `aria-live=polite` without moving focused content (Vitest with fake timers).

### Story 1.9: App shells, design lint, UI CI job, Lighthouse
**Covers:** UX §5, L7/L7a/L7b, NFR-P2 · **After:** 1.8b, 1.8c
- A raw hex colour or pixel font size in a component fails CI. The customer shell (top bar, tabs, phone bottom bar) and the admin shell (sidebar, workspace, properties column) render.
- The CI `ui` job runs Vitest, tsc, ESLint plus the design lint, L7 and L7a, and a `lighthouse` job (mobile preset, median of 3) on a seeded page.

---

## Epic 2: Data layer and domain core

### Story 2.1: Schema migrations and roles
**Covers:** X-15, A-19, O-06, ADR-012/013 · **Gate:** `@pg-race` · **After:** 1.1a
- **Given** the runtime connection, **when** `profiles.is_admin` is updated, **then** Postgres raises. Email checks are enforced. The grants script revokes runtime access to `migrations` and `auth_admin_bootstrap`. FK behaviours match the brownfield table.
- Roles: **two** (runtime and migrate). The `pgsql_limits` connection uses the **runtime** role (ADR-009).

### Story 2.2: Models, policies, client concept scope
**Covers:** C-20, D-20, DV-7, ADR-020 · **Gate:** Pest (arch plus unit) · **After:** 2.1
- **Given** a draft concept, **then** no client-path query returns it. The arch test forbids unscoped concept and file queries in client controllers.

### Story 2.3: Project state machine and display status
**Covers:** X-07, C-03 (status) · **Gate:** `@unit` · **After:** 2.1, 0.6b
- The PHP `ProjectState` agrees with every case in the shared fixture.

### Story 2.4: Transactions, locks, versioning, audit
**Covers:** X-08, X-09, X-17, ADR-011, NFR-R3 · **Gate:** `@pg-race` · **After:** 2.1
- **Given** two concurrent `Db::serializable` writers, **then** one retries or gets 409, and the state is consistent. Forced 40001/40P01 errors are retried. **A nested call throws.** `Audit::record` scrubs tokens and URLs.

### Story 2.5: Shared rate-limit store
**Covers:** X-06, ADR-009, NFR-S4 · **Gate:** `@pg-race`, `@unit` · **After:** 2.1
- `RateLimits` runs only on the `pgsql_limits` connection (single-statement upsert, sha256 keys). It asserts `DB::connection('pgsql_limits')->transactionLevel()===0`. Auth actions call it **before** `Locks::credential()`.
- **Given** a failed login whose fence transaction rolls back, **then** the failure still counts. **Given** N parallel processes on one key, **then** exactly `cap` succeed.
- Window, cap and clear-on-success semantics match the `rate-limit.ts` tests.

### Story 2.6: Laravel seed scenarios
**Covers:** O-02 · **Gate:** Pest · **After:** 2.2, 0.4
- **Given** each scenario JSON from `tests/parity/fixtures/scenarios/`, **then** `php artisan parity:seed` produces the same logical facts as the Next seed. That's checked by a shared SQL assertion script run against each app's database (per-table counts plus key fields). The same guard rules as 0.4 apply.

### Story 2.7: Lifecycle mail pipeline (new)
**Covers:** X-18, DV-8, N-14 (base), NFR-R5 (lifecycle half), ADR-018/019 · **Gate:** Pest · **After:** 2.4, 1.1a
- `LifecycleMail::sendOnce(type, project, …)` checks and writes the `email_sent:*` marker, dispatches a queued mailable `afterCommit`, and retries with backoff (10/60/300 s). It returns `sent`, `already_sent` or `skipped`.
- The base branded layout comes from 4.4 when it's built. Until then, a minimal base exists here.
- **Given** a failing transport, **then** the user's action is committed and the job retries. **Given** a second call for the same event, **then** `already_sent`.

---

## Epic 3: Private storage and upload validation

### Story 3.1: Private object store
**Covers:** X-10, X-11, ADR-016 · **Gate:** `@storage&@unit`, `@pg-race` · **After:** 1.1a, 0.2
- **Given** an existing key, **then** a re-upload maps the 412 to a collision and the bytes are unchanged. If 0.2 recorded the fallback, this runs at L3 with the stub and the HTTP check moves to L9.
- Presign expiry outside 1–3600 throws. The disposition cases are ported. `HeadBucket` health works.

### Story 3.2: Image validator
**Covers:** X-12 (images) · **Gate:** `@uploads&@unit` · **After:** 0.6a
- Every corpus image gives the same code as Next. The size check happens before the bytes are read. (The HTTP subset is gated in 7.5a.)

### Story 3.3: ZIP validator
**Covers:** X-12 (ZIP), DV-13 · **Gate:** `@uploads&@unit` · **After:** 0.6a
- Every corpus ZIP gives the same code. 95,000,001 bytes gives `FILE_TOO_LARGE` (DV-13). The arch test forbids `ZipArchive`. (The HTTP subset is gated in 7.8a.)

### Story 3.4: Stable private images
**Covers:** DV-12, ADR-021 · **Gate:** `@unit` · **After:** 1.8c, 3.1
- **Given** an unchanged `imageKey`, **then** the rendered `src` is unchanged. **Given** a URL within 5 minutes of expiry, **then** it refreshes (component test).

---

## Epic 4: Authentication and identity

### Story 4.1: Sessions with an absolute cap
**Covers:** A-03, A-04, ADR-005, FR7 · **Gate:** `@auth&@api` (session endpoint) · **After:** 1.6, 2.1
- **Given** a session 7 days and 1 second old, **then** `{authenticated:false}`. A DB failure returns `503 SESSION_VERIFICATION_UNAVAILABLE`. In production config the cookie is `__Host-lf_session`, Secure, HttpOnly and SameSite=Lax.

### Story 4.2: Credential fence and proofs
**Covers:** A-10, A-11, ADR-007, FR10 · **Gate:** `@pg-race` · **After:** 2.4
- The L3 ports of the auth PG integration tests pass: concurrent reset/reset and reset/change leave one winner, and stale proofs are dead.

### Story 4.3: Login
**Covers:** A-01, FR1 · **Gate:** `@auth&@api` (login) · **After:** 4.1, 4.2, 2.5
- Wrong password, unknown account, unverified mailbox and a rate limit all return the same `400 INVALID_CREDENTIALS`. Success clears the failure bucket and regenerates the session.

### Story 4.4: Auth link requests, auth emails, base mail layout
**Covers:** A-06, A-11, N-01, N-02, N-03, N-14 (base layout), ADR-018 · **Gate:** `@auth&@api` (link endpoints), `@email&@api` (auth emails) · **After:** 4.2, 2.7
- **Given** a Postmark failure (postmark-shim `/__fail`), **then** the proof is deleted and the fixed error returned, with no link in the logs. Setup degrades to magic when a password exists.
- This story creates the **base branded mail layout** reused by 2.7 and 8.1. Subjects and copy are as specified.

### Story 4.5: Magic-link confirm
**Covers:** A-05, A-18, FR2 · **Gate:** `@auth&@api` (verify) · **After:** 4.4
- Nothing is consumed until the confirm POST. The token shape is validated.

### Story 4.6: Forgot, reset and set password
**Covers:** A-07, A-08, FR3, FR4 · **Gate:** `@auth&@api` (forgot, reset) · **After:** 4.4
- A reset deletes all sessions and proofs, marks the email verified, increments `credential_version`, writes the audit row, and doesn't sign the user in. Unknown emails get the anti-enumeration response.

### Story 4.7: Change password and logout
**Covers:** A-02, A-09, FR5, FR6 · **Gate:** `@auth&@api`, `@settings&@api` · **After:** 4.3
- A change ends every session including the current one, with `{ok:true, signedOut:true}`. Logout is confirmed by a fresh session check.

### Story 4.8: Safe-next, route guards, endpoint allowlist
**Covers:** A-13, A-14, A-15, A-16 · **Gate:** `@authz&@api` (auth part), `@unit` · **After:** 4.1, 0.6b
- **Given** `next=/%2f%2fevil.com`, **then** `/dashboard`. The route list has only the documented auth routes. `/` redirects to `/login`.

### Story 4.9a: Admin bootstrap CLI
**Covers:** A-12, FR9 · **Gate:** Pest · **After:** 4.6, 2.1
- The prepare and grant flow works on `pgsql_migrate` only. It refuses when an admin exists, when the email or UUID don't match, or when the mailbox is unverified. It's single-use.

### Story 4.9b: Auth screens
**Covers:** A-05, A-07, A-08, UX §14 (auth screens) · **Gate:** `@auth&@ui`, `@visual` · **After:** 4.3–4.8, 1.9
- The sign-in, set and reset password, magic-link confirm and forgot-password screens follow the UX spec. Tokens are read from the fragment and stripped from history. Baselines are approved.

---

## Epic 5: Checkout, payments and entitlements

### Story 5.1: Checkout start
**Covers:** K-01, K-13, DV-1, DV-4, DV-5, FR12, FR13 · **Gate:** `@checkout&@api`, `@deviation` (DV-1, DV-5) · **After:** 1.3, 0.5
- **Given** `package_code=complete&campaign_slug=x`, **then** stripe-fake receives a session with `allow_promotion_codes`, both custom fields, invoice creation, canonical-origin URLs and the campaign metadata. A raw price ID is rejected.

### Story 5.2: Webhook ledger and classification
**Covers:** K-05, ADR-014, NFR-R1 · **Gate:** `@webhook&@api`, `@pg-race` · **After:** 2.4, 0.5
- Concurrent duplicate deliveries produce exactly one fulfilment. A transient failure releases the claim. A permanent failure is marked processed. The webhook route has no Origin guard.
- **DV-15:** an unknown session (Stripe 404) and a payment intent reused by a different session are **permanent**: the event is processed, an audit row is written, the admin is emailed with the session reference, and the project or order is flagged stuck. A payment intent reused for the same fulfilled payment returns `deduped`. Gate adds `@deviation` (DV-15).

### Story 5.3: Fulfilment and access provisioning
**Covers:** K-06, K-07, FR15, FR16, DV-4, N-01, N-02, N-10 · **Gate:** `@webhook&@api`, `@email&@api` (checkout emails) · **After:** 5.2, 4.4, 2.7
- A paid package session creates client, project (AWAITING_BRIEF), entitlements (1/1, 2/2, 3/3), the order (with campaign slug), the user, profile and membership. The setup or sign-in email and the admin new-project email are each sent once.

### Story 5.4: Checkout success, continue, resend
**Covers:** K-02, K-03, K-04, FR14, FR58 · **Gate:** `@checkout&@api`, `@checkout&@ui` · **After:** 5.3, 1.9
- The status endpoint returns only `{fulfilled,status}`. The success page polls every 2 s, then every 10 s after 45 s, with troubleshooting and "Retry now". Resend limits hold across processes (2.5).

### Story 5.5: Upsell checkout and additive fulfilment
**Covers:** K-08, K-09, DV-2, DV-5, FR17, FR18 · **Gate:** `@upsell&@api`, `@deviation` (DV-2) · **After:** 5.3
- **Given** Essential with 1 bought add-on (1/2), **when** an upgrade to Professional is fulfilled, **then** 2/3, with consumed and reserved unchanged.
- **DV-15:** **given** an upsell paid with an email other than the client's billing email, **then** the entitlements are applied, no account is provisioned for that email, audit `upsell_buyer_email_mismatch` is written, the admin is emailed once, and the webhook returns 200.

### Story 5.6: Admin reprocess with full follow-up
**Covers:** K-12, DV-6, FR21, ADR-015 · **Gate:** `@admin&@api` (reprocess), `@deviation` (DV-6) · **After:** 5.3
- **Given** a fulfilled but unemailed session, **then** reprocess sends the customer and admin emails once. Reprocessing again sends nothing new. An unpaid session returns `409 CHECKOUT_SESSION_NOT_PAID`.

### Story 5.7: Invoices and receipts API
**Covers:** K-11, FR20 · **Gate:** `@invoices&@api` · **After:** 5.3
- The resolver's cases (stripe-fake invoices, receipts and payment intents) choose the same documents as Next, for the user, project and admin routes.

---

## Epic 6: Customer portal (new design)
Every screen follows UX §14 priority order and §12 patterns. L7 and L7a are green. **DoD: Conversion.**

### Story 6.1: Project list API, home and one-project shortcut
**Covers:** C-01, C-02 (list), FR23, UX §5.3 · **Gate:** `@client&@api` (list), `@client&@ui` (home), `@deviation` (DV-UX landing) · **After:** 1.9, 4.8, 2.3
- `GET /api/projects` matches the contract. With exactly one project, sign-in lands on its Overview. `/dashboard` still works. With two or more, the list shows turn pills and new-dots.
- **Given** an admin opens `/project/{id}`, **then** they land on `/admin/projects/{id}` (`@deviation` DV-UX).

### Story 6.2a: Project snapshot API
**Covers:** C-02, C-16, DV-12 (`imageKey`) · **Gate:** `@client&@api` (snapshot, entitlements) · **After:** 2.3, 3.1
- The snapshot matches the 0.7b schema for every scenario, including `imageKey`.

### Story 6.2b: Project Overview
**Covers:** C-03, FR24, FR58, UX §2.5 · **Gate:** `@client&@ui` · **After:** 6.2a, 1.8b, 1.8c, 3.4
- The right turn banner and primary action per state, the stage tracker, allowances (used / in progress / left) and activity. It polls every 10 s with no image re-download.

### Story 6.3: Upsell panel
**Covers:** C-04 · **Gate:** `@upsell&@ui` · **After:** 6.2b, 5.5
- With no revisions left, the add-on and the eligible upgrade appear with their prices. "Not now" hides the panel for 24 h within the browser session (a `sessionStorage` key with an expiry, as `revision-purchase.tsx` does).

### Story 6.4: Post-purchase confirmation
**Covers:** K-10, FR19 · **Gate:** `@upsell&@ui` · **After:** 6.3
- Returning with `?upsell=1&session_id`, the banner moves through confirming → confirmed (2.5 s polling, then 7 s), survives a refresh, and shows the delayed state.

### Story 6.5: Brief wizard and drafts
**Covers:** C-05, C-06, FR25 · **Gate:** `@brief&@api`, `@brief&@ui` · **After:** 6.2b, 0.6b
- Autosave happens 800 ms after the last change, to the server and to session storage, with the status always visible. Reload restores the draft. Step gating follows the required fields.

### Story 6.6: Brief submission and read-only brief
**Covers:** C-07, N-13, N-15 · **Gate:** `@brief&@api`, `@brief&@ui` · **After:** 6.5
- Sending is disabled until the confirmation checkbox is ticked. On send: version 1, BRIEF_SUBMITTED, the system message, the draft deleted, **no email**.

### Story 6.7: Concepts gallery and viewer
**Covers:** C-08, C-09, FR26, DV-7, DV-12 · **Gate:** `@concepts&@api`, `@concepts&@ui`, `@deviation` (DV-7) · **After:** 6.2b, 3.4, 2.2
- A draft concept ID returns 404 `CONCEPT_NOT_FOUND`. Published concepts show every version. Payloads carry `imageKey`.

### Story 6.8: Comments and revision requests
**Covers:** C-10, C-11, K-14, FR27, FR28, N-12, NFR-R2 · **Gate:** `@concepts&@api`, `@revisions&@api`, `@revisions&@ui`, `@pg-race`, `@deviation` (DV-7) · **After:** 6.7, 2.7
- The composer previews "This uses 1 of your 2 revisions". Reservations stay atomic under parallel requests (L3). The admin email is sent once. Comments send no email.

### Story 6.9: Approval
**Covers:** C-12, FR29, N-07, N-08 · **Gate:** `@approval&@api`, `@approval&@ui` · **After:** 6.7, 2.7
- After confirmation, the other concepts are archived, the status is AWAITING_APPROVAL, and each of the two emails is sent once.

### Story 6.10: Messages and read state
**Covers:** C-14, C-15, FR31, FR32, X-16, N-06, N-11 · **Gate:** `@messages&@api`, `@messages&@ui` · **After:** 6.2b, 2.7
- A new message shows a tab dot until viewed. System lines render as events. Dedup-by-body holds. The client message sends N-11 once.

### Story 6.11: Files tab and final download
**Covers:** C-13, FR30 · **Gate:** `@finals&@api`, `@finals&@ui`, `@invoices&@ui` · **After:** 6.2b, 3.1, 5.7
- Download returns a signed URL with the `{brand}-{date}.zip` disposition. FINAL_FILES_READY → DELIVERED. Concurrent changes give 409. The Files tab lists this project's invoices and receipts.

### Story 6.12: Account, theme and invoices page
**Covers:** C-17, C-18, C-19, FR33 · **Gate:** `@settings&@api`, `@settings&@ui`, `@invoices&@ui` · **After:** 4.7, 5.7, 1.7
- The name is saved (trimmed, max 80). The theme persists. All invoices are listed.

---

## Epic 7: Admin portal (new design)

### Story 7.1: Admin queue
**Covers:** D-01, FR35 · **Gate:** `@admin&@api` (projects list), `@admin&@ui` · **After:** 1.9, 2.3
- Ordered by the urgency score, with reason chips and unread badges. Searchable and filterable. Opening an item lands on the section that needs action.

### Story 7.2: Project workspace overview and properties
**Covers:** D-02, FR36, FR58, K-12 (UI) · **Gate:** `@admin&@ui` · **After:** 7.1, 6.2a, 5.6
- It polls every 2 s with no image flicker. The properties column shows client, package, allowances and order or payment status, with a **Reprocess** action that explains it also sends the customer's email (DV-6).

### Story 7.3: Status actions: hold, cancel, resume
**Covers:** D-03, FR37, X-07 · **Gate:** `@admin&@api` (status), `@state&@ui` · **After:** 7.2, 2.4
- Any other status returns 400 `DOMAIN_ACTION_REQUIRED`. A reason is required for each action. Resuming without the evidence for the target phase returns 409 `INVALID_HOLD_RESUME`.

### Story 7.4: Brief view
**Covers:** D-04, FR38 · **Gate:** `@admin&@ui` (brief) · **After:** 7.2, 6.6
- A submitted brief renders every section and field with its version and date. Before submission, an empty state shows.

### Story 7.5a: Upload a new concept
**Covers:** D-05, D-10, X-13, X-19, FR39, DV-12 · **Gate:** `@admin&@api` (concept upload), `@uploads&@api`, `@pg-race` · **After:** 3.1, 3.2, 7.2, 2.7
- A retry with the same `requestKey` replays the result, with no duplicate. A different digest returns 409 `REQUEST_KEY_MISMATCH`. Ambiguous-commit recovery keeps the object. The advisory lock holds under concurrency. N-04 is sent once.

### Story 7.5b: Replace a concept
**Covers:** D-05 (replace) · **Gate:** `@admin&@api` · **After:** 7.5a
- Replacing a draft consumes a slot. Replacing a published concept updates its notes. Replacing an approved or archived concept returns 409 `CONCEPT_NOT_REPLACEABLE`.

### Story 7.5c: Revision upload
**Covers:** D-08, DV-9, N-05 · **Gate:** `@admin&@api`, `@deviation` (DV-9) · **After:** 7.5a
- The upload delivers every pending request for that concept (reserved → consumed) and sends N-05 **once per upload**.

### Story 7.6: Publish draft and delete concept
**Covers:** D-06, D-07, FR40 · **Gate:** `@admin&@api` · **After:** 7.5a
- Publishing a draft consumes a slot, moves the project to CONCEPTS_READY when it's the first visible concept, posts the system message, and sends N-04 once. Publishing again is idempotent. Deleting writes `concept_deleted` and keeps the objects. A disallowed phase returns 409 `CONCEPT_DELETE_PHASE_GUARD`.

### Story 7.7: Feedback inbox and mark delivered
**Covers:** D-08, D-09, FR41, N-05 · **Gate:** `@admin&@api`, `@revisions&@ui` · **After:** 7.5a, 2.7
- Marking delivered moves reserved → consumed, sends the client email once (per-request marker), and removes the inbox item.

### Story 7.8a: Finals upload and replace
**Covers:** D-11, X-13, DV-11, DV-13, FR42 · **Gate:** `@admin&@api` (finals), `@uploads&@api`, `@deviation` (DV-11, DV-13) · **After:** 3.3, 7.2
- Replacing while DELIVERED serves the newest file, and old signed URLs still work until they expire. Errors use the standard shape. 95,000,001 bytes is rejected.

### Story 7.8b: Notify retry and admin download
**Covers:** D-12, D-13, F-12 · **Gate:** `@admin&@api` · **After:** 7.8a, 2.7
- Notify needs the current `assetId` and `projectUpdatedAt`, otherwise 409. Re-uploading while FINAL_FILES_READY re-notifies (F-12). The admin download doesn't change state.

### Story 7.9: Entitlement override and clean-slate reset
**Covers:** D-14, D-15, FR43, FR44 · **Gate:** `@admin&@api`, `@entitlements&@ui` · **After:** 7.2
- An override needs a reason (1–500 characters) and writes the audit row.
- Reset, confirmed by typing the project name, does all of these:
  - resets the status (BRIEF_SUBMITTED, or AWAITING_BRIEF if there's no brief);
  - deletes the listed records, and optionally the non-system messages;
  - zeroes usage while keeping limits;
  - keeps the stored files;
  - writes an audit row that lists what was retained.
- The legacy entitlements reset endpoint still returns 409.

### Story 7.10: Audit log and admin messages
**Covers:** D-16, D-17, FR45, FR46, FR58, N-06 · **Gate:** `@admin&@api` (audit, messages), `@admin&@ui` · **After:** 7.2, 2.7
- The audit log polls every 2.5 s, filters by type and shows the latest 100. The admin can post in the project thread and reply in a concept thread. N-06 is sent once.

### Story 7.11: Health
**Covers:** D-18, FR47 · **Gate:** `@admin&@api` (health), `@ops&@ui` · **After:** 7.2, 3.1
- With SeaweedFS down, the storage checks fail without diagnostics or secrets. Public `GET /api/health` returns only `{ok:true}`.

---

## Epic 8: Notifications verification

### Story 8.1: Verify every email template
**Covers:** N-04…N-12, N-14, X-18, DV-8, FR49, FR50 · **Gate:** `@email&@api` · **After:** 5.3, 6.6–6.11, 7.5a–7.8b, 7.10
- Every template follows the branded layout in light and dark email clients (Litmus-style screenshots via Mailpit HTML). Subjects, CTAs and links are exact. The marker-based dedupe holds.

### Story 8.2: Email matrix end to end
**Covers:** N-16, all N rows · **Gate:** `@email` (full) · **After:** 8.1
- Every trigger in the email verification matrix produces exactly the documented email in Mailpit on both apps (DV-9 is a deviation).

---

## Epic 9: Operations, hardening and cutover

### Story 9.1: Production provisioning
**Covers:** ADR-024, X-05 (L9), O-05, NFR-S2 · **After:** 6.12, 7.11, 8.2
- The firewall allows 80/443 only from Cloudflare and 22 only from approved IPs. A forged `cf-connecting-ip` sent to the origin is refused (L9). HSTS is set at Cloudflare. SSL is Full (strict) with an Origin CA certificate.

### Story 9.2: Backups and restore drill
**Covers:** ADR-025, NFR-R4 · **After:** 9.1
- Restoring to a scratch server brings back the database (PITR to a chosen timestamp) and the stored files, verified within the RTO, with timings recorded.

### Story 9.3: Observability, alerts, runbooks
**Covers:** ADR-026, O-08, NFR-M2, NFR-O1 · **After:** 9.1
- An alert drill: a failed job, a stale backup and a failing health check each send the owner an email within 1 h. Runbooks exist for deploy, PHP patching, the webhook, R2, backups and the auth proxy.

### Story 9.4a: Performance
**Covers:** NFR-P1, NFR-P2 · **After:** 9.1
- k6 (50 virtual customers plus 1 admin polling) and Lighthouse budgets pass on the production-spec server.

### Story 9.4b: Usability and manual accessibility (owner-run)
**Covers:** NFR-A1, NFR-A3 · **After:** 9.1
- The 5-second test passes 5/5. The J1–J7 tap and click targets are met. VoiceOver, NVDA and keyboard-only passes are complete.

### Story 9.4c: Final parity and security runs
**Covers:** test strategy §5, NFR-S5, NFR-S6 · **After:** 9.1
- 3 consecutive full parity runs, 7 nights of L3, and clean audits.

### Story 9.5a: Owner release gates
**Covers:** plan §6 · **After:** 9.2, 9.3, 9.4a–c
- Done by the owner: secrets, `admin:bootstrap`, the live R2 acceptance, the Stripe live webhook on `2026-02-25.clover`, the PHP patch level, and DNS.

### Story 9.5b: Launch and archive
**After:** 9.5a
- The portal is live. `apps/web` is archived by a logged decision.

## Final validation
- Every FR (1–58) and NFR is mapped (coverage map plus per-story **Covers**). The inventory coverage check is run by script after each edit to this file.
- Dependencies are acyclic, with no forward dependencies across epics (5.6 is now in Epic 6 as 6.4; the project list API is in 6.1).
- Epic 0 precedes all Laravel work. 0.1, 0.2, 0.6a and 0.6b need no owner input.
