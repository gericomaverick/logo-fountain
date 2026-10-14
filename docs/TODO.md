# Logo Fountain — Project TODO

This file is the single source of truth for in-progress work. Update it after each completed step and commit the update.

## Dashboard / Portal plan (execute in this order)

### Step 2 — Mission control clarity (what do I do next?)
- [x] Project hub hierarchy: top of `/project/[id]` answers current state + next action clearly.
- [x] Pending feedback visibility: pending revisions/comments unmistakable on client + admin.
- [x] Timeline/activity feed usefulness: system events are visible and not noisy.

Step 2 notes:
- `/project/[id]` now elevates a dedicated “Next action” card in the top hierarchy and keeps status/updated timing in the same decision block.
- Pending feedback is surfaced with high-contrast state blocks in both client mission control and admin project overview.
- Mission control activity feed now highlights attention-worthy events and de-duplicates repetitive system noise.

### Step 3 — Admin ops speed (reduce clicking / mistakes)
- [x] Admin project listing: strongest sort/grouping for “needs action” items.
- [x] Admin concept workflow: minimal steps to upload new concept / upload revision / mark delivered.
- [x] Admin comms: fast reply in the correct thread (concept vs project).

Step 3 notes:
- `/admin` now urgency-sorts each section (pending feedback + unread messages first) and adds direct “Resolve pending feedback” routing into the concepts inbox.
- `/admin/projects/[id]/concepts` now includes a pending-feedback inbox with one-click actions: open concept thread, upload revision, mark delivered, or fall back to project thread.
- Admin comms/navigation now reinforces thread choice (project thread vs concept thread) across `/admin/projects/[id]`, concepts manager, upload flow, and messages view; styling aligned with `PageShell` + `Card`/`SubCard` surfaces.

### Step 1 — Premium polish (visual refinement)
- [x] Typography rhythm + spacing consistency across all portal pages.
- [x] Card surface hierarchy (white vs subtle nested greys) tightened.
- [x] Micro-interactions (hover/active/focus) and status badge consistency.

Step 1 notes:
- Added shared portal UI tokens in `apps/web/src/app/globals.css` (`portal-page-title`, `portal-card`, `portal-subcard`, `portal-btn-*`, `portal-link`, `portal-field`, `portal-badge`) and applied them across dashboard/client/admin surfaces.
- Standardized off-white shell + white card + subtle grey nested surfaces via `PageShell`, `Card`, and `SubCard`, then aligned key page sections on `/dashboard`, project overview/concepts/detail/messages/brief, `/settings`, and admin dashboard/project/concepts/messages/brief/revision screens.
- Unified interaction polish with consistent focus rings, hover transitions, and button/link styles; updated status badge baseline and action affordances for a more premium, coherent feel.

### Step 4 — Upsell conversion
- [x] Upsell panel rules: show upgrade vs add-on at the right moments.
- [x] Post-purchase confirmation UX: obvious success + updated entitlements.
- [x] Edge cases: delayed webhooks, double-click, refresh.

Step 4 notes:
- Upsell rules now trigger by project phase + entitlement pressure: add-on appears only when revision capacity is effectively exhausted, while upgrades appear when headroom is low; completed/non-revision phases no longer nag users.
- Upsell panel includes a "Not now" snooze (session-scoped) to reduce repeated prompts and avoid nagging during the same working session.
- Upsell checkout now returns to `/project/[id]` with purchase context (`upsell`, `kind`, `session_id`), and the project page shows a confirmation banner that polls checkout status until fulfilled.
- Delayed webhook path is now explicit in UX (pending confirmation message), double-click is guarded by disabled purchase buttons during redirect, and refresh keeps confirmation state via URL session context.
- Admin overview top panel (`/admin/projects/[id]`) was refactored from uneven flex rows into a responsive two-column grid with uniform summary cards and quick-action grid for cleaner alignment on desktop and mobile.

## Marketing site (after backend/dashboard steps)
- [x] Add pricing cards to homepage (in HYROS style, inspired by https://claude.com/pricing).
  - Added `PricingCardsSection` below value-prop/FAQ blocks and before `FinalCTA` on `src/app/page.tsx`.
  - Uses existing marketing typography/tokens with responsive 1-col mobile / 3-col desktop card grid.
  - Each package CTA routes into the existing Stripe path via `/pricing?package=<tier>`.

## Emergency checkout security hardening
- [x] Stop returning Supabase bearer/action links from checkout Session ID endpoints; authentication links are now delivered only to the purchaser mailbox.
- [x] Keep public resend/continuation requests to sign-in-only links, while trusted first-purchase webhook provisioning may offer initial password setup.
- [x] Reject unpaid Stripe Checkout Sessions at the shared fulfillment boundary used by webhooks and admin reprocessing.
- [x] Add focused regressions for fulfilled Session ID credential disclosure and zero provisioning for unpaid sessions.
- [x] Pin auth-email redirects to production `PUBLIC_SITE_URL`, consolidate public sends behind bounded per-session/destination limits, and document the process-local residual risk.
- [ ] Delayed-payment webhook handling is intentionally deferred to the integration branch. Reconciliation must add tests for `checkout.session.async_payment_succeeded`, unpaid `checkout.session.completed`, event deduplication, and exactly-once fulfillment/provisioning across the event sequence.

## Notes
- Use subagents for implementation.
- After each step: update this file and commit the change.

## Next steps (post-dashboard)
- [x] Marketing: add pricing cards to homepage (HYROS style) and ensure pricing routes/CTAs connect to Stripe checkout correctly.
- [x] Brief UX: make brief read-only view feel more document-like (typography, section framing, paper feel, version navigation clarity).
- [x] Brief UX hardening: add explicit “draft saved” indicator and optional unsaved-changes leave guard for extra data-loss confidence.
- [x] QA sweep: end-to-end mobile + desktop regression on brief wizard (navigation resilience, validation clarity, submit/review behavior) and admin/client overview parity.
- [x] Admin overview polish: verify final visual consistency of gradient, metadata rows, and hierarchy across breakpoints.
- [x] Ops: document WSL2 LAN testing + Stripe/Supabase redirect configuration for local testers.

Next-step notes (2026-03-04):
- Brief editor now shows a live draft-status chip (saving/saved timestamp) and adds a non-intrusive unload guard when there are unsubmitted changes.
- Regression sweep completed with targeted wizard tests + lint + typecheck; no blocking issues found in edit/back/next/review/submit paths.
- Copy/navigation wording normalized across client/admin project surfaces (project overview/messages terminology, consistent link tone, mobile-safe link wrapping).
- Local tester ops note added: `docs/local-lan-redirect-testing.md`.

## Emergency reliability and delivery hardening (2026-10-14)
- [x] Make Stripe checkout webhook event claims retry-safe after transient failures while preserving concurrent duplicate exclusion.
- [x] Gate final-deliverable readiness on approval plus persisted `FINAL_FILES_READY`/`DELIVERED`, and issue signed download URLs only from the guarded finals endpoint.
