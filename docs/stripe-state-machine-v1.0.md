# Logo Fountain — Stripe + Order State Machine v1.0

**Date:** 2026-03-01

Assumptions:
- One-time payments via Stripe Checkout.
- Fulfillment only via `checkout.session.completed` webhook.

---

## 1) Internal order statuses
- `draft`
- `pending_payment`
- `paid`
- `fulfilled`
- `payment_failed`
- `expired`
- `refunded_partial`
- `refunded_full`
- `disputed`
- `canceled`

---

## 2) Webhook handler (idempotent)
For each event:
1. Verify Stripe signature
2. Deduplicate by `event.id` (insert into `stripe_events` with unique constraint)
3. Process in a DB transaction with row lock on the order

### Event: `checkout.session.completed`
Guards:
- session `payment_status == paid`
- `order_id` present in metadata/client_reference_id

Actions:
- mark `project_orders` -> `paid`
- if not yet linked, create `client` + membership for purchaser (if needed)
- create `project`
- create `project_entitlements` snapshot for package (Option B) + any add-ons
- mark order `fulfilled`
- emit `audit_event`: `order_fulfilled`

### Event: `checkout.session.expired`
- mark order `expired` (if still pending)

### Event: `payment_intent.payment_failed`
- mark order `payment_failed` (if still pending)

### Event: `charge.refunded` / `refund.updated`
- set refund status partial/full
- policy:
  - if full refund pre-delivery: move project to `CANCELLED/REFUNDED` and disable downloads
  - if partial: keep project but log

### Dispute events
- `charge.dispute.created` => mark order `disputed`, set project `ON_HOLD`
- `charge.dispute.closed` => clear hold depending on outcome

---

## 3) Upgrades/add-ons (post-purchase)
Upgrades are separate Checkout purchases tied to an existing project.

### Policy (Decision)
**Additive-from-current**: preserve `consumed_int`, increase `limit_int` by the delta needed to reach the target tier.

Example: Essential → Professional
- Essential limits: concepts=2, revisions=2
- Professional limits (Option B): concepts=3, revisions=2
- Delta to apply: concepts +1, revisions +0

Professional → Complete (Option B)
- Professional limits: concepts=3, revisions=2
- Complete limits: concepts=3, revisions=5
- Delta: concepts +0, revisions +3

Extra revision add-on:
- delta: revisions +1

Implementation notes:
- Store a `target_project_id` in Checkout metadata for upgrade sessions.
- Fulfillment should validate that the purchaser is a member of that project’s client.

---

## 4) Promo codes
Recommended: implement `PRO40FIRST5` via Stripe Coupon + Promotion Code with redemption limits.

---

## 5) Price allowlist
Server must map `{packageCode, addonCodes, upgradeCodes}` to Stripe price IDs from a trusted table/config.
Never accept arbitrary price IDs from the browser.
