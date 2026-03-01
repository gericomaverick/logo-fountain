# Logo Fountain — Delivery Plan (to Dev Start) v1.0

**Date:** 2026-03-01

This is the BMAD-aligned plan to reach the **development start line** (where we’ll switch to Codex for coding).

---

## Gate 0 — PRD lock + commercial calibration
**Outputs**
- PRD v1.1 locked (packages, entitlements, state machine, Stripe approach)
- Entitlement sanity check (time-per-concept/revision estimate + margin check)

**Open item**
- Confirm whether to adjust concept/revision counts (esp. Complete) before build.

---

## Gate 1 — Information Architecture + screens
**Outputs**
- Sitemap: marketing + client portal + admin portal
- Screen list + key components
- UX rules: “one primary CTA per state”, entitlement counters always visible

---

## Gate 2 — Data model + RLS matrix
**Outputs**
- Table list (MVP-first) + relationships
- RLS matrix per table (select/insert/update/delete by role)
- List of server-only operations (webhooks, entitlement decrement)

---

## Gate 3 — Payments design ready
**Outputs**
- Stripe product/price mapping table
- Webhook event list + handler state machine
- Order state transitions
- Refund/dispute policy states (hold/cancel)

---

## Gate 4 — API contract
**Outputs**
- Endpoint inventory (client/admin/public)
- Request/response schemas (lightweight)
- Error taxonomy (auth, RLS, invalid transition, entitlement exhausted)

---

## Gate 5 — Milestones & QA gates (for dev)
**Outputs**
- Milestone breakdown for build (P0 then P1)
- Acceptance test checklist per epic
- Release checklist (RLS audit, webhook idempotency, storage perms)

---

## What I will do autonomously next (unless you stop me)
1. Tighten PRD language around entitlements, especially “Complete revisions=10” and add-on behavior.
2. Produce the **RLS policy matrix** doc (table-by-table permissions).
3. Produce the **endpoint contract** doc (schemas + errors).
4. Produce a **Stripe mapping + webhook state machine** doc.
5. Produce the **screen/sitemap spec** for marketing/client/admin.

Then I’ll report back with a “Dev Start Packet” index that we can hand to coding.
