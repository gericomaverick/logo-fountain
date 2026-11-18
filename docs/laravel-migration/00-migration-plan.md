# Logo Fountain: Next.js → Laravel migration plan (BMAD)

Status: **Draft v0.1, awaiting owner decisions (§7)**
Created: 2026-11-18
Scope: `apps/web` (client portal, admin portal, checkout/payments backend). `apps/site` (Eleventy marketing) is not in scope.

---

## 1. Goal and definition of done

Replace the Next.js app in `apps/web` with a Laravel app that does **everything the current app does, for clients and for the admin**, with the same security properties. Nothing gets silently dropped, and every feature is proven by automated tests before cutover.

The migration is done when:

1. Every row in `01-feature-inventory.md` is `Verified` (or `Dropped` by a logged decision).
2. The shared parity suite (`02-test-strategy.md` §3) passes in full against Laravel, and the same suite still passes against the Next.js baseline. That shows the tests weren't bent to fit.
3. The Laravel suites (unit, feature, real-Postgres concurrency) pass in CI.
4. The owner-run release gates (§6) are done and recorded.
5. `apps/web` has been archived by a logged decision. Nothing gets deleted without approval.

## 2. Starting point (verified 2026-11-18)

| Area | Current implementation |
|---|---|
| Framework | Next.js 16.4.1 App Router, React 19.2.9, TypeScript, Tailwind 4 |
| Data | Self-hosted PostgreSQL via Prisma 7.10.1 (`@prisma/adapter-pg`), 23 models, 2 migrations (`portable_core`, `brief_drafts`) |
| Auth | Better Auth 1.7.10 (Prisma adapter): email+password, magic link, setup and reset links, custom per-user credential fencing (`src/lib/auth/fence.ts`), `AuthProof`, `credentialVersion`, DB-backed rate limits, one-time admin bootstrap CLI |
| Payments | Stripe Checkout (packages, add-on, upgrades), signed webhook with an idempotent `StripeEvent` ledger, async payment events |
| Storage | Private Cloudflare R2 via the AWS S3 SDK: immutable versioned objects, `IfNoneMatch: *`, presigned GETs only |
| Email | Postmark (auth emails plus about 9 lifecycle emails), sent after commit |
| Surface | 27 pages, 49 API route handlers (§ inventory), 31 client components |
| Code size | About 17k lines of app code, about 10k lines of tests |
| Tests | Vitest 95 files / 614 tests; 18 opt-in real-PG integration tests; Playwright: 3 specs (smoke, client flows, auth golden path) |
| Deployment | **Not live.** The Supabase-exit owner gates (live PG, secrets, R2 acceptance, deploy) were never run, and no customer data exists. See `docs/reports/supabase-exit-5649.md` |

Because nothing is live, **there is no data migration**. Laravel can be a fresh install, which removes the largest risk in most migrations. The assumption is logged in `ASSUMPTIONS.md`. Confirm it in §7.

**Security semantics that must survive the port.** These are documented in `apps/web/docs/security-boundaries.md`, `auth-runbook.md`, `checkout-auth-security.md`, `webhook-delivery-semantics.md`, `upload-lifecycle-hardening.md`, `private-r2-runbook.md`. They're the hardest part of the port, and they're why the test plan below is as heavy as it is. Each one is an inventory row with its own tests (X-series).

## 3. Recommended target stack (to be confirmed in Architecture, ADRs)

| Concern | Recommendation | Why |
|---|---|---|
| Framework | Laravel, the current stable major at solutioning time, on PHP 8.4+ | Pin the exact versions in ADR-001 after technical research, not from memory |
| UI | **Inertia.js + React + TypeScript + Tailwind 4** | Reuses the 31 React components, design tokens and the just-finished premium polish (`globals.css` portal tokens). Blade or Livewire would mean rewriting every screen and re-doing the visual work |
| JSON API | Keep **the same `/api/*` paths, methods, status codes and the `{ error: { message, code?, details? } }` shape** | The client components keep calling them unchanged, and one black-box contract suite can run against both apps |
| Auth | Laravel session guard, **database** session driver, custom actions for setup, magic and reset links, fencing and proofs. No Breeze or Jetstream UI | The app's semantics are stricter than any starter kit: 7-day **absolute** cap (Laravel sessions slide, so this needs middleware), single-use hashed one-hour links, revoking older tokens, credential versions |
| DB | PostgreSQL, Laravel migrations own the schema, snake_case tables | Fresh install, so the schema can follow Laravel conventions. Advisory locks (`pg_advisory_xact_lock`) are ported as-is |
| Payments | `stripe/stripe-php` directly. **Not Cashier** | Cashier is built around subscriptions and customers. This app is one-off Checkout Sessions with a custom idempotent webhook ledger |
| Storage | AWS SDK for PHP (S3 client) against R2 | Flysystem doesn't expose `IfNoneMatch: *` conditional writes, and immutable writes are a hard requirement |
| Email | Laravel Mail, Postmark transport, `afterCommit` queued mailables | Matches send-after-commit. Mailpit catches mail in tests |
| Queue | Database queue driver plus a supervised worker | A new runtime component: deployment must run it |
| Rate limiting | Laravel `RateLimiter` on a shared store | Closes the "process-local only" residual risk in `security-boundaries.md` |
| Tests | Pest (unit and feature) on real PostgreSQL, Larastan, Pint; Playwright for the shared parity suite | See `02-test-strategy.md` |
| Location | New app in `apps/portal`, running next to `apps/web` until cutover | Both apps run at once, so the parity suite can compare them |

## 4. Migration strategy

**Parallel build plus a parity-gated single cutover.** This is not a route-by-route strangler.

- A strangler (proxying some paths to Laravel and the rest to Next) would make both apps share Better Auth sessions and cookies, which means building throwaway cross-framework auth. Since nothing is live, nothing pushes us to ship piece by piece.
- Instead, Laravel is built **slice by slice** in `apps/portal`. Each slice is proven by its tagged part of the shared parity suite, plus all earlier slices (no regressions), before the next slice starts.
- **Freeze `apps/web` during the migration.** Any change that has to go into `apps/web` gets a parity test and an inventory row in the same commit, then goes into the Laravel backlog. Otherwise the target keeps moving.

## 5. BMAD phase sequence

Each step names the BMAD workflow (`_bmad/bmm/module-help.csv`), its output, and the gate that has to pass before moving on. Every gate is recorded in `handoff.md` and `DECISIONS.md`.

### Phase 0: Brownfield capture (anytime workflows)
| Step | Workflow | Output | Gate |
|---|---|---|---|
| 0.1 | `document-project` (DP), deep scan of `apps/web` | `docs/` project documentation (index, architecture, source tree, API, data models) | Reviewed against `01-feature-inventory.md`, and gaps added to the inventory |
| 0.2 | `generate-project-context` (GPC) for `apps/web` | `docs/laravel-migration/project-context.md` | Exists |
| 0.3 | Inventory audit (no workflow: manual sweep of every route, page, lib module and test file) | `01-feature-inventory.md` complete, with no `TBC` rows | Owner sign-off |

### Phase 1: Analysis
| Step | Workflow | Output | Gate |
|---|---|---|---|
| 1.1 | `create-product-brief` (CB), migration brief: why Laravel, success criteria, non-goals (no new features, no redesign) | `laravel-migration/product-brief.md` | Owner approval logged |
| 1.2 | `technical-research` (TR): Laravel and PHP versions, Inertia/React setup, database sessions with an absolute cap, R2 conditional PUT through the PHP SDK, MinIO conditional-write support for tests, Stripe PHP webhook verification, hosting options, Postmark transport | `laravel-migration/research-technical.md` | Every §3 row has evidence |

### Phase 2: Planning
| Step | Workflow | Output | Gate |
|---|---|---|---|
| 2.1 | `create-prd` (CP), a migration PRD. **The functional requirements are the inventory rows, cited by ID.** The NFRs are the X-series security and robustness rows | `laravel-migration/prd.md` | `validate-prd` (VP) passes |
| 2.2 | UX: **skipped by design.** The UI is ported as-is. Any visual change needs a decision | Line in the PRD | n/a |

### Phase 3: Solutioning
| Step | Workflow | Output | Gate |
|---|---|---|---|
| 3.1 | `create-architecture` (CA) | `laravel-migration/architecture.md` plus `adr/ADR-001…` | Every §3 recommendation accepted or replaced by an ADR |
| 3.2 | `create-epics-and-stories` (CE), using the epic skeleton in §5a | `laravel-migration/epics.md` | Every inventory row maps to at least one story, and every story lists its parity test tags |
| 3.3 | `check-implementation-readiness` (IR) | `laravel-migration/readiness-report.md` | PASS |

### Phase 4: Implementation (per story)
`sprint-planning` (SP) once, then for each story: `create-story` (CS) → `validate-story` (VS) → `dev-story` (DS) → `qa-automate` (QA) → `code-review` (CR) → story done. Run a `retrospective` (ER) at the end of each epic, and `correct-course` (CC) whenever a slice finds the plan wrong.

**A story is done only when** (also in `03-documentation-protocol.md`):
1. Its parity tags pass against Laravel **and** against Next.
2. The full Laravel suite and all earlier slices' parity tags pass.
3. Its inventory rows are set to `Verified`, with test IDs filled in.
4. Its conversion record (in the story file) is complete, `handoff.md` is updated, and decisions, risks and assumptions are logged.
5. It's committed and pushed, docs and code in the same commit.

### 5a. Epic skeleton (refined in step 3.2)

Ordered by dependency. Each epic lists the inventory IDs it covers.

| # | Epic | Covers | Notes |
|---|---|---|---|
| E0 | **Parity harness on Next.js** (before any Laravel code) | All, as tests | Build the shared Playwright E2E and contract suite, seed scenarios, Mailpit, MinIO, Stripe fixture signing, and make it all **green against Next**. This is the executable spec |
| E1 | Laravel foundations | X-01…X-06, X-14 | Skeleton in `apps/portal`, Docker or Sail for local PHP (PHP is not installed on this machine), CI, Pint/Larastan/Pest, error shape, origin guard, security headers, canonical origin, trusted proxy IP |
| E2 | Data layer | X-07, X-08, all tables | Migrations, models, factories, state machine, audit writer, advisory-lock helper, `parity:seed` command matching the Next scenarios |
| E3 | Storage and uploads | X-10…X-12 | R2 client, immutable conditional PUT, presign rules, image and ZIP validation limits, health HEAD |
| E4 | Auth and identity | A-01…A-12 | Every sign-in, setup and reset flow, fencing, sessions, rate limits, admin bootstrap command, safe-next, auth emails |
| E5 | Checkout and payments | K-01…K-12 | Checkout start, webhook ledger, fulfilment and provisioning, success/continue polling, checkout emails, upsells and entitlement deltas, invoices, admin reprocess |
| E6 | Client portal | C-01…C-12 | Dashboard, project hub, brief wizard and drafts, concepts, comments, revisions, approval, finals, messages, read state, settings, invoices page |
| E7 | Admin portal | D-01…D-15 | Dashboard, project overview, status, brief view, concepts manager, revisions, uploads, finals, entitlement overrides, reset, audit, messages, health |
| E8 | Notifications | N-01…N-16 | Lifecycle emails and system messages. Built inside E5–E7 stories, with this epic as the catch-all verification pass |
| E9 | Ops, dev tooling and cutover | O-01…O-08 | Local run and seed scripts, security check, deploy runbook, queue worker, release gates, archive `apps/web` |

## 6. Release gates (owner-run, not agent-run)

These carry over from the Supabase-exit report and are re-pointed at Laravel. Each needs explicit owner approval at the time:
provision production PostgreSQL and run the migrations · set secrets (app key, Stripe, Postmark, R2) · one-time admin bootstrap on the live DB · live R2 acceptance and restore drill · proxy strips and overwrites forwarding headers · HSTS at the TLS edge · Stripe live webhook endpoint registered · DNS and cutover · archive `apps/web`.

## 7. Open decisions (owner)

| # | Decision | Recommendation |
|---|---|---|
| D1 | **Why Laravel?** (maintainability, hosting cost, your own PHP fluency, ecosystem.) This sets the success criteria in the brief | Owner answer needed |
| D2 | UI approach: Inertia + React (port) or Blade/Livewire (rewrite) | Inertia + React |
| D3 | Confirm there's no live data or customers, so it's a fresh install with no data migration | Confirm |
| D4 | Do we launch on Next first, or freeze Next and launch on Laravel? | Freeze and launch on Laravel. Launching first means doing the release gates twice |
| D5 | Laravel hosting (Laravel Cloud / Forge + VPS / other) | Decide after the step 1.2 research |
| D6 | Local PHP: Docker (Sail) or native PHP install in WSL | Docker. It matches CI |
| D7 | Table naming: Laravel snake_case or keep the Prisma PascalCase names | snake_case (fresh install) |
| D8 | BMAD outputs for this migration go to the tracked `docs/laravel-migration/` (since `_bmad-output/` is git-ignored), or un-ignore `_bmad-output/` | Use `docs/laravel-migration/` (already in place) |
