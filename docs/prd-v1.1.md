# PRD v1.1 — Logo Fountain (Tight)

**Date:** 2026-03-01  
**Status:** Draft (implementation-ready pending a few open questions)  
**Source of truth:** Product Brief v1.0 (`projects/logo-fountain/docs/product-brief-v1.0.md`)

## 0) Executive summary
Logo Fountain is a premium UK logo design service delivered via a structured portal (not email threads). Clients buy a package, submit a structured brief, review concepts, request revisions within entitlements, approve a final concept, and download final assets. Admin operates a clear queue with deterministic lifecycle states, enforced entitlements, messaging, and an auditable history.

**Stack (confirmed):** Next.js + Supabase (Postgres/Auth/Storage) + Prisma + Stripe.

---

## 1) Goals, non-goals, and success metrics
### 1.1 Goals (MVP)
1. **Paid end-to-end workflow**: purchase → brief → concepts → revisions → approval → delivery.
2. **Clarity + control**: explicit project state, explicit next actions, explicit entitlements.
3. **Premium tone**: minimal UI, high-trust content, no marketplace vibes.
4. **Operational simplicity**: admin queue, exception handling, audit trail.

### 1.2 Non-goals (MVP)
- Native mobile apps
- Multi-tenant white-label for other agencies
- Complex team permissions beyond Admin vs Client
- AI logo generation or template marketplace

### 1.3 Success metrics (first 90 days)
- Purchase → brief submitted within 24h: **≥ 80%**
- Median purchase-to-brief time: **≤ 24h**
- First concept feedback completion rate: **≥ 70%**
- Paid project completion rate: **≥ 60%**
- Support tickets about “where are we / what next / how many revisions”: **-40%** vs baseline

---

## 2) Users, roles, and permissions
### 2.1 Roles
- **Client**: purchaser / project stakeholder.
- **Admin**: operator/designer managing projects, uploads, exceptions.

### 2.2 Permission model (MVP)
- Client can only access their own projects.
- Admin can access all projects.
- Only Admin can publish concepts/revisions/final assets.
- Only Client can approve final concept (Admin can “mark delivered” only after approval).

---

## 3) Product scope (P0/P1)
### 3.1 P0 (must ship)
- Auth: email + magic link (Supabase) or email/password (choose one; see Open Questions)
- Stripe Checkout for **package purchase**
- Project creation on successful payment (idempotent)
- Structured brief (client)
- Admin queue + project detail view
- Concept upload + publish
- Client review + structured feedback + revision requests
- Entitlement counters + enforcement (concepts/revisions)
- Messaging thread per project (client↔admin)
- Approval flow (client selects/approves one concept)
- Final asset upload + delivery download page
- Audit trail for lifecycle transitions and overrides

### 3.2 P1 (ship shortly after)
- Add-on purchases (extra revisions / rush) via Stripe
- Admin override UI (grant extra revision, extend deadlines) with mandatory reason
- Basic notification emails (brief received, concepts ready, final files ready)
- Campaign landing pages (tracking + routing to checkout)

---

## 4) Lifecycle and state machine
### 4.1 Project states (client-visible)
1. **Awaiting brief** (paid, brief not submitted)
2. **Brief submitted** (awaiting admin review)
3. **In design** (admin working)
4. **Concepts ready** (client action: review)
5. **Revisions in progress** (client requested revision; admin working)
6. **Awaiting approval** (client action: approve one concept)
7. **Final files ready** (client action: download)
8. **Delivered** (project closed)

### 4.2 Deterministic rules
- Client cannot request revision if `revisions_remaining == 0`.
- Client cannot approve until at least one concept is published.
- After client approves concept A, other concepts become **archived** client-side.
- Admin overrides require **reason** + are written to audit log.

---

## 5) Core user journeys
### J1 — Purchase → dashboard
1. Client visits package page → selects tier.
2. Stripe Checkout.
3. On success: create `order` + `project` + entitlements.
4. Client lands in dashboard → sees “Start your brief”.

### J2 — Brief submission
1. Client completes structured brief (brand, audience, style, competitors, usage contexts).
2. Submit → locked version + timestamp.
3. Admin notified (P1 email) + project moves to **Brief submitted**.

### J3 — Concepts + feedback loop
1. Admin uploads concepts (images + notes) and publishes.
2. Client reviews concept(s) → leaves feedback + optionally requests a revision.
3. Revision request decrements entitlement + creates a revision task.
4. Admin uploads updated concept/revision and publishes.

### J4 — Approval + delivery
1. Client clicks “Approve” on one concept.
2. Admin uploads final asset pack (zip + individual files).
3. Client downloads, project marked **Delivered**.

### J5 — Entitlement exhausted
1. Client hits revision limit.
2. UI disables revision action and explains options:
   - Approve
   - Purchase add-on (P1)
   - Message admin

---

## 6) Functional requirements (tight)
Format: **FR-<AREA>-###** with acceptance criteria.

### 6.1 Auth & accounts
- **FR-AUTH-001**: Client can sign in and access their dashboard.
  - AC: Unauthenticated user is redirected to login.
  - AC: Auth session persists across refresh.
- **FR-AUTH-002**: Admin role is enforced.
  - AC: Non-admin cannot access `/admin/*`.

### 6.2 Packages, checkout, and fulfillment
- **FR-PAY-001**: Client can purchase a package via Stripe Checkout.
  - AC: Checkout uses correct price id for selected package.
  - AC: Success redirect returns to dashboard.
- **FR-PAY-002**: System fulfills order idempotently from Stripe webhook.
  - AC: Replaying webhook does not create duplicate projects/orders.
- **FR-PAY-003**: On successful payment, system creates entitlements.
  - AC: `concepts_allowed`, `revisions_allowed`, etc. set from package definition.

### 6.3 Project dashboard (client)
- **FR-CLIENT-001**: Client sees list of projects + current state + next action.
  - AC: Each project card shows state label and a single primary CTA.
- **FR-CLIENT-002**: Client can open a project detail page.
  - AC: Contains timeline, entitlements, concepts, messages, and actions.

### 6.4 Structured brief
- **FR-BRIEF-001**: Client can complete a structured brief form.
  - AC: Required fields validated.
  - AC: Autosave draft (optional P1) OR explicit save.
- **FR-BRIEF-002**: Client can submit brief; submission locks fields.
  - AC: After submission, edits require admin request (P1).

### 6.5 Concepts & revisions
- **FR-CONCEPT-001**: Admin can upload concept assets and draft notes.
  - AC: Only admin can upload.
- **FR-CONCEPT-002**: Admin can publish concepts to client.
  - AC: Client receives read access only after publish.
- **FR-REV-001**: Client can submit feedback and request a revision.
  - AC: Revision request decrements remaining revisions.
  - AC: If `revisions_remaining==0`, request is blocked with clear message.
- **FR-REV-002**: Admin can publish a revision update.
  - AC: Revision is linked to prior concept version.

### 6.6 Approval & delivery
- **FR-APPROVE-001**: Client can approve one concept.
  - AC: Approval is explicit and requires confirmation.
  - AC: After approval, other concepts are not selectable.
- **FR-DELIV-001**: Admin can upload final deliverables.
  - AC: Client can download final zip/assets.
- **FR-DELIV-002**: Project transitions to Delivered.
  - AC: Delivered projects are read-only for client except downloads/messages.

### 6.7 Messaging
- **FR-MSG-001**: Project has a message thread.
  - AC: Client and admin can post.
  - AC: Messages are ordered and timestamped.

### 6.8 Admin ops
- **FR-ADMIN-001**: Admin queue shows projects by state and priority.
- **FR-ADMIN-002**: Admin can update project state only via valid transitions.
- **FR-ADMIN-003**: Admin can override entitlements with mandatory reason.
  - AC: Override writes audit entry.

### 6.9 Audit trail
- **FR-AUDIT-001**: System records audit events for:
  - payment fulfilled
  - brief submitted
  - concepts published
  - revision requested/published
  - approval
  - deliverables uploaded
  - entitlement overrides

---

## 7) Data & storage requirements (Supabase + Prisma)
### 7.1 Key entities (MVP)
- User (role: client/admin)
- Project
- Package
- Entitlement (per project)
- Brief
- Concept (versions)
- RevisionRequest / Feedback
- Message
- FileAsset (stored in Supabase Storage)
- AuditEvent
- Order / PaymentIntent mapping (Stripe)

### 7.2 File handling
- Concepts and final assets stored in Supabase Storage.
- DB stores metadata + signed URL generation.

---

## 8) Stripe payment handling
### 8.1 Checkout model
- Stripe Products/Prices represent packages and add-ons.
- Fulfillment is driven by webhooks (not by client redirect).

### 8.2 Webhooks (MVP)
- `checkout.session.completed` (primary)
- `payment_intent.succeeded` (optional safety)
- `charge.refunded` (P1)

### 8.3 Idempotency
- Store Stripe event ids processed.
- Unique constraint on `stripe_checkout_session_id` in orders.

---

## 9) Non-functional requirements
- **NFR-SEC-001**: RLS for all tables with client data (Supabase).
- **NFR-SEC-002**: All Stripe webhooks verified; secret never exposed client-side.
- **NFR-PERF-001**: Authenticated API p95 ≤ 500ms (excluding large file transfers).
- **NFR-REL-001**: Webhook processing is idempotent and retry-safe.
- **NFR-OBS-001**: Basic event logging for state transitions and payment fulfillment.
- **NFR-GDPR-001**: GDPR-friendly data retention and export/delete pathway (P1 acceptable).

---

## 10) Analytics (minimum viable)
Track:
- landing → checkout started → paid
- paid → brief submitted
- concepts published → feedback submitted
- approval → delivered
- revision count distribution by package

---

## 11) Risks & mitigations (top)
- **Scope creep via “premium” expectations** → enforce P0/P1 and explicit entitlements.
- **Webhook complexity** → keep fulfillment webhook-only + strict idempotency.
- **RLS mistakes** → default-deny policies + automated tests (when coding starts).

---

## 12) Open questions (need your input)
1. **Package entitlements**: concepts/revisions per tier + deliverables list (TBD numbers).
2. **Pricing**: GBP pricing per tier; any VAT handling requirement?
3. **Auth choice**: magic-link only vs email+password (recommend magic-link for simplicity).
4. **Add-ons**: which ones first (extra revision, rush, additional concept)?
5. **Admin workflow**: any need for multiple admins/collaborators in v1?

---

## 13) Delivery plan (BMAD → build boundary)
- **B (Business)**: confirm packages/pricing/positioning; define offer page copy.
- **M (Market)**: competitor scan and differentiation bullets.
- **A (Architecture)**: schema + RLS policies + API routes + Stripe webhook design.
- **D (Delivery)**: milestone plan, acceptance tests, QA checklist.

When you answer the open questions, I’ll lock PRD v1.1 and produce an architecture + milestone breakdown ready for development (Codex only once we start coding).
