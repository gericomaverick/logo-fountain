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
- [ ] Admin project listing: strongest sort/grouping for “needs action” items.
- [ ] Admin concept workflow: minimal steps to upload new concept / upload revision / mark delivered.
- [ ] Admin comms: fast reply in the correct thread (concept vs project).

### Step 1 — Premium polish (visual refinement)
- [ ] Typography rhythm + spacing consistency across all portal pages.
- [ ] Card surface hierarchy (white vs subtle nested greys) tightened.
- [ ] Micro-interactions (hover/active/focus) and status badge consistency.

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
