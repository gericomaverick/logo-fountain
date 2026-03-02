# Webhook Ops Runbook

## Symptoms of a stuck checkout

Admin queue (`/admin`, backed by `/api/admin/projects`) now flags stuck projects when:

- there is no order record for the project,
- latest order status is `NEEDS_CONTACT`, or
- latest order status is not `FULFILLED`.

Project detail (`/admin/projects/[id]`) also shows stuck reason.

## Stripe diagnostics

To inspect checkout state directly in Stripe:

`GET /api/checkout/status?session_id=<SESSION_ID>&include_stripe=1`

This returns DB fulfillment status plus Stripe session diagnostics (payment status, amount, price id, allowlist signal).

## Manual reprocess (admin-only)

Endpoint:

`POST /api/admin/checkout/reprocess`

Body:

```json
{ "session_id": "cs_test_..." }
```

Behavior:

- fetches Checkout Session from Stripe,
- runs the same fulfillment logic used by webhook,
- idempotent/dedupe safe (`stripeCheckoutSessionId` uniqueness),
- if email exists, ensures access provisioning (Profile + ClientMembership).

Possible outcomes:

- `deduped: false` → session was newly fulfilled,
- `deduped: true` → order already existed; provisioning re-ensured.

## UI recovery flow

1. Open stuck project in `/admin/projects/[id]`.
2. Paste Stripe session id in **Webhook recovery**.
3. Click **Reprocess checkout session**.
4. Verify project/order are now healthy and queue warning is gone.
