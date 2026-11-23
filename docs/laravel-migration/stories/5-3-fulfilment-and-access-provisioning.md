# Story 5.3: Fulfilment and access provisioning

**Status:** review (created from `origin/workbench/4-integrate` b2e1115) · **DoD variant:** Conversion · **Epic:** 5 · **Covers:** K-06, K-07, FR15, FR16, DV-4, N-01, N-02, N-10 · **Gate:** `@webhook&@api`, `@email&@api` (checkout emails) · **After:** 5.2, 4.4, 2.7 · **Stacks on:** `origin/workbench/4-integrate`; in the SERIAL chain, the previous Epic 5 story's branch (see `epic-5-build-order` in 5.7). Test mode and fakes only (stripe-fake, postmark-shim); live Stripe/Postmark is the owner's.

> Created with the repo's create-story form. All `apps/web` `file:line` read 2026-11-23; `apps/web` is frozen, so nothing here edits it.

## Story
As a customer who has paid, I get a project, my entitlements, an account and one email that lets me in, and the studio is told once.

## Acceptance criteria
1. **Paid only.** `payment_status !== "paid"` → `CheckoutSessionNotPaidError` (code `CHECKOUT_SESSION_NOT_PAID`) before any lookup or write (`checkout-fulfillment.ts:325-330`; permanent in 5.2). **100%-off promotion codes (critic B6):** with DV-1's `allow_promotion_codes`, a fully discounted session completes with `payment_status="no_payment_required"`. Until the owner decides **DV-25**, such a session is not fulfilled but is **never silent**: the same permanent path as an unknown session (event processed, audit, admin "Payment needs attention" email with the session ID), so a person can reprocess it after the owner's call. Test with a `no_payment_required` fixture. The same action serves the webhook and, in 5.6, reprocess.
2. **Package from line items.** Exactly one allowlisted price among the session's line items (up to 10), else the "allowlisted package" error (`:128-145`; permanent).
3. **Client.** Created with the inferred name (custom-field first/last name, else Stripe name, else the email local part, else "Logo Fountain Client"; `:102-127`), slug `{toSlug(name) or "logo-fountain-client"}-{last 8 of session id lowercased}` (`toSlug` `:55-60`; `:360-363`), `billing_email` = normalised purchaser email.
4. **Project and entitlements.** Project `AWAITING_BRIEF` with the package code; entitlements `concepts`/`revisions` 1/1 Essential, 2/2 Professional, 3/3 Complete, consumed and reserved 0 (`PACKAGE_ENTITLEMENTS` `:20-31`; `:386-393`; K-07).
5. **Order.** `FULFILLED` when a purchaser email exists, else `NEEDS_CONTACT`; currency lower-cased (default `gbp`); `total_cents` = the session's `amount_total` (the **discounted** figure once DV-1 allows codes); payment-intent ID when it is a string; **`campaign_slug` from `metadata.campaign_slug` (DV-4)**. Next never stores it on package orders (`:395-405`). `@deviation`.
6. **Audit.** In the same transaction: `order_fulfilled` `{orderId,orderStatus,checkoutSessionId}` and `state_changed` `{previousStatus:null,nextStatus:AWAITING_BRIEF}` (`:407-417`).
7. **Idempotent.** An existing order for the session ID → `deduped:true`, nothing created (`:341-353`). Concurrent first deliveries converge on one order (unique `stripe_checkout_session_id`, `schema.prisma:127`; 5.2 AC 5).
8. **Provisioning** (`ensureAccessProvisioning`, `:438-465`), only with a purchaser email: advisory lock on `provision:{email}` (`:451`); requires the client's billing email to equal the purchaser and a `FULFILLED` order (`:452`); user found by normalised email or created with `email_verified=false` (**payment is not mailbox proof**, never promote verified/admin; `:454-455`); profile upserted with first/last/full name (only non-null fields on update); owner membership created if missing; `needsSetup` = the user has **no credential with a password** (durable state, `:459-462`).
9. **Customer email once** (N-01/N-02). Marker: audit `email_sent:checkout_auth:{sessionId}` on the project (`webhook/route.ts:166-196`). Flow `setup` when `needsSetup`, else `signin`, through 4.4's `SendAuthLink` (auth mode, not queued). A skipped send is an error in production (retryable), tolerated otherwise (`:183-185`). The marker is written only after a real send. **Double-send guard (critic B4):** the marker check and the send (or dispatch) in `CompleteFulfilmentSideEffects` run inside a PostgreSQL advisory lock keyed on the checkout session id (`pg_advisory_xact_lock(hashtext('fulfil_side_effects:'||sessionId))`), held from the marker check to the marker write, so the webhook and reprocess (5.6) serialise and the second sees the marker. `LifecycleMail::sendOnce` (`app/Support/LifecycleMail.php:36,59`) checks then inserts with no lock or unique key on `audit_events`; it is called only under this lock. A crash between the send and the marker write resends on retry: **accepted**, it is Next's at-least-once behaviour. `@pg-race`.
10. **Admin email once** (N-10). For non-upsell sessions only, `notifyAdminNewProject` (own durable marker) through 2.7's pipeline; skipped in production → error (`:198-207`).
11. **Resumable.** If the customer or admin email fails after the order exists, the retry (5.2 transient) re-runs fulfilment as `deduped`, re-ensures provisioning and sends only what has no marker (`:148-207`).
12. **Missing email.** No purchaser email → order `NEEDS_CONTACT`, no user, no customer email; the admin email is still sent (`:156,198`; contract `webhook-fulfilment.spec.ts`). The status endpoint reports it `PENDING` (5.4).
13. **Test mode.** Sessions come from stripe-fake fixtures (`package-*-paid`, `purchase-*`); mail goes to the postmark-shim/Mailpit; no live key or address.

## Inventory scope
K-06, K-07, N-01, N-02, N-10, DV-4 (order half). Ledger rows for `checkout-fulfillment` tests (grep `test-port-ledger.md`).

## Next.js source read
`lib/checkout-fulfillment.ts:11-31,55-60,102-182,325-465`; `api/stripe/webhook/route.ts:148-207`; contract `webhook-fulfilment.spec.ts`, `webhook-payment-states.spec.ts`.

## Behaviour notes
- The inventory (K-06) says fulfilment creates a **message thread**; the fulfilment transaction (`:367-420`) creates none. Unverified where Next creates it (probably lazily on first message). See Open question 1.
- `purchaserEmailFromSession` (`:153-170`) is the one place the purchaser email is read; port its precedence exactly (session email, then customer details; read the function when building).
- The webhook response includes `purchaserEmail`, `provisionedUserId`, `isReturningCustomer` (`:220-231`); keep for parity (Stripe sees it, no browser).

## Laravel guidance
`app/Actions/Checkout/FulfilCheckout.php` (transaction via `Db` 2.4: client, project, entitlements, order, two audits), `ProvisionAccess.php` (advisory lock via `Locks`), `CompleteFulfilmentSideEffects.php` (customer + admin email with markers; shared with 5.6, ADR-015). Config `PACKAGE_ENTITLEMENTS` in one class (also used by 5.5's DV-2 maths).

## Planned deviations from Next.js
| ID | Deviation | Status |
|---|---|---|
| DV-4 | Campaign slug copied to `project_orders.campaign_slug` | Recommendation |
| DV-8 | Emails queued after commit (2.7), not inline. Applies to the **admin new-project email (N-10) only**; the customer auth email (AC 9) is sent in auth mode, not queued | Recommendation |
| DV-25 | 100%-off promotion codes: `no_payment_required` is alerted, not silent (see AC 1) | **Decided (owner, 2026-11-23)** |

## Tasks
1. Entitlement table + FulfilCheckout. 2. ProvisionAccess. 3. CompleteFulfilmentSideEffects. 4. Wire into 5.2's controller. 5. Tests. 6. Record, inventory, ledger, sprint-status.

## Test plan
| Layer | Test | Covers |
|---|---|---|
| L2 `@webhook&@api` | `tests/Feature/Checkout/FulfilCheckoutTest.php`: AC 1–7, 12 (3 tiers) | K-06, K-07 |
| L2 | `ProvisionAccessTest.php`: AC 8 (new, returning, never verified, setup vs signin) | K-06 |
| L2 `@email&@api` | `CheckoutEmailsTest.php`: AC 9–11 (each mail once; retry after a failed send) | N-01, N-02, N-10 |
| L2 `@deviation` | AC 5 campaign slug on the order | DV-4 |
| L3 `@pg-race` | concurrent provisioning for one email creates one user/membership | K-06 |
| L3 `@pg-race` | webhook and `CompleteFulfilmentSideEffects` concurrently for one session: customer and admin mail each sent once (advisory lock) | N-01, N-10 |
| L2 | `no_payment_required` session: not fulfilled, audit + admin alert, event processed | DV-25 |
| L2/L3 (moved from 5.2) | Real `FulfilCheckout` behind 5.2's ledger: N concurrent deliveries → one client/project/order; response fields `projectId`, `orderStatus`, `purchaserEmail`, `provisionedUserId`, `isReturningCustomer`; unknown session (line items 404) and reused payment intent (other session) → permanent + audit + admin "Payment needs attention" once; same-session reuse → `deduped` | 5.2 AC 5, 7, 11; DV-15 |
| L4 parity | `contract/webhook-fulfilment.spec.ts` (5); and, deferred from 5.2: `webhook-ledger.spec.ts`, `webhook-payment-states.spec.ts`, `journeys/deviations/dv-15-webhook-hopeless-failures.spec.ts:21,32` (DV-15 specs pass on Laravel, fail on Next) | K-05, K-06, DV-15 |

## Definition of done (Conversion, `epics.md:35`)
`bin/test` green (Pint, Larastan level 9, Pest) with the tests below; the Conversion record filled; inventory Laravel/Tests columns, ledger rows, `sprint-status.yaml` → `review`, and one line each in DECISIONS / RISKS / ASSUMPTIONS where something was decided. No `apps/web` change. **Test mode only:** every Stripe call goes to stripe-fake (`STRIPE_SECRET_KEY` a `sk_test_…` value, `api_base` pointed at the fake) and every mail to the postmark-shim or Mailpit; no live Stripe or Postmark key, webhook secret or price ID is read, written or configured (live mode is the owner's). L4/L5 parity runs only where the header's gate says so. **Conversion variant (`epics.md:35`):** the Next result equals `tests/parity/expected-next-failures.txt` (the deviation specs named in the test plan fail on Next, everything else passes); every earlier gate stays green on Laravel; Laravel page-object methods the story's journeys use are implemented in `tests/parity/pages/laravel/` (accessible locators first, `data-testid` only in Laravel objects, shared journeys unchanged). The parity specs listed in the test plan run on Laravel and on Next.

## Open questions (with recommendations)
1. **Message thread at fulfilment.** K-06 lists one; Next's fulfilment does not create it. *Recommendation:* match the code (none), and let the messages story (Epic 6) create the thread lazily; check against the inventory row when closing.
2. **Name on an existing profile.** Next only overwrites with non-null checkout names (`:456-458`). *Recommendation:* keep.
3. **Owner items: DV-25** (100%-off promotion codes), see the inventory row. When this closes, correct the K-06 inventory row (no message thread at fulfilment).

## Conversion record

### Inventory scope
K-06, K-07, N-01, N-02, N-10, DV-4 (order half).
### Next.js source read
`checkout-fulfillment.ts`, `webhook/route.ts:148-207`.
### Behaviour notes
Customer email: sent synchronously in auth mode (not queued), marker `email_sent:checkout_auth:{session}` written AFTER the send, as Next (`webhook/route.ts:166-196`). A crash between send and marker resends on retry: at-least-once, never a dropped customer email. Admin new-project email: marker written at dispatch, job queued after commit (2.7, ADR-019, DV-8); the gap there (crash after commit, before the job row) is recorded in RISKS. No message thread is created at fulfilment (Next does not).
### Laravel implementation
`FulfilCheckout` (one transaction: client, project, entitlements, order, two audits; unique session id converges concurrent deliveries; a unique `stripe_payment_intent_id` violation by another session is DV-15 `paymentIntentReused`), `ProvisionAccess` (lock `provision:{email}`), `CompleteFulfilmentSideEffects` (each email in its own transaction under `Locks::fulfilSideEffects`), `CheckoutSessionData`, `PackageEntitlements`; `FulfilsCheckout` now bound to `FulfilCheckout` (the 5.2 stub is gone). Upsell sessions throw a retryable `UPSELL_NOT_AVAILABLE` until 5.5.
### Deviations from Next.js
| Behaviour | Next.js | Laravel | Why | Decision ref |
|---|---|---|---|---|
| Campaign slug | stays in Stripe metadata | copied to `project_orders.campaign_slug` | attribution | DV-4 |
| Admin email | inline | queued after commit | ADR-018/019 | DV-8 |
| 100%-off session | closed silently | permanent, audited, admin alerted | never silent | DV-25 ((decided, owner 2026-11-23)) |
| Double-send guard | none (a concurrent webhook and reprocess can both send) | advisory lock `fulfil_side_effects:{session}` serialises them | critic B4 | Built as recommended; not in the owner list (DV-19..26 and 4.x Q1-Q5 only): architecture §5 lists three locks; this is a fourth. The ADR is not edited. |
### Tests
| Layer | Test file / title | Inventory IDs |
|---|---|---|
| L2 | `tests/Feature/Checkout/FulfilCheckoutTest.php` (fulfil, refuse unpaid/no_payment_required, one allowlisted price, NEEDS_CONTACT, provision + each email once across retries) | K-06, K-07, N-01, N-10 |
| L2 | `tests/Feature/Checkout/WebhookFulfilmentTest.php` (route over the real fulfiller: response fields, second event for one session `deduped`, lease renewed mid-fulfilment, claim lost mid-fulfilment aborts before any email) | K-05, K-06 |
| L3 `@pg-race` | `tests/Concurrency/FulfilSideEffectsRaceTest.php`: 6 processes, customer and admin mail each once (fails with 7 mails when the lock is removed) | N-01, N-10 |
| L3 `@pg-race` | `tests/Concurrency/LocksTest.php` (fourth lock: key, commit, rollback, outside a transaction) | X-09 |
### Test evidence
Pest on the builder's own stack: the files above pass (see the report). Not run: L4 parity (`contract/webhook-fulfilment.spec.ts` and the deferred 5.2 specs); ProvisionAccess has no dedicated file (covered through FulfilCheckoutTest); the concurrent-provisioning `@pg-race` row of the plan is not built.
### Gotchas
Race children need `POSTMARK_FROM` (the container's `.env` leaves it empty, so auth mail counts as unconfigured and is silently skipped outside production); `RaceChildren::run` takes extra env for that. `LocksTest` had an apostrophe parse error in a test title (fixed).
### Docs updated
Inventory K-05, K-06, K-07, N-10; ledger rows 52, 80 (and row 5 reverted: it is 5.6's); sprint-status; DECISIONS, RISKS.
### Open items
DV-25 and the fourth lock await the owner. Concurrent-provisioning race test. N-01/N-02 inventory rows still point at 4.4 only.

**L4 parity run (2026-11-23, workbench/parity-4-5):** @auth 37 tests: Next 37 pass; Laravel 15 pass / 11 fail / 11 not reached. @checkout 28: Next 28 pass; Laravel 1 / 20 / 7. @entitlements 10: Next 10 pass; Laravel 0 / 10 / 0. Failures are the unwired Stripe/Postmark/Mailpit infra on the Laravel stack and not-yet-built pages/routes, listed with titles in `docs/laravel-migration/parity-run-2026-11-23.md`. This story's parity tests are not shown to match: stays at `review`.
