# Logo Fountain — Ticket List (MVP) v1.0

**Date:** 2026-03-02  
**Scope:** P0 build tickets derived from `docs/prd-v1.1.md` + addendum + `docs/delivery-plan-build-v1.0.md`.

Conventions:
- **Type:** FE (frontend), BE (backend/API), INF (infra/tooling), SEC (security/RLS), QA.
- **AC:** acceptance criteria.
- **Exit:** what must be true to close the ticket.

---

## EPIC E0 — Foundations
### LF-0001 (INF) — Create Next.js app scaffold
**AC**
- App boots locally; basic layout + routing working.
- Repo has consistent formatting (eslint/prettier) and scripts.
**Exit**: `npm run dev` starts; `npm run lint` passes.

### LF-0002 (INF) — Environment config + secrets conventions
**AC**
- `.env.example` documents all required vars (Supabase, Stripe, app URLs).
- No secrets committed.
**Exit**: New dev can run with `.env.local` created from example.

### LF-0003 (INF) — Prisma setup + migration workflow
**AC**
- Prisma configured to Supabase Postgres.
- Initial migration runs cleanly.
**Exit**: `npx prisma migrate dev` works (or equivalent for your chosen flow).

---

## EPIC E1 — Auth, roles, and access control
### LF-0101 (BE/SEC) — Profiles table + profile creation on signup
**AC**
- `profiles` row exists for each auth user.
- `profiles.is_admin` supported.
**Exit**: Creating a user results in a usable `profiles` row.

### LF-0102 (FE) — Auth UI (email+password + magic link)
**AC**
- User can sign up/sign in; session persists.
**Exit**: Auth flows tested end-to-end.

### LF-0103 (SEC/FE) — Admin gating for `/admin/*`
**AC**
- Non-admin cannot access admin screens/APIs.
**Exit**: Access checks are enforced server-side (not only UI).

---

## EPIC E2 — Stripe checkout + fulfillment (webhook-first)
### LF-0201 (BE) — Package + add-on price allowlist
**AC**
- Server builds checkout sessions from a controlled allowlist (no raw client price IDs).
**Exit**: Attempt to pass unknown package fails.

### LF-0202 (BE) — Create Checkout Session endpoint
**AC**
- `POST /api/checkout/session` creates a Checkout Session for selected tier.
**Exit**: Redirect to Stripe works; metadata includes package code.

### LF-0203 (BE) — Stripe webhook receiver + signature verification
**AC**
- Webhook verifies signature.
- Stores `stripe_events` dedupe record.
**Exit**: Stripe CLI test event is accepted and logged.

### LF-0204 (BE) — Idempotent fulfillment: order → project → entitlements
**AC**
- On `checkout.session.completed`, create:
  - `project_orders` (paid/fulfilled)
  - `projects` (state `AWAITING_BRIEF`)
  - `project_entitlements` (per package)
- Replay-safe (no duplicates).
**Exit**: Re-sending same event changes nothing after first success.

### LF-0205 (FE/BE) — Success page polling (“Processing…”) + handoff
**AC**
- Success page polls `GET /api/checkout/status?session_id=...`.
- UI transitions to “Continue” once fulfilled.
**Exit**: No race with webhook; UX is deterministic.

### LF-0206 (BE) — Post-checkout access provisioning (invite/magic-link)
**AC**
- If buyer email has no user, provision access via invite/magic link.
- If user exists, link project to that client.
**Exit**: Buyer can access project without pre-signup.

---

## EPIC E3 — Client portal (state-driven)
### LF-0301 (FE) — Client dashboard (projects list + next action)
**AC**
- Displays current state and one primary CTA.
**Exit**: CTA mapping matches `docs/state-machine-v1.0.md`.

### LF-0302 (FE/BE) — Project detail page (timeline, entitlements, messages)
**AC**
- Shows entitlements remaining, concepts list, message thread.
**Exit**: Data is isolated by RLS.

---

## EPIC E4 — Brief
### LF-0401 (FE/BE) — Structured brief form + versioned storage
**AC**
- Client can submit brief; stored as version 1.
- After submit, form is locked (read-only).
**Exit**: State transitions to `BRIEF_SUBMITTED` with audit event.

---

## EPIC E5 — Admin ops
### LF-0501 (FE/BE) — Admin queue by state
**AC**
- Admin can filter/sort projects by state.
**Exit**: Fast enough for daily use.

### LF-0502 (FE/BE) — Admin state transition actions + audit
**AC**
- State changes validated server-side.
- Audit event emitted.
**Exit**: Invalid transitions are blocked.

---

## EPIC E6 — Concepts
### LF-0601 (BE) — Asset upload to Supabase Storage + `file_assets`
**AC**
- Upload stores metadata + ties to project.
- Signed URLs generated server-side.
**Exit**: Private by default.

### LF-0602 (FE/BE) — Admin upload concept drafts + publish
**AC**
- Draft not visible to client.
- Publish makes it visible and moves project to `CONCEPTS_READY`.
**Exit**: Client sees only published concepts.

---

## EPIC E7 — Revisions & entitlements
### LF-0701 (BE) — Entitlement counters + remaining calculation
**AC**
- `remaining = limit - consumed`.
**Exit**: Consistent across UI/API.

### LF-0702 (FE/BE) — Revision request consumes entitlement on submit
**AC**
- Server blocks request when remaining == 0.
- On request creation, entitlement is decremented atomically.
**Exit**: Double-click / concurrent submit cannot overspend.

### LF-0703 (FE/BE) — Admin publishes revision update
**AC**
- Client sees update; state returns to review stage.
**Exit**: Linked to concept/revision request.

---

## EPIC E8 — Approval + delivery
### LF-0801 (FE/BE) — Client approves one concept
**AC**
- Must confirm explicit approval.
- Other concepts become non-selectable client-side.
**Exit**: Approval recorded + audited.

### LF-0802 (FE/BE) — Admin uploads final ZIP + client downloads
**AC**
- ZIP is canonical deliverable.
- Download uses signed URL and is permission-checked.
**Exit**: State `FINAL_FILES_READY → DELIVERED` flow works.

---

## EPIC E9 — Company details (VAT number)
### LF-0901 (FE/BE) — Client company details + VAT number (optional)
**AC**
- Client can set company name + optional VAT number.
- Receipt/invoice view renders VAT number if present, and states supplier not VAT registered.
**Exit**: Works without affecting Stripe/VAT charging.

---

## EPIC E10 — Security & QA
### LF-1001 (SEC) — RLS policies for core tables
**AC**
- Client can only see own client/projects.
- Admin can see all.
**Exit**: Attempted cross-client access fails.

### LF-1002 (QA) — Stripe replay + failure-mode tests
**AC**
- Webhook replay safe.
- Success polling handles delays.
**Exit**: Documented test script passes.

### LF-1003 (QA) — Acceptance checklist run
**AC**
- Execute `docs/qa-and-acceptance-checklist-v1.0.md`.
**Exit**: All P0 items green or explicitly deferred.
