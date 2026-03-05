# Invoice + Email delivery behavior notes

## Stripe checkout invoice documents (paid-state safe)

- Checkout uses `mode=payment` + `invoice_creation.enabled=true`.
- In this lifecycle, Stripe can expose invoice artifacts before the invoice object has clearly settled into a paid-safe representation.
- To avoid misleading clients with invoice documents that can still present "amount due" semantics, settled (`FULFILLED`) orders now prefer the payment **receipt URL** as the download artifact.
- For unsettled/non-fulfilled orders, invoice links are still allowed.

### Sandbox vs production

- Stripe test and live modes follow the same API object lifecycle (`Checkout Session -> PaymentIntent/Charge -> Invoice`).
- Timing and rendering lag can differ in sandbox vs production, but paid-safe behavior in app code is now deterministic: fulfilled orders prioritize receipts over hosted invoice pages/PDF links.

## Email branding behavior

- All transactional email builders use `renderBrandedEmail`.
- Logo resolution order:
  1. `EMAIL_LOGO_URL` absolute URL (preferred)
  2. `PUBLIC_SITE_URL`/`NEXT_PUBLIC_SITE_URL` absolute origin + `/img/logo.svg` (non-localhost)
  3. Embedded inline SVG logo fallback for local/dev or missing public origin.

## Lifecycle delivery reliability

- Client recipient resolution now falls back to the owner membership email when `client.billingEmail` is empty.
- Concept-ready and revision-ready notifications remain deduped by audit event key and are only marked sent after successful Postmark delivery.
