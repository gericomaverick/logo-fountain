# Story 5.1: Checkout start

**Status:** done (created from `origin/workbench/4-integrate` b2e1115) · **DoD variant:** Conversion · **Epic:** 5 · **Covers:** K-01, K-13, DV-1, DV-4, DV-5, FR12, FR13 · **Gate:** `@checkout&@api`, `@deviation` (DV-1, DV-5) · **After:** 1.3, 0.5 · **Stacks on:** `origin/workbench/4-integrate`; in the SERIAL chain, the previous Epic 5 story's branch (see `epic-5-build-order` in 5.7). Test mode and fakes only (stripe-fake, postmark-shim); live Stripe/Postmark is the owner's.

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
8. **Price map.** Package → price ID lives in config, beside the display price (as K-08's note requires); placeholder IDs are detected at boot: **production refuses to boot** with one, other environments log it (`AGENTS.md` §5 boot validation, `ConfigBootValidationTest.php`; Next only logs, `lib/stripe.ts:19-27`). Tests use the fake's price IDs from `tests/parity/fixtures/stripe/prices.json`.
9. **No account needed.** The route is public and anonymous; no Origin guard (it is a `GET` that redirects) and no session read.

## Inventory scope
K-01, K-13 (promotion codes), DV-1, DV-4 (metadata half), DV-5. Ledger rows for `checkout/start` if any (grep `test-port-ledger.md`).

## Next.js source read
`app/checkout/start/route.ts:1-71`; `lib/stripe.ts:8-36`; contract `journeys/contract/checkout-contracts.spec.ts`.

## Behaviour notes
- Next's cancel origin falls back to the request origin when no marketing URL is configured (`:28`); Laravel config validation (1.3) makes the marketing URL required in production, so no fallback.
- The session is created per request with no limiter (see Open question 2).

## Laravel guidance
`app/Actions/Checkout/StartCheckout.php` (plain class), `app/Http/Controllers/Api/CheckoutStartController.php`, a `StripeCatalog` helper (package and upsell price maps, shared with 5.5). `StripeClient` from a container binding with `stripe_version=2026-02-25.clover` (ADR-014); the test binding sets `api_base` to stripe-fake. Return `redirect()->away($url, 303)`.

## Planned deviations from Next.js
| ID | Deviation | Status |
|---|---|---|
| DV-1 | `allow_promotion_codes=true` | Owner-approved |
| DV-4 | Campaign slug in metadata (order copy in 5.3) | Recommendation |
| DV-5 | Canonical URLs | Recommendation |
| **DV-20** | Fixed error message, no Stripe text to the caller | **Decided (owner, 2026-11-23)** |

## Tasks
1. Catalog + client binding. 2. StartCheckout + controller + route. 3. Tests. 4. Record, inventory (add DV-20 row), ledger, sprint-status.

## Test plan
| Layer | Test | Covers |
|---|---|---|
| L2 `@checkout&@api` | `tests/Feature/Checkout/CheckoutStartTest.php`: AC 1, 4–6, 9 against stripe-fake | K-01 |
| L2 `@deviation` | AC 2 (promo flag), AC 3 (forged forwarded headers), AC 7 (generic message) | K-13, DV-1, DV-5, DV-20 |
| L1 | `StripeCatalogTest.php`: maps, placeholder detection | K-01 |
| L4 parity | `contract/checkout-contracts.spec.ts` start cases | K-01 |
| L4 parity `@deviation` | `journeys/deviations/dv-checkout.spec.ts:43` (DV-1, packages half) and `:58` (DV-5, start half): pass on Laravel, fail on Next (listed in `expected-next-failures.txt`) | DV-1, DV-5 |

## Definition of done (Conversion, `epics.md:35`)
`bin/test` green (Pint, Larastan level 9, Pest) with the tests below; the Conversion record filled; inventory Laravel/Tests columns, ledger rows, `sprint-status.yaml` → `review`, and one line each in DECISIONS / RISKS / ASSUMPTIONS where something was decided. No `apps/web` change. **Test mode only:** every Stripe call goes to stripe-fake (`STRIPE_SECRET_KEY` a `sk_test_…` value, `api_base` pointed at the fake) and every mail to the postmark-shim or Mailpit; no live Stripe or Postmark key, webhook secret or price ID is read, written or configured (live mode is the owner's). L4/L5 parity runs only where the header's gate says so. **Conversion variant (`epics.md:35`):** the Next result equals `tests/parity/expected-next-failures.txt` (the deviation specs named in the test plan fail on Next, everything else passes); every earlier gate stays green on Laravel; Laravel page-object methods the story's journeys use are implemented in `tests/parity/pages/laravel/` (accessible locators first, `data-testid` only in Laravel objects, shared journeys unchanged). The parity specs listed in the test plan run on Laravel and on Next.

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
Anonymous GET. `package_code` matched exactly and case-sensitively against the server map; anything else, a raw price ID included, is 400 INVALID_PACKAGE with no Stripe call. The query is read raw (`searchParams.get`), because Laravel's TrimStrings would accept " complete". Campaign slug: JS trim, empty omitted, cut at 80 UTF-16 units. Success is a 303 to `session.url`.
### Laravel implementation
`app/Actions/Checkout/StartCheckout.php`, `app/Http/Controllers/Api/CheckoutStartController.php`, `routes/checkout.php` (no `web` group: no session, no cookie), `app/Support/Stripe/StripeCatalog.php` + `config/catalog.php`, the `StripeClient` singleton (`AppServiceProvider`, version 2026-02-25.clover, `services.stripe.api_base` as test seam), placeholder check in `ConfigValidationServiceProvider`, `NodeCompat::slice`, three new error codes. `stripe/stripe-php ^22.1` added; no Cashier.
### Deviations from Next.js
| Behaviour | Next.js | Laravel | Why | Decision ref |
|---|---|---|---|---|
| Promotion codes | not enabled | `allow_promotion_codes=true` | F-1 | DV-1 (owner) |
| Return URLs | from request headers | from `PUBLIC_SITE_URL` / marketing URL | forged Host | DV-5 |
| Stripe failure message | echoes Stripe's text | fixed text, detail to log | provider leak | DV-20, (decided, owner 2026-11-23) |
| Placeholder price ID | logged at boot | production refuses to boot; elsewhere logged | AGENTS.md §5 | story AC 8 |
### Tests
| Layer | Test file / title | Inventory IDs |
|---|---|---|
| L2 | `tests/Feature/Checkout/CheckoutStartTest.php` (shape, anonymity, price map, invalid codes, slug, URL missing, 503, DV-1, DV-5, DV-20) | K-01, K-13 |
| L1 | `tests/Feature/Checkout/StripeCatalogTest.php` | K-01 |
| L2 | `ConfigBootValidationTest.php` (production placeholder refusal, real process) | K-01 |
| L4 | `contract/checkout-contracts.spec.ts`, `dv-checkout.spec.ts:43,:58`: NOT RUN | K-01, DV-1, DV-5 |
### Test evidence
`bin/test` in `apps/portal` (stack lf-wb21): check-agents-guide, Pint, Larastan level 9 clean; Pest 2029 passed, 1 warning (5811 assertions). Stripe is the in-process `tests/Support/FakeStripe.php` (stripe-php HTTP client); the stripe-fake container was not used, so the fake's own recording of the flag is unchecked.
### Parity
Parity (wrap-up re-run, 2026-11-23): `checkout.start` page object built. @checkout on Laravel: K-01 x3 (INVALID_PACKAGE, 303 allowlisted, campaign slug), DV-1, DV-5 pass; Next 30/30. Own tests match Next.
### Gotchas
stripe-php sends booleans as the text "true"/"false". Larastan needed an ignore on the generated param shape. No Next test file exists for this route, so there is no ledger row to fill.
### Docs updated
Inventory K-01, K-13, DV-20 rows; sprint-status → review; DECISIONS, RISKS, ASSUMPTIONS one line each; `.env.example` (STRIPE_API_BASE); `compose.yaml` mounts the stripe fixtures.
### Open items
Owner: DV-20 (and DV-1, DV-5 already recommended). Rate limit on the route not built (RISKS). L4 parity and Laravel page objects not run or built here.

**L4 parity run (2026-11-23, workbench/parity-4-5):** @auth 37 tests: Next 37 pass; Laravel 15 pass / 11 fail / 11 not reached. @checkout 28: Next 28 pass; Laravel 1 / 20 / 7. @entitlements 10: Next 10 pass; Laravel 0 / 10 / 0. Failures are the unwired Stripe/Postmark/Mailpit infra on the Laravel stack and not-yet-built pages/routes, listed with titles in `docs/laravel-migration/parity-run-2026-11-23.md`. This story's parity tests are not shown to match: stays at `review`.
