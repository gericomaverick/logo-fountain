# Story 5.1: Checkout start

**Status:** ready-for-dev (created from `origin/workbench/4-integrate` b2e1115) · **DoD variant:** Laravel-only · **Epic:** 5 · **Covers:** K-01, K-13, DV-1, DV-4, DV-5, FR12, FR13 · **Gate:** `@checkout&@api`, `@deviation` (DV-1, DV-5) · **After:** 1.3, 0.5 · **Stacks on:** `origin/workbench/4-integrate`; in the SERIAL chain, the previous Epic 5 story's branch (see `epic-5-build-order` in 5.7). Test mode and fakes only (stripe-fake, postmark-shim); live Stripe/Postmark is the owner's.

> Created with the repo's create-story form. All `apps/web` `file:line` read 2026-11-23; `apps/web` is frozen, so nothing here edits it.

## Story
As a prospect on the marketing site, I can start a package checkout (optionally tagged with a campaign) and land on Stripe's page, where I can enter a promotion code.

## Acceptance criteria
1. **Session shape.** `GET /checkout/start?package_code=complete&campaign_slug=x` creates one Stripe Checkout Session: `mode=payment`, `customer_creation=always`, `billing_address_collection=auto`, phone collection off, `invoice_creation.enabled`, one line item (price from the server map, quantity 1), and two required text custom fields `first_name` / `last_name` (min 1, max 80) (`checkout/start/route.ts:31-62`).
2. **Promotion codes (DV-1).** The session carries `allow_promotion_codes=true`. Next sends none (absent from `:31-62`). `@deviation`: stripe-fake records the flag.
3. **Canonical URLs (DV-5).** `success_url` = `{PUBLIC_SITE_URL}/checkout/success?session_id={CHECKOUT_SESSION_ID}`; `cancel_url` = `{PUBLIC_MARKETING_SITE_URL}/#packages`. Both come from config (1.3), never from `Host`/`X-Forwarded-*`. Next derives the success origin from the request (`:27,36`) and falls back to it for cancel (`:28,37`). `@deviation`: a request with a forged `X-Forwarded-Host` still yields canonical URLs.
4. **Allowlist.** `package_code` must be exactly `essential`, `professional` or `complete` (case-sensitive); anything else, including a raw `price_…` ID, is `400 {error:{code:"INVALID_PACKAGE",message:"Invalid package_code. Expected one of: essential, professional, complete"}}` and **no Stripe call** (`:7-10,20-24`).
5. **Campaign slug.** Trimmed, cut to 80 characters, omitted when empty; sent only as `metadata.campaign_slug` next to `metadata.package_code` (`:12-16,58-61`). It is copied to the order in 5.3 (DV-4).
6. **Success.** Redirect `303` to `session.url` (`:64-66`). A session without a URL → `500 CHECKOUT_URL_MISSING` (`:64`).
7. **Stripe failure.** → `500 {error:{code:"CHECKOUT_SESSION_FAILED",message:…,nextStep:"Verify Stripe configuration and retry."}}` (`:67-70`). **Proposed DV-20:** the message is a fixed string; Next echoes `error.message` from Stripe (`:68-69`). The detail goes to the log only.
8. **Price map.** Package → price ID lives in config, beside the display price (as K-08's note requires); placeholder IDs are detected at boot and logged (`lib/stripe.ts:19-27`, unverified beyond those lines). Tests use the fake's price IDs from `tests/parity/fixtures/stripe/prices.json`.
9. **No account needed.** The route is public and anonymous; no Origin guard (it is a `GET` that redirects) and no session read.

## Inventory scope
K-01, K-13 (promotion codes), DV-1, DV-4 (metadata half), DV-5. Ledger rows for `checkout/start` if any (grep `test-port-ledger.md`).

## Next.js source read
`app/checkout/start/route.ts:1-71`; `lib/stripe.ts:8-36`; contract `journeys/contract/checkout-contracts.spec.ts`.

## Behaviour notes
- Next's cancel origin falls back to the request origin when no marketing URL is configured (`:28`); Laravel config validation (1.3) makes the marketing URL required in production, so no fallback.
- The session is created per request with no limiter (see Open question 2).

## Laravel guidance
`app/Actions/Checkout/StartCheckout.php` (plain class), `app/Http/Controllers/Checkout/CheckoutStartController.php`, a `StripeCatalog` helper (package and upsell price maps, shared with 5.5). `StripeClient` from a container binding with `stripe_version=2026-02-25.clover` (ADR-014); the test binding sets `api_base` to stripe-fake. Return `redirect()->away($url, 303)`.

## Planned deviations from Next.js
| ID | Deviation | Status |
|---|---|---|
| DV-1 | `allow_promotion_codes=true` | Owner-approved |
| DV-4 | Campaign slug in metadata (order copy in 5.3) | Recommendation |
| DV-5 | Canonical URLs | Recommendation |
| **DV-20** | Fixed error message, no Stripe text to the caller | **Proposed, awaiting owner** |

## Tasks
1. Catalog + client binding. 2. StartCheckout + controller + route. 3. Tests. 4. Record, inventory (add DV-20 row), ledger, sprint-status.

## Test plan
| Layer | Test | Covers |
|---|---|---|
| L2 `@checkout&@api` | `tests/Feature/Checkout/CheckoutStartTest.php`: AC 1, 4–6, 9 against stripe-fake | K-01 |
| L2 `@deviation` | AC 2 (promo flag), AC 3 (forged forwarded headers), AC 7 (generic message) | K-13, DV-1, DV-5, DV-20 |
| L1 | `StripeCatalogTest.php`: maps, placeholder detection | K-01 |
| L4 parity | `contract/checkout-contracts.spec.ts` start cases | K-01 |

## Definition of done (Laravel-only, `epics.md:35`)
`bin/test` green (Pint, Larastan level 9, Pest) with the tests below; the Conversion record filled; inventory Laravel/Tests columns, ledger rows, `sprint-status.yaml` → `review`, and one line each in DECISIONS / RISKS / ASSUMPTIONS where something was decided. No `apps/web` change. **Test mode only:** every Stripe call goes to stripe-fake (`STRIPE_SECRET_KEY` a `sk_test_…` value, `api_base` pointed at the fake) and every mail to the postmark-shim or Mailpit; no live Stripe or Postmark key, webhook secret or price ID is read, written or configured (live mode is the owner's). L4/L5 parity runs only where the header's gate says so.

## Open questions (with recommendations)
1. **DV-20 (no Stripe text in the 500).** *Recommendation:* approve; it is a leak of provider detail to an anonymous caller.
2. **Rate limit on `/checkout/start`.** Anonymous `GET` creates a real Stripe session each time (no limiter in Next). *Recommendation:* out of scope here; raise with the owner as a risk (RISKS.md), not built.
3. **Owner items:** DV-20 only.

## Conversion record

### Inventory scope
K-01, K-13, DV-1, DV-4 (metadata), DV-5.
### Next.js source read
`checkout/start/route.ts`, `lib/stripe.ts`.
### Behaviour notes
(fill on review)
### Laravel implementation
(fill on review)
### Deviations from Next.js
| Behaviour | Next.js | Laravel | Why | Decision ref |
|---|---|---|---|---|
(fill on review)
### Tests
| Layer | Test file / title | Inventory IDs |
|---|---|---|
(fill on review)
### Test evidence
(fill on review)
### Gotchas
(fill on review)
### Docs updated
(fill on review)
### Open items
(fill on review)
