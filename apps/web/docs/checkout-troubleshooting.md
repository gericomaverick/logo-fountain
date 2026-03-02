# Checkout troubleshooting

This guide covers delayed `/checkout/success` processing and how to diagnose `GET /api/checkout/status` responses.

## When success page shows troubleshooting panel (after ~45s)

The success page now keeps polling and, after 45 seconds, shows explicit troubleshooting steps and a **Retry now** button.

Check the following:

1. **Webhook forwarding is running** (local/dev)
   - Example: `stripe listen --forward-to localhost:3000/api/stripe/webhook`
2. **Webhook secret is correct**
   - Ensure your env var matches the signing secret used by Stripe CLI/dashboard.
3. **Server is running and reachable**
   - Confirm your app process is alive and the webhook endpoint responds.
4. **Retry status**
   - Use **Retry now** on the success page to trigger an immediate check.

## Checkout status diagnostics API

Endpoint:

- `GET /api/checkout/status?session_id=<id>`

Optional diagnostics mode when no order exists yet:

- `GET /api/checkout/status?session_id=<id>&include_stripe=1`

If no local order is found, the response can include safe Stripe diagnostics under `stripe`:

- `exists` (boolean)
- `payment_status`
- `customer_email`
- `amount_total`
- `currency`
- `line_item_price_id`
- `allowlisted_price_id`
- `allowlist_hint`
- `jsonError.message` (if Stripe retrieval failed)

No secrets are returned in this payload.

## Typical flow

- Stripe checkout completes.
- Stripe sends `checkout.session.completed` webhook.
- Webhook handler creates/fulfills local order.
- `/api/checkout/status` returns `fulfilled: true` and client redirects.

If webhook delivery is delayed or misconfigured, diagnostics help identify whether Stripe has a completed session while local fulfillment is still pending.
