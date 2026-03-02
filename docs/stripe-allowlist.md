# Stripe price allowlist sanity checks

This project keeps a package-code → Stripe price-ID allowlist in:

- `apps/web/src/lib/stripe-price-allowlist.ts` (shared mapping + placeholder detection)
- `apps/web/src/lib/stripe.ts` (server runtime guard + Stripe client)

## Placeholder detection rules

A price ID is treated as a placeholder when:

- it is empty / missing, or
- it contains `REPLACE` (case-insensitive)

Examples:

- `price_REPLACE_ESSENTIAL` → placeholder ❌
- `""` / missing → placeholder ❌
- `price_1ScMRpFM0K9Qd7oX...` → valid ✅

## Runtime behavior

### Server startup/runtime guard

`src/lib/stripe.ts` exports `STRIPE_PLACEHOLDER_PRICE_IDS` and logs an error if any placeholders are present.

### Admin health check

`GET /api/admin/health` includes check key `stripe_allowlist`.

- **Pass** when no placeholders are detected.
- **Fail** when placeholders exist.
- Failure `nextStep`: `Update src/lib/stripe.ts.`

### Pricing UI safety

`/pricing` checks the selected package locally before starting checkout.

If a package maps to a placeholder price ID, checkout is blocked and a clear error is shown to the user.

## How to update

1. Open `apps/web/src/lib/stripe-price-allowlist.ts`
2. Replace placeholder values in `PACKAGE_TO_PRICE_ID` with real Stripe `price_...` IDs
3. Redeploy / restart
4. Verify `/api/admin/health` reports `stripe_allowlist` as passed
