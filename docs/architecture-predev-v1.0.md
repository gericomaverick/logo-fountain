# Logo Fountain — Architecture (Pre-Dev) v1.0

**Date:** 2026-03-01

**Goal:** Define a build-ready architecture for Next.js + Supabase + Prisma + Stripe without writing implementation code yet.

---

## 1) System overview
### Components
- **Next.js app**
  - Public marketing pages (packages, offer)
  - Authenticated client portal
  - Admin portal
  - API routes for server-only operations (Stripe session creation, webhooks, signed URLs, entitlement RPC)
- **Supabase**
  - Postgres database
  - Auth (email+password + optional magic link)
  - Storage (private buckets for concepts/finals/brief assets)
  - Row Level Security (RLS) for multi-tenant data isolation
- **Prisma**
  - Schema as source-of-truth for DB tables used by app
  - Migrations workflow (Prisma migrate)
- **Stripe**
  - Checkout Sessions for packages and add-ons
  - Webhooks for fulfillment and refund/dispute handling

---

## 2) Data model (tables to implement first)
Adopt the subagent’s model, MVP-first. Core tables:
- `profiles` (1:1 with `auth.users`)
- `clients`, `client_memberships`
- `projects`
- `packages`, `package_entitlements`
- `addons`, `addon_entitlements`
- `project_orders`, `project_order_addons`
- `project_entitlements` (key/limit/consumed)
- `project_briefs` (versioned answers jsonb)
- `concepts`
- `revisions` (or `revision_requests` simplified)
- `message_threads`, `messages`
- `file_assets`
- `audit_events`
- `stripe_events` (webhook dedupe)

**Design choice (MVP):** Keep entitlements as key/value rows (`project_entitlements`) so you can add new entitlements without migrations.

---

## 3) RLS plan (high-level)
### Roles
- Client users are members of a `client` via `client_memberships`.
- Admin users (service operator) are identified via:
  - a membership role (`admin/designer`) on a special internal client, OR
  - a `profiles.is_admin` flag (simpler), enforced server-side.

### RLS principles
- **Default deny** everything.
- `select` permitted only if `exists (membership for client_id)`.
- Mutations:
  - Client can insert: briefs, messages, feedback, revision requests.
  - Admin can insert/update: concepts, deliverables, state changes.
  - Webhook/service role updates: orders, entitlements consumption adjustments.

### Server-side only
- Stripe webhooks and entitlement decrement should use **service role** (or RPC with `security definer`).

---

## 4) Stripe integration design (build-ready)
### Required webhooks
- `checkout.session.completed` (primary fulfillment)
- `charge.refunded` or `refund.updated`

Recommended:
- `checkout.session.expired`
- `payment_intent.payment_failed`
- `charge.dispute.created` / `charge.dispute.closed`

### Idempotency
- Table `stripe_events(event_id unique)` for webhook dedupe.
- Unique constraints on:
  - `project_orders.stripe_checkout_session_id`
  - `project_orders.stripe_payment_intent_id`
- Fulfillment transaction:
  - lock order row
  - if already fulfilled, exit

### Success UX
- `GET /checkout/success?session_id=...` renders “Processing…”
- calls `GET /api/checkout/status?session_id=...` until fulfilled

---

## 5) API inventory (no code yet)
### Public
- `POST /api/checkout/session` — create Stripe Checkout session from package + add-ons (server-side allowlist)
- `GET /api/checkout/status` — return order/project status for success polling
- `POST /api/stripe/webhook` — webhook receiver

### Client portal
- `GET /api/projects` / `GET /api/projects/:id`
- `POST /api/projects/:id/briefs` (creates new brief version)
- `POST /api/projects/:id/messages`
- `POST /api/projects/:id/revision-requests` (decrements entitlement on submission)
- `POST /api/projects/:id/approve` (approve concept)

### Admin portal
- `GET /api/admin/projects?status=...`
- `POST /api/admin/projects/:id/concepts` (upload metadata)
- `POST /api/admin/projects/:id/concepts/:conceptId/publish`
- `POST /api/admin/projects/:id/finals` (upload final deliverables)
- `POST /api/admin/projects/:id/override-entitlements` (requires reason; audit)

---

## 6) Storage design
Buckets (private):
- `brief-assets/`
- `concepts/`
- `final-deliverables/`

DB table `file_assets` stores:
- bucket
- path
- mime
- size
- project_id
- uploaded_by
- kind (`brief_asset|concept|final|brand_guidelines|business_card|letterhead`)

Signed URLs generated server-side; do not expose raw paths publicly.

---

## 7) State machine enforcement
Implement server-side transition validation (single source of truth), and emit `audit_events` for each transition.

---

## 8) VAT handling (not VAT registered)
- Capture optional `client_vat_number` on `clients`.
- Receipts/invoices should display:
  - “VAT: Not charged (supplier not VAT registered)”
  - client VAT number for their record if provided.

---

## 9) Dev-entry checklist (what must be true before coding)
- PRD locked
- Entitlement calibration confirmed
- Stripe price IDs finalized + stored in config/table
- Data model finalized enough for migration
- RLS policy matrix drafted
- Endpoint list approved
