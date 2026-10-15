# Logo Fountain — Project TODO

This file is the single source of truth for in-progress work. Update it after each completed step and commit the update.

## Emergency app hardening (2026-10-15)

- [x] Integrated reviewed checkout/auth and webhook/final-delivery commit chains with manual webhook conflict resolution.
- [x] Added delayed-payment success/failure handling through the claimed idempotent fulfillment path.
- [x] Made required webhook email outcomes explicit and retryable after durable fulfillment; documented at-least-once semantics and rare duplicate risk without a schema migration.
- [x] Added immutable/versioned final-file repair/replacement handling for `FINAL_FILES_READY` and `DELIVERED`, deterministic newest-asset selection, retained superseded records/objects, guarded publication, notification-only retries, exact-asset download guards, bounded transactions, retryable conflicts, and canonical same-origin POST checks.
- [ ] Residual: superseded immutable final assets are retained indefinitely so issued one-hour signed URLs remain valid. Newly uploaded objects are also retained after any publication transaction exception, even when an immediate query finds no row, because rollback cannot be proven conclusively. This intentionally unbounded fail-safe behavior can leave orphan objects and requires a future audited housekeeping/retention policy; no cleanup job is included.
- [x] Added bounded process-local forgot-password abuse controls with uniform anti-enumeration responses, and minimized public checkout-status data.
- [ ] Residual: public checkout status/magic-link endpoints remain lookup targets for high-volume Session-ID guessing. Session IDs are high entropy and responses are coarse, but a future distributed edge limiter should supplement the current per-email/session process-local controls.

Validation note: no dependencies were installed or updated; validation reused the identical-lockfile `node_modules` from the reviewed webhook worktree. The focused release-blocker set passes (5 files, 89 tests), the reconciled full unit suite passes (78 files, 363 tests), typecheck passes, and lint has 0 errors with 2 pre-existing warnings. A production webpack build passes using non-live placeholder environment values. Playwright passes all 5 E2E tests when its dev server is started with webpack; the default Turbopack build/dev commands remain incompatible with the external dependency symlink used in this worktree.

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
- [x] Reconciled delayed-payment webhook handling: `checkout.session.async_payment_succeeded` retrieves the paid Session, unpaid completion does not provision, distinct event IDs for one Session converge through durable idempotent fulfillment, and email side effects remain explicitly at-least-once (rare duplicates are possible).

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

### Application security hardening
- [x] Escape dynamic transactional email HTML and strictly validate CTA URLs.
- [x] Centralize post-auth `next` validation across login, callback, and password setup.
- [x] Apply app security headers with a compatibility-staged CSP policy.
- [x] Require the canonical Origin on cookie-authenticated mutations, including multipart admin uploads.

Security notes:
- Boundary decisions, webhook/public exemptions, staged CSP rollout, edge-owned HSTS, and the remaining distributed edge-rate-limit requirement are documented in `apps/web/docs/security-boundaries.md`.

Next-step notes (2026-03-04):
- Brief editor now shows a live draft-status chip (saving/saved timestamp) and adds a non-intrusive unload guard when there are unsubmitted changes.
- Regression sweep completed with targeted wizard tests + lint + typecheck; no blocking issues found in edit/back/next/review/submit paths.
- Copy/navigation wording normalized across client/admin project surfaces (project overview/messages terminology, consistent link tone, mobile-safe link wrapping).
- Local tester ops note added: `docs/local-lan-redirect-testing.md`.

## Emergency reliability and delivery hardening (2026-10-14)
- [x] Make Stripe checkout webhook event claims retry-safe after transient failures while preserving concurrent duplicate exclusion.
- [x] Gate final-deliverable readiness on approval plus persisted `FINAL_FILES_READY`/`DELIVERED`, and issue signed download URLs only from guarded client/admin endpoints.
- [x] Harden final downloads against state/approval/asset races, move client download mutation to POST, and restore admin on-demand downloads without snapshot URLs.
- [x] Fence and renew Stripe event claims and make post-fulfillment customer/admin email retries durable-audit-aware.
- Merge note: keep the checkout-security commit separate for now; integrate it after this branch, resolving any webhook route/test overlap while retaining claim fencing and durable notification retry behavior.

### Security critic follow-up (c40cc40)
- [x] Fail visibly on logout/provider errors and verify the cookie session is gone before navigating.
- [x] Define canonical missing-Origin Referer fallback; never override explicit Origin; separate configuration 503 from provenance 403.
- [x] Validate auth-next pathname without rejecting legitimate query/fragment data.
- [x] Describe CSP report-only honestly as manual console observation (no collector or retained reports).
- [x] Strengthen per-handler mutation guard regression checks and add focused behavioral tests.
- [ ] Before release: non-live browser/provider and TLS-edge verification described in `apps/web/docs/security-boundaries.md`; configure edge HSTS and distributed rate limiting separately.

### Owner-approved final session verification fix (dd471f5)
- [x] Only documented Supabase missing-session results produce `authenticated:false`; unexpected returned/thrown verification failures are sanitized non-success responses.
- [x] Cover real session handler absence/user/provider/network/throw behavior and logout helper non-success verification regression.
