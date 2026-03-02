# Logo Fountain — Delivery Plan (Build) v1.0

**Date:** 2026-03-02  
**Status:** Build kickoff approved (post-checkout accounts, ZIP finals, VAT number optional post-checkout + shown on receipts/invoices)

This plan turns the locked PRD + architecture into a build sequence with tight acceptance checks.

---

## 0) Build principles (non-negotiables)
1. **Webhook-first fulfillment**: redirect success page never “creates” the project; webhooks do.
2. **Idempotency everywhere**: replaying Stripe events must be safe.
3. **RLS default-deny**: client isolation is enforced at DB layer.
4. **One primary CTA per state**: UI maps directly to `docs/state-machine-v1.0.md`.
5. **Entitlements are enforced server-side**; UI reflects truth but is not the gate.

---

## 1) Milestones
### M0 — Repo + environments (half-day)
**Goal:** Running app shell + connected Supabase + Stripe test mode.
- Next.js app scaffold
- Supabase project + env vars wiring
- Prisma schema baseline + first migration (minimal)
- Stripe webhook endpoint reachable locally (Stripe CLI) and in preview

**Exit checks**
- `/health` (or equivalent) returns OK
- local webhook events are verified and logged (no business side-effects yet)

---

### M1 — Auth + roles + basic portal routing (1–2 days)
**Goal:** Secure access boundaries exist before feature work.
- Supabase Auth: email+password + magic link enabled
- `profiles` row created on signup (trigger or server hook)
- Admin gating for `/admin/*`

**Exit checks**
- Non-admin cannot reach admin routes
- Client can only see their own placeholder dashboard

---

### M2 — Checkout + fulfillment + post-checkout account access (2–3 days)
**Goal:** Money → project exists deterministically.
- `POST /api/checkout/session` (server allowlist of price IDs)
- `POST /api/stripe/webhook` verifies signatures and dedupes events
- Order + project creation on `checkout.session.completed`
- Success page polls `GET /api/checkout/status?session_id=...`
- **Post-checkout account creation** flow:
  - If customer email has no user: create user access via invite/magic link
  - If email already exists: link project to that client

**Exit checks**
- Replaying the same Stripe event creates **no duplicates**
- A new purchaser receives access without pre-signup

---

### M3 — Brief (client) + admin queue (2–3 days)
**Goal:** The work can start cleanly.
- Brief form (JSON answers, versioned)
- State transition `AWAITING_BRIEF → BRIEF_SUBMITTED`
- Admin queue view by state + project detail view

**Exit checks**
- Brief is locked after submit (new version via admin later = P1)
- Admin can move `BRIEF_SUBMITTED → IN_DESIGN` with audit entry

---

### M4 — Concepts publish + messaging (3–5 days)
**Goal:** First core loop: publish concepts and communicate.
- Admin uploads concept assets + notes (private until publish)
- Publish concepts → state becomes `CONCEPTS_READY`
- Project message thread (client↔admin)

**Exit checks**
- Client cannot access drafts
- Client sees concepts only after publish

---

### M5 — Revisions + entitlements enforcement (3–5 days)
**Goal:** Revision requests consume entitlements **at request time**.
- Client submits revision request (blocks at 0 remaining)
- Server decrements entitlements on request creation
- Admin publishes revision update
- Audit events for request, decrement, delivery

**Exit checks**
- Attempting revision at `revisions_remaining == 0` fails server-side
- Counts remain consistent under concurrent clicks

---

### M6 — Approval + ZIP delivery + “Delivered” closeout (2–4 days)
**Goal:** Close the loop with a clean, premium delivery.
- Client approves one concept
- Admin uploads **single ZIP** (primary deliverable)
- Client downloads ZIP from secure signed URL
- Project transitions to `DELIVERED`

**Exit checks**
- Only one approved concept exists
- ZIP is accessible only to entitled client/admin

---

### M7 — QA + hardening + launch (2–4 days)
- Run through `docs/qa-and-acceptance-checklist-v1.0.md`
- Webhook retry simulation
- RLS sanity tests
- Backups/observability minimum

---

## 2) Backlog (P0) — tight checklist
Use these as tickets; each should map to PRD FRs.

### Payments
- PAY-1: Price allowlist table/config + server validation
- PAY-2: Webhook dedupe table + idempotent fulfillment transaction
- PAY-3: Success polling endpoint + UI “Processing”

### Identity & access
- AUTH-1: Auth flows (password + magic link)
- AUTH-2: Admin gating + audit for overrides

### Core workflow
- WF-1: State machine validator (single source)
- WF-2: Client dashboard: state + next-action CTA
- WF-3: Admin queue: filter by state

### Brief
- BRIEF-1: versioned brief storage

### Concepts
- CON-1: upload + publish

### Revisions
- REV-1: revision request consumes entitlement on submit

### Delivery
- DELIV-1: ZIP upload, signed URL download, delivered transition

---

## 3) VAT number capture & receipts
- VAT number is **optional** in client profile (“Company details”) post-checkout.
- Receipts/invoices show:
  - **Client VAT number** (if present)
  - **VAT: £0 — Supplier not VAT registered**

---

## 4) Definition of Done (per milestone)
- Feature is behind RLS (or server-only) correctly
- Audit events emitted for lifecycle transitions
- Stripe flows are replay-safe
- UX has one clear primary CTA per state
