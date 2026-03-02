# Stripe Fulfillment Smoke Test (LF-0204/LF-0205)

## 1) Start app + webhook forwarder

```bash
cd apps/web
npm run dev
```

In a second terminal:

```bash
stripe listen --forward-to localhost:3000/api/stripe/webhook
```

Copy the printed webhook signing secret into `apps/web/.env.local` as `STRIPE_WEBHOOK_SECRET`.

## 2) Trigger a checkout completion event

Use Stripe CLI fixture trigger:

```bash
stripe trigger checkout.session.completed
```

## 3) Verify fulfillment in DB

```bash
cd apps/web
npx prisma studio
```

Confirm one set of records created:
- `StripeEvent` row for the event id (`processedAt` populated)
- `Client` row
- `Project` row with `status=AWAITING_BRIEF`
- `ProjectOrder` row with `stripeCheckoutSessionId`, `stripePaymentIntentId`, `currency`, `totalCents`
- `ProjectEntitlement` rows for package defaults
- If purchaser email is present: `ProjectOrder.status=FULFILLED`, plus `Profile` row and `ClientMembership` row (`role=owner`)
- If purchaser email is missing: DB records still exist, but `ProjectOrder.status=NEEDS_CONTACT` and no membership is required yet

## 4) Verify idempotency

Replay the same event id via Stripe dashboard (Events → Resend) or Stripe CLI replay.

Expected:
- No duplicate `ProjectOrder` / `Project` / `Client` rows.
- No duplicate `Profile` or `ClientMembership` rows for the same purchaser.
- Webhook returns deduped response.

## 5) Verify checkout status polling endpoint

```bash
curl "http://localhost:3000/api/checkout/status?session_id=<stripe_checkout_session_id>"
```

Expected fulfilled payload after webhook success:

```json
{
  "sessionId": "cs_test_...",
  "fulfilled": true,
  "status": "FULFILLED",
  "projectId": "...",
  "orderId": "..."
}
```
