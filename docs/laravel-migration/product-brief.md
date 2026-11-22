---
stepsCompleted: [init, vision, users, metrics, scope, complete]
inputDocuments:
  - docs/product-brief-v1.0.md
  - docs/user-journeys-and-stories-v1.0.md
  - docs/laravel-migration/00-migration-plan.md
  - docs/laravel-migration/01-feature-inventory.md
  - docs/laravel-migration/brownfield/index.md
  - apps/web/docs/design-system.md
date: 2026-11-18
author: Mat (owner), drafted by Claude
workflow: bmad-bmm-create-product-brief (BMAD step 1.1, migration brief)
status: Draft for owner approval
---

# Product brief: Logo Fountain portal on Laravel

## Executive summary

Logo Fountain sells bespoke, designer-led logo design in three fixed packages (Essential £349, Professional £795, Complete £1,495). Delivery runs through a client portal, not email threads. The portal is the product: it's where a customer's money turns into a brief, concepts, feedback, an approval and a ZIP of final files, with every limit visible and every step recorded.

The portal exists today as a Next.js app (`apps/web`). It's functionally complete and heavily hardened, but it's **not live**: no customers, no data. The owner is moving it to **Laravel** before launch, for three reasons:

1. **Security:** a mature framework with conventional, well-audited answers to sessions, CSRF, hashing, queues and validation.
2. **Robustness:** fewer hand-rolled moving parts, and first-class jobs, retries, scheduling and transactions.
3. **Ecosystem:** first-party tooling, a large talent pool and long support windows, on hosting the owner already pays for.

At the same time the portal gets a **proper redesign**. The current UI was mid-redesign and is inconsistent. The new one is designed first, against strict UX principles and around how Logo Fountain actually operates. It's modern and fresh, with light and dark modes.

What the migration is: **the same product, the same guarantees, a better foundation and a coherent design.** What it isn't: a feature expansion.

## Core vision

### Problem

- **Foundation risk.** The Next.js app relies on a fast-moving framework (its own agent rules warn its APIs differ from what developers expect) plus a lot of bespoke security machinery. Every auth race fence, idempotency lease and upload validator is custom code that one person has to keep correct.
- **Design debt.** The UI has been through several half-finished directions (purple, then teal; surfaces removed, then restored). There's a design-system document, but the screens don't consistently follow it. A customer paying up to £1,495 should meet something that feels calm, premium and obvious.
- **Launch timing.** With no live data, this is the cheapest moment there will ever be to change the foundation. After launch, every change carries migration and downtime risk.

### Solution

A Laravel application (`apps/portal`) that:
- implements **every** feature in `01-feature-inventory.md` for customers and the admin, with the same behaviour, except the deliberate fixes logged as DV-1, DV-2, DV-4…DV-9, DV-11…DV-13 (promo codes, additive upgrades, reprocess emails, unpublished concepts unreachable, revision-upload email, standard error shape and so on);
- keeps the **same JSON API contracts**, so one black-box parity test suite proves both apps behave the same;
- is built on Inertia + React + TypeScript, so the tested TypeScript behaviour modules (brief wizard, hub rules, chat, upload keys) carry over;
- has a **new design system and information architecture**, defined in the UX spec before any screen is built, with light and dark themes, WCAG 2.2 AA, and phone-first ergonomics for customers;
- runs on **Hetzner**, with Postgres backups and restore drills, a supervised queue worker, and TLS and HSTS at the edge.

### Differentiators the portal must keep (why customers trust Logo Fountain)

- **Clear limits.** Allowances (concepts and revisions) are always visible: what's left, what's in progress, what's used.
- **One obvious next step.** Every project state tells the customer exactly what to do, or that nothing is needed from them.
- **Nothing hidden.** Every state change, override and email is recorded and auditable.
- **Designer-led, not a marketplace.** The tone is personal ("your designer"), never a ticket queue.

## Target users

### 1. The customer: "Sam, founder of a small business" (primary)
- **Context:** runs a café roastery, a clinic, a trades business or a young SaaS. Buys once and may come back for an upgrade or an extra revision. Not a designer. Often checks progress **on a phone**, between other jobs.
- **Needs:** to know at a glance where the project is and whether anything is waiting on them; to give feedback without fear of "using up" something by accident; to find the final files again months later.
- **Frustrations to design out:** vague status, surprise limits, hunting through email, forms that feel like homework.
- **Success moment:** "I opened it, saw my concepts, said what I wanted changed, and knew exactly what happens next."

### 2. The designer-operator: "Mat, the admin" (primary)
- **Context:** a single operator (ASSUMPTIONS.md 2026-03-01) running the whole pipeline: intake, concepts, revisions, finals, payments and exceptions. Works on desktop.
- **Needs:** a queue that puts **what needs action first**; uploading a concept or revision in as few steps as possible without mistakes; replying in the right thread; fixing a stuck payment; overriding allowances with a reason; never accidentally breaking a project's state.
- **Success moment:** "Monday morning: three things need me, they're at the top, and each is two clicks from done."

### 3. The agency or operator buyer (secondary)
Buys on behalf of a stakeholder and needs traceability: invoices and receipts, a clear history, predictable states.

### Journeys the portal must make effortless (detail in the UX spec)
Purchase → set password → brief → concepts → feedback and revisions (within allowance, with an add-on or upgrade when exhausted) → approval → final files → (later) re-download and invoices. Plus the admin's queue → project → act loop, and the exception paths: on hold, cancelled, stuck checkout, overrides, clean-slate reset.

## Success metrics

### Migration success (go/no-go for launch)
| Criterion | Measure |
|---|---|
| **Complete** | 100% of inventory rows `Verified`, or `Dropped` by decision |
| **Behaviourally identical** | The full parity suite is green on both apps (except tests tagged `@deviation`), 3 consecutive runs |
| **Secure** (D1) | Every X-series and A-series row verified. The L6 authorisation matrix is green (every endpoint × anonymous / client A / client B / admin, and every concept status for client routes). `composer audit` and `npm audit --omit=dev` are clean. Report-only CSP is shipped. Security review passed |
| **Robust** (D1) | The L3 real-Postgres concurrency suite is green nightly for 7 days. The webhook retry and replay suite is green. A Postgres backup **restore drill** has been completed and timed |
| **Ecosystem fit** (D1) | Supported Laravel and PHP versions pinned, conventional structure, Larastan at the agreed level, no bespoke framework replacements where a first-party feature exists (except the documented auth fencing and R2 conditional writes) |
| **Designed, not improvised** | Every screen matches the approved UX spec. L7 baselines approved. Zero serious or critical axe violations. The design-system lint is clean |

### Product outcomes after launch (from the v1.0 brief, still the targets)
- Purchase → brief submitted within 24 h: **≥ 80%**. Median purchase-to-brief ≤ 24 h.
- First concept feedback completion: **≥ 70%**. Paid project completion: **≥ 60%**.
- Status- and revision-confusion support contacts reduced **≥ 40%** against the email-based baseline.
- Authenticated API p95 **≤ 500 ms**. Audit coverage of lifecycle transitions **100%**. Webhook validation and idempotency **100%**.

### UX quality targets (new, measured in usability checks before launch)
- A first-time customer finds "what do I need to do now?" in **under 5 seconds** on the project page (5-second test, 5 people).
- Requesting a revision, approving a concept and downloading finals each take **3 taps or fewer** from the project page on a phone.
- The admin reaches any "needs action" item from the queue in **1 click**, and completes a concept upload in **under 60 seconds** without errors.

## Scope

### In scope
- Every feature in `01-feature-inventory.md` (A, K, C, D, N, X, O series), for customers and the admin.
- The decided deviations DV-1, DV-2, DV-4…DV-9, DV-11, DV-12, DV-13.
- The full redesign (DV-UX): design system, information architecture, every screen, light and dark, responsive, accessible.
- The shared parity test suite plus Laravel unit, feature, concurrency, visual and accessibility tests. Documentation as defined in `03-documentation-protocol.md`.
- Hetzner deployment, backups and restore drill, queue worker, monitoring basics, runbooks.

### Out of scope
- VAT number capture and display (DV-3, a post-launch story).
- New product features (e.g. brief attachments from the original US-BRIEF-02, realtime updates, multiple admins, campaign landing pages in the portal). Each may be raised as a post-launch story.
- The marketing site (`apps/site`), except keeping the brand colour shared.
- Migrating any data (there is none).

### Future vision (post-launch candidates, not commitments)
VAT on receipts · brief reference uploads · realtime updates in place of polling · a "Mark in design" admin action (F-13) · storage housekeeping with an audited retention policy · a second admin seat.

## Open questions for the owner
1. Are the UX quality targets above the right bar, or do you want different ones?
2. Single operator for launch: confirm that no second admin or designer seat is needed yet.
3. Is there a target launch date? It sets how the epics get sequenced.
