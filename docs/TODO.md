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
- [ ] Upsell panel rules: show upgrade vs add-on at the right moments.
- [ ] Post-purchase confirmation UX: obvious success + updated entitlements.
- [ ] Edge cases: delayed webhooks, double-click, refresh.

## Marketing site (after backend/dashboard steps)
- [ ] Add pricing cards to homepage (in HYROS style, inspired by https://claude.com/pricing).
  - Placement: below key value props / before final CTA.
  - Cards must match existing HYROS styling + typography.

## Notes
- Use subagents for implementation.
- After each step: update this file and commit the change.
