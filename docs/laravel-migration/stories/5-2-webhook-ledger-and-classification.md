# Story 5.2: Webhook ledger and classification

**Status:** review (created from `origin/workbench/4-integrate` b2e1115) · **DoD variant:** Conversion · **Epic:** 5 · **Covers:** K-05, ADR-014, DV-15, NFR-R1 · **Gate:** `@webhook&@api`, `@pg-race`, `@deviation` (DV-15) · **After:** 2.4, 0.5 · **Stacks on:** `origin/workbench/4-integrate`; in the SERIAL chain, the previous Epic 5 story's branch (see `epic-5-build-order` in 5.7). Test mode and fakes only (stripe-fake, postmark-shim); live Stripe/Postmark is the owner's.

> Created with the repo's create-story form. All `apps/web` `file:line` read 2026-11-23; `apps/web` is frozen, so nothing here edits it.

## Story
As the system, I accept Stripe's events safely: verified, deduplicated, claimed once, retried when it can succeed and settled when it never will.

## Acceptance criteria
1. **Signature.** Raw body, timestamp tolerance Stripe's default 300 s (an older signed replay → `400`; one test), `Stripe-Signature` checked with the webhook secret (`webhook/route.ts:38-44`). No secret configured → `400` plain text (`:27-33`); no header → `400 "Missing stripe-signature header"` (`:35-36`); bad signature → `400 "Webhook signature verification failed: …"` (`:42-44`). The route has **no Origin guard** and no session (Stripe is not a browser); it is exempt from CSRF/Origin middleware by an explicit route group and an arch test.
2. **Other event types.** Only `checkout.session.completed` and `checkout.session.async_payment_succeeded` fulfil (`:46-48`). Every other type is upserted as a processed ledger row and answered `200 {received:true,ignored:true,id,type}`; `async_payment_failed` answers `{received:true,paymentFailed:true,…}` and logs a warning without the payload (`:50-78`).
3. **Claim.** A new event inserts a ledger row whose `type` is the marker `processing:{ms}:{uuid}:{eventType}` (`:17-19,80-89`). A unique violation on the event ID with `processed_at` set → `200 {received:true,deduped:true}` (`:91-95`).
4. **Lease.** An unprocessed row with a marker younger than 5 minutes (`:16,97-98`) → `409 {received:true,inFlight:true,retry:true}` (`:112-117`). An older or legacy unmarked row is reclaimed by a compare-and-set update on (`event_id`, old `type`, `processed_at` null); if zero rows change the delivery gets the same 409 (`:99-111`).
5. **Exactly one fulfilment.** N concurrent deliveries of one event (and of two events for one session) produce one client/project/order (`@pg-race`; contract `webhook-ledger.spec.ts`, 6 concurrent).
6. **Lease fence.** The claim is renewed (compare-and-set on the current marker) after fulfilment, before each non-idempotent follow-up, and before completion; if a renewal updates no row the delivery fails with code `WEBHOOK_CLAIM_LOST` and does nothing further (`:123-135,151,173,202,209-218`).
7. **Completion.** The ledger row is set to `type=eventType`, `processed_at=now` under the marker's compare-and-set (`:210-218`); response `200 {received,fulfilled:true,deduped,projectId,id,type,purchaserEmail,orderStatus,provisionedUserId,isReturningCustomer}` (`:220-231`).
8. **Delayed payment.** `async_payment_succeeded` fulfils from a fresh `checkout.sessions.retrieve`, not the payload (`:142-146`); a malformed payload (no session id) is a permanent failure (`:138-141`).
9. **Transient failures.** Prisma-style connection codes, ETIMEDOUT/ECONNRESET/ECONNREFUSED, messages containing timeout / rate limit / temporarily unavailable / network, and **any unrecognised error** (default) → delete this delivery's claim (only while `processed_at` is null and the marker is its own), log error, answer `500 {received:true,fulfilled:false,error:"Webhook processing failed",classification:"transient",retry:true}` (`webhook-error-classification.ts:21-57,75-81; route.ts:249-268`). Laravel maps database-unreachable/timeout exceptions to the same class.
10. **Permanent failures.** Unpaid session (`CHECKOUT_SESSION_NOT_PAID`), malformed payload, "allowlisted package", "missing checkout session id" → mark the event processed, log warning, answer `200 {…fulfilled:false,classification:"permanent",retry:false}` (`classification.ts:59-73; route.ts:243-248`).
11. **DV-15 permanent additions.** An unknown session (Stripe 404 on line items/retrieve) and a payment intent already used by a **different** session (unique violation on `stripe_payment_intent_id`, `schema.prisma:128`) are permanent: event processed, audit row written, **admin emailed once** with the session reference, the order/project flagged stuck (mechanism: Open question 1). The alert has subject **"Payment needs attention"** and the session ID in the body (inventory DV-15; `dv-15-webhook-hopeless-failures.spec.ts:11,27`). "Once" for an unknown session (no project, so `LifecycleMail::alreadySent`, keyed by `project_id`, cannot dedupe): **the event is marked processed and the alert is dispatched in the same transaction**, so a redelivery answers `deduped` and sends nothing; with a project, the audit marker also applies. A payment intent reused for the **same** fulfilled session → `deduped`. Next classifies both as transient by default (`classification.ts:75-81`), so Stripe retries ~3 days.
12. **Proposed DV-21.** An upsell whose project does not exist (`checkout-fulfillment.ts:219`, "project not found") is also permanent, with the same audit + admin email; Next retries it forever (default transient).
13. **Test mode.** Tests sign events with a `whsec_test_…` secret via the parity adapter (`signPayload`, `deliverEvent`); no live secret exists in config or fixtures.

## Inventory scope
K-05 (ledger, classification), DV-15 (webhook half). Ledger: `webhook` route tests and `webhook-error-classification.test.ts`, #-rows in `test-port-ledger.md` (grep them).

## Next.js source read
`api/stripe/webhook/route.ts:14-270`; `lib/webhook-error-classification.ts:1-82`; `lib/checkout-fulfillment.ts:11-18,219,433-436`; `prisma/schema.prisma:127-128`; contract `webhook-ledger.spec.ts`, `webhook-payment-states.spec.ts`.

## Behaviour notes
- The ledger row's `type` doubles as the lease marker (existing schema, ADR-014); do not add a column.
- A 409 in-flight is not a failure; Stripe retries it.
- The claim's compare-and-set keys on the **marker string**, so a reclaimed delivery cannot be completed by the previous owner.

## Laravel guidance
`app/Http/Controllers/Webhooks/WebhookController.php`, `app/Actions/Checkout/ClaimStripeEvent.php` (insert / reclaim / renew / complete / release), `app/Support/Stripe/WebhookClassifier.php` (pure, table-tested). Use `Webhook::constructEvent` on `$request->getContent()`. Database writes through `Db`/`Locks` from 2.4; the claim writes are single statements, not in the fulfilment transaction.

## Planned deviations from Next.js
| ID | Deviation | Status |
|---|---|---|
| DV-15 | Unknown session, reused PI (other session) permanent + audit + admin email | Owner-approved (2026-11-19) |
| **DV-21** | Upsell for a missing project is permanent | **Proposed, awaiting owner** |

## Tasks
1. Classifier + tests. 2. Claim/lease/renew/complete/release. 3. Controller, route group without Origin guard, arch test. 4. DV-15 audit + admin email + stuck flag. 5. Tests. 6. Record, inventory (add DV-21 row), ledger, sprint-status.

## Scope split (critic B2): 5.2 gates against a stub fulfiller
5.2 builds the ledger around an interface `FulfilsCheckout` (bound to a **stub** in its tests, which returns a result or throws a chosen classified error). The real `FulfilCheckout` is 5.3. So **AC 5's one-client/project/order assertion, AC 7's response fields that come from fulfilment (`projectId`, `orderStatus`, `purchaserEmail`, `provisionedUserId`, `isReturningCustomer`) and AC 11's detection (line-items 404, payment-intent unique violation) are gated in 5.3**, together with the parity specs that need a real fulfilment (`webhook-ledger.spec.ts`, `webhook-payment-states.spec.ts`, `dv-15-webhook-hopeless-failures.spec.ts:21,32`). 5.2 itself proves, against the stub: the fulfiller runs **once** under N concurrent deliveries; classification of a thrown error (AC 9-11) gives the right response and ledger state; DV-15 audit, admin email and dedupe mechanics; lease and fence.

## Test plan
| Layer | Test | Covers |
|---|---|---|
| L1 | `WebhookClassifierTest.php`: every code/message branch, default transient | K-05 |
| L2 `@webhook&@api` | `WebhookLedgerTest.php`: AC 1–4, 7–10 | K-05 |
| L2 `@deviation` | `WebhookPermanentFailureTest.php`: AC 11, 12 | DV-15, DV-21 |
| L3 `@pg-race` | `tests/Concurrency/WebhookClaimTest.php`: AC 5, 6 (expired lease reclaimed once; lost claim aborts) | NFR-R1 |
| L2 | `tests/Arch/WebhookTest.php`: route has no Origin middleware, uses raw body | AC 1 |
| L2 | Out of order (stub): `completed(unpaid)` then `async_payment_succeeded` → one fulfilment; `async_payment_succeeded` after a paid `completed` → `deduped` | AC 8, 10 |
| L2 | Signature older than 300 s → 400 | AC 1 |
| L4 parity (**run at 5.3's gate**) | `contract/webhook-ledger.spec.ts` (7), `webhook-payment-states.spec.ts` (5), `journeys/deviations/dv-15-webhook-hopeless-failures.spec.ts:21,32` (DV-15: unknown session; reused payment intent) | K-05, DV-15 |

## Definition of done (Conversion, `epics.md:35`)
`bin/test` green (Pint, Larastan level 9, Pest) with the tests below; the Conversion record filled; inventory Laravel/Tests columns, ledger rows, `sprint-status.yaml` → `review`, and one line each in DECISIONS / RISKS / ASSUMPTIONS where something was decided. No `apps/web` change. **Test mode only:** every Stripe call goes to stripe-fake (`STRIPE_SECRET_KEY` a `sk_test_…` value, `api_base` pointed at the fake) and every mail to the postmark-shim or Mailpit; no live Stripe or Postmark key, webhook secret or price ID is read, written or configured (live mode is the owner's). L4/L5 parity runs only where the header's gate says so. **Conversion variant (`epics.md:35`):** the Next result equals `tests/parity/expected-next-failures.txt` (the deviation specs named in the test plan fail on Next, everything else passes); every earlier gate stays green on Laravel; Laravel page-object methods the story's journeys use are implemented in `tests/parity/pages/laravel/` (accessible locators first, `data-testid` only in Laravel objects, shared journeys unchanged). The parity specs listed in the test plan run on Laravel and on Next.

## Open questions (with recommendations)
1. **"Flagged stuck": how?** The schema has no stuck column; migrations are not ours to add casually. *Recommendation:* audit type `checkout_stuck` (payload: session id, reason) on the project when there is one, plus the admin email; the admin snapshot already reads audit events. No new column.
2. **Unknown-session admin email recipients.** *Recommendation:* `ADMIN_NOTIFICATION_EMAILS` as for new-project mail (2.7); dedupe by event id.
3. **Owner items:** DV-21 (it may instead be folded into DV-15's "any other error that can never succeed"), and **the "flagged stuck" mechanism**: DV-15 says "flag … stuck in the admin queue"; this story uses an audit event `checkout_stuck` the admin snapshot reads, not a queue column. Does a successful reprocess (5.6) clear it? *Recommendation:* a later `order_fulfilled` for that session supersedes `checkout_stuck`; no clearing write.

## Conversion record

### Inventory scope
K-05, DV-15 (webhook half).
### Next.js source read
`webhook/route.ts`, `webhook-error-classification.ts`, `checkout-fulfillment.ts:11-18,219,433-436`.
### Behaviour notes
Built against a stub fulfiller (`FulfilsCheckout`, bound to `PendingFulfiller`, which fails transiently so no paid event is settled unfulfilled); story 5.3 rebinds the real one. Ledger claim is one compare-and-set statement per step on the `stripe_events.type` marker `processing:{ms}:{uuid}:{eventType}`; lease 5 min, 409 while live, reclaim on expiry, `renew` between steps, `complete`/`release` keyed on the marker.
### Laravel implementation
`app/Http/Controllers/Webhooks/WebhookController.php` (raw body, `Webhook::constructEvent`, 300 s), `app/Actions/Checkout/{ProcessStripeEvent,ClaimStripeEvent,RecordHopelessCheckout,FulfilsCheckout,PendingFulfiller}.php`, `app/Support/Stripe/{WebhookClassifier,HopelessCheckoutFailure,FulfilmentError,WebhookClaimLost}.php`, `LifecycleMail::sendAdminAlert`, route in `routes/checkout.php` (no `web` group; Origin guard already exempts the path).
### Deviations from Next.js
| Behaviour | Next.js | Laravel | Why | Decision ref |
|---|---|---|---|---|
| Unknown session, reused payment intent, missing upsell project | Transient, retried for days | Permanent: event settled, admin emailed once, `checkout_stuck` audit on the project when known | DV-15 / DV-21 | DV-15 (owner), DV-21 (proposed) |
| Classifier codes | Prisma P1001/P1002/P2024 | PostgreSQL connection/timeout SQLSTATEs | Different driver | none |
### Tests
| Layer | Test file / title | Inventory IDs |
|---|---|---|
| Pest feature | `tests/Feature/Checkout/WebhookTest.php` (signature, tolerance, ignored, dedupe, lease 409/reclaim, transient release, permanent, unknown session, classifier, Origin exemption) | K-05, K-06 |
| Pest concurrency `@pg-race` | `tests/Concurrency/WebhookClaimRaceTest.php` (10 deliveries, one claim) | K-05 |
### Test evidence
See the story commit: `bin/test` gate. L4 parity (`webhook-ledger.spec.ts`, `dv-15`) NOT RUN.
### Gotchas
Hopeless failures with a project need real fulfilment (5.3) to raise `paymentIntentReused`/`upsellProjectMissing`; only the unknown-session path (async retrieve 404) is raised here. Since critic 12802: the project alert, lost-claim write-nothing, lease fence, async retrieve and its 404 are tested in `WebhookFulfilmentTest.php`; `upsellProjectMissing` waits for 5.5.
### Docs updated
Inventory K-05, ledger rows 52 (partial) and 109, sprint-status, DECISIONS/RISKS/ASSUMPTIONS.
### Open items
"Flagged stuck" = audit `checkout_stuck` (no column); unknown-session alert goes to `ADMIN_NOTIFICATION_EMAILS`; DV-21 awaiting owner. Built as recommended, awaiting owner.
