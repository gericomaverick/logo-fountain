# Story 0.5: Stripe fixtures and webhook scenarios

Status: review

**Covers:** K-01 (fixtures only), K-05, K-06 (plus K-07, K-09, K-02 status, N-01, N-02, N-10 as asserted) · **Gate:** `@webhook&@api` · **After:** 0.2, 0.3, 0.4 · **DoD:** E0

## Delivered
- `tests/parity/fixtures/stripe/`: 8 new fixtures beside 0.2's three `package-*-paid` and `prices.json`. All load at stripe-fake startup and `/__reset`, and the 0.2 selftest still passes.
  - `purchase-unpaid`: complete/unpaid, Bacs pending. Covers unpaid, delayed success and delayed failure.
  - `purchase-missing-email`: no email in `customer_details` or on the customer.
  - `purchase-multi-line-item`: essential plus professional.
  - `purchase-non-allowlisted-price`: carries its own price and `metadata.package_code=essential`.
  - `purchase-returning-customer`: `Client.A@Parity.Test`, the seeded `awaiting-brief` user.
  - `upsell-addon-extra-revision`, `upsell-upgrade-essential-professional`, `upsell-upgrade-professional-complete`: `{{projectId}}` placeholder.
- `tests/parity/adapters/stripe.ts`:
  - `loadStripeFixture` gives every ID, and every `@example.test` address, a per-test suffix. `keepEmails` keeps the addresses; `vars`, `sessionOverrides` and `patchSession` adjust the session.
  - `buildEvent`, `signPayload` and `deliverEvent` sign events like `infra/stripe-fake/server.mjs:206` and POST them to the target, so a test controls the event ID.
  - Read-backs: `checkoutStatus`, `projectsForSession`, `adminSnapshot`, `auditEvents`.
  - `buyPackage`, `failNextEmailSends`, and `withEmailFailures` (a cross-worker lock, because postmark-shim `/__fail` is global).
  - `seedOnceForRun`: seeds once per Playwright run, because seeding truncates and the files run in parallel.
  - `signInSerialised`/`adminClient`: one sign-in at a time, cached per worker.
- `tests/parity/adapters/mail.ts` (reused by 0.8a):
  - Mailpit `searchMessages`, `messagesTo`, `messagesContaining`, `getMessage`, `waitForMessages` (waits for the count, then a settle window so "exactly once" holds), `extractLinks`, `deleteMessages` (query required) and `SUBJECTS`.
- `tests/parity/journeys/contract/`, 20 tests:
  - `webhook-ledger.spec.ts` (7): signature cases, duplicate → deduped, new event for the same session → order reused, 6 concurrent → exactly one fulfilment, ignored types, a Stripe 404 → transient and the same-ID retry fulfils, an email failure → retry.
  - `webhook-fulfilment.spec.ts` (5): 3 tiers × entitlements, setup link and admin mail; returning customer gets a sign-in link; missing email → NEEDS_CONTACT.
  - `webhook-payment-states.spec.ts` (5): unpaid; delayed success with a stale payload (proves the fresh retrieve); delayed failure; multi-line-item; non-allowlisted.
  - `webhook-upsell.spec.ts` (3): add-on +1 once; essential→professional 2/2; professional→complete 3/3. These follow the current Next behaviour; DV-2 is story 0.8e.

## Evidence (2026-11-19)
Private stack `docker compose -p lf05` (PG 55530, Mailpit 58050, S3 58350, shim 58051, fake 58052). Next dev runs on 4340 (`--webpack`, `0.0.0.0`) per the README recipe. The shared stack wasn't touched.
- Gate `@webhook&@api` on Next: **20/20**, twice. Then `--repeat-each=3`: **60/60**.
- `npm run check`: OK (5 files).
- `infra:probe` on lf05: s3, mail and stripe OK, stripe-fake selftest **15/15**, and `/__reset` loads all 12 fixtures. The postgres step fails only because that DB was already migrated (the probe expects an empty `public`).

## Next behaviour worth knowing (brownfield checkout-and-payments.md)
1. §3.7: a Postmark **failure**, as opposed to a skip, throws.
   - The throw comes from `lib/auth/service.ts:54`, and the default classification is transient (`webhook-error-classification.ts`). The webhook returns 500 `retry:true`.
   - Fulfilment has already committed (`app/api/stripe/webhook/route.ts:148` before `:174`), so `/api/checkout/status` reads FULFILLED during the 500.
   - The retry returns `deduped:true` (`checkout-fulfillment.ts:346`), and exactly one setup email and one admin email go out.
2. Upsells also send the checkout auth email (`route.ts:166-196`, gated only on there being an email). A buyer without a password gets a **second setup email**; there's no second admin email (`:198`).
3. NEEDS_CONTACT still sends the admin new-project email (`route.ts:198-207`), and `/api/checkout/status` reads PENDING for it (`app/api/checkout/status/route.ts:23`).
4. A session unknown to Stripe is classified **transient** (the default), so Stripe retries it: `listLineItems` 404 at `checkout-fulfillment.ts:130`.
5. Not in brownfield, and hit while building the tests: a new package session that reuses a payment-intent ID gets P2002 on `ProjectOrder.stripePaymentIntentId @unique` (`prisma/schema.prisma:128`). That's classified transient, so it's retried forever.
6. Read from code, not exercised: an upsell paid with an email ≠ `client.billingEmail` fails provisioning (`checkout-fulfillment.ts:452`) **after** the order is committed. Every retry dedupes and then fails again, giving 500s for good. Recommend a brownfield note and an owner decision for story 5.5.
7. `async_payment_failed` redelivery isn't deduped (upsert, `route.ts:57-76`). This matches §3.2.
8. Harness: Next reserves a per-email login slot before checking the password (`lib/auth/rate-limit.ts:46`, limit 5), so more than 5 parallel sign-ins of one account fail with the right password. Hence `signInSerialised`.

## Open items
- **Laravel:** `failNextEmailSends` drives postmark-shim, which is Next's transport. Laravel uses SMTP → Mailpit, so stories 5.2/5.3 need an equivalent, such as Mailpit chaos (`--enable-chaos`) or an SMTP shim. Until then the email-failure test can't pass on Laravel.
- Any other spec that calls `seed()` in the same run would truncate under these tests. Contract suites should share `seedOnceForRun` (or a global setup), and parent coordination is needed with 0.7a–c.
- The returning-customer test shares `client.a@parity.test` in Mailpit with other suites. It filters by the test's start time.
- Parent to update: inventory K-05, K-06, K-07, K-09, K-02, N-01, N-02, N-10 (Next parity tests exist, `@webhook&@api`); brownfield §3/§4.4 with points 1, 2, 5 and 6; test-strategy §3 (Mailpit adapter); sprint-status.
