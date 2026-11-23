# Story 5.2: Webhook ledger and classification

**Status:** ready-for-dev (created from `origin/workbench/4-integrate` b2e1115) · **DoD variant:** Laravel-only · **Epic:** 5 · **Covers:** K-05, ADR-014, DV-15, NFR-R1 · **Gate:** `@webhook&@api`, `@pg-race`, `@deviation` (DV-15) · **After:** 2.4, 0.5 · **Stacks on:** `origin/workbench/4-integrate`; in the SERIAL chain, the previous Epic 5 story's branch (see `epic-5-build-order` in 5.7). Test mode and fakes only (stripe-fake, postmark-shim); live Stripe/Postmark is the owner's.

> Created with the repo's create-story form. All `apps/web` `file:line` read 2026-11-23; `apps/web` is frozen, so nothing here edits it.

## Story
As the system, I accept Stripe's events safely: verified, deduplicated, claimed once, retried when it can succeed and settled when it never will.

## Acceptance criteria
1. **Signature.** Raw body, `Stripe-Signature` checked with the webhook secret (`webhook/route.ts:38-44`). No secret configured → `400` plain text (`:27-33`); no header → `400 "Missing stripe-signature header"` (`:35-36`); bad signature → `400 "Webhook signature verification failed: …"` (`:42-44`). The route has **no Origin guard** and no session (Stripe is not a browser); it is exempt from CSRF/Origin middleware by an explicit route group and an arch test.
2. **Other event types.** Only `checkout.session.completed` and `checkout.session.async_payment_succeeded` fulfil (`:46-48`). Every other type is upserted as a processed ledger row and answered `200 {received:true,ignored:true,id,type}`; `async_payment_failed` answers `{received:true,paymentFailed:true,…}` and logs a warning without the payload (`:50-78`).
3. **Claim.** A new event inserts a ledger row whose `type` is the marker `processing:{ms}:{uuid}:{eventType}` (`:17-19,80-89`). A unique violation on the event ID with `processed_at` set → `200 {received:true,deduped:true}` (`:91-95`).
4. **Lease.** An unprocessed row with a marker younger than 5 minutes (`:16,97-98`) → `409 {received:true,inFlight:true,retry:true}` (`:112-117`). An older or legacy unmarked row is reclaimed by a compare-and-set update on (`event_id`, old `type`, `processed_at` null); if zero rows change the delivery gets the same 409 (`:99-111`).
5. **Exactly one fulfilment.** N concurrent deliveries of one event (and of two events for one session) produce one client/project/order (`@pg-race`; contract `webhook-ledger.spec.ts`, 6 concurrent).
6. **Lease fence.** The claim is renewed (compare-and-set on the current marker) after fulfilment, before each non-idempotent follow-up, and before completion; if a renewal updates no row the delivery fails with code `WEBHOOK_CLAIM_LOST` and does nothing further (`:123-135,151,173,202,209-218`).
7. **Completion.** The ledger row is set to `type=eventType`, `processed_at=now` under the marker's compare-and-set (`:210-218`); response `200 {received,fulfilled:true,deduped,projectId,id,type,purchaserEmail,orderStatus,provisionedUserId,isReturningCustomer}` (`:220-231`).
8. **Delayed payment.** `async_payment_succeeded` fulfils from a fresh `checkout.sessions.retrieve`, not the payload (`:142-146`); a malformed payload (no session id) is a permanent failure (`:138-141`).
9. **Transient failures.** Prisma-style connection codes, ETIMEDOUT/ECONNRESET/ECONNREFUSED, messages containing timeout / rate limit / temporarily unavailable / network, and **any unrecognised error** (default) → delete this delivery's claim (only while `processed_at` is null and the marker is its own), log error, answer `500 {received:true,fulfilled:false,error:"Webhook processing failed",classification:"transient",retry:true}` (`webhook-error-classification.ts:21-57,75-81; route.ts:249-268`). Laravel maps database-unreachable/timeout exceptions to the same class.
10. **Permanent failures.** Unpaid session (`CHECKOUT_SESSION_NOT_PAID`), malformed payload, "allowlisted package", "missing checkout session id" → mark the event processed, log warning, answer `200 {…fulfilled:false,classification:"permanent",retry:false}` (`classification.ts:59-73; route.ts:243-248`).
11. **DV-15 permanent additions.** An unknown session (Stripe 404 on line items/retrieve) and a payment intent already used by a **different** session (unique violation on `stripe_payment_intent_id`, `schema.prisma:128`) are permanent: event processed, audit row written, **admin emailed once** with the session reference, the order/project flagged stuck (mechanism: Open question 1). A payment intent reused for the **same** fulfilled session → `deduped`. Next classifies both as transient by default (`classification.ts:75-81`), so Stripe retries ~3 days.
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
`app/Http/Controllers/Stripe/WebhookController.php`, `app/Actions/Checkout/ClaimStripeEvent.php` (insert / reclaim / renew / complete / release), `app/Support/Stripe/WebhookClassifier.php` (pure, table-tested). Use `Webhook::constructEvent` on `$request->getContent()`. Database writes through `Db`/`Locks` from 2.4; the claim writes are single statements, not in the fulfilment transaction.

## Planned deviations from Next.js
| ID | Deviation | Status |
|---|---|---|
| DV-15 | Unknown session, reused PI (other session) permanent + audit + admin email | Owner-approved (2026-11-19) |
| **DV-21** | Upsell for a missing project is permanent | **Proposed, awaiting owner** |

## Tasks
1. Classifier + tests. 2. Claim/lease/renew/complete/release. 3. Controller, route group without Origin guard, arch test. 4. DV-15 audit + admin email + stuck flag. 5. Tests. 6. Record, inventory (add DV-21 row), ledger, sprint-status.

## Test plan
| Layer | Test | Covers |
|---|---|---|
| L1 | `WebhookClassifierTest.php`: every code/message branch, default transient | K-05 |
| L2 `@webhook&@api` | `WebhookLedgerTest.php`: AC 1–4, 7–10 | K-05 |
| L2 `@deviation` | `WebhookPermanentFailureTest.php`: AC 11, 12 | DV-15, DV-21 |
| L3 `@pg-race` | `tests/Concurrency/WebhookClaimTest.php`: AC 5, 6 (expired lease reclaimed once; lost claim aborts) | NFR-R1 |
| L2 | `tests/Arch/WebhookTest.php`: route has no Origin middleware, uses raw body | AC 1 |
| L4 parity | `contract/webhook-ledger.spec.ts` (7), `webhook-payment-states.spec.ts` (5) | K-05 |

## Definition of done (Laravel-only, `epics.md:35`)
`bin/test` green (Pint, Larastan level 9, Pest) with the tests below; the Conversion record filled; inventory Laravel/Tests columns, ledger rows, `sprint-status.yaml` → `review`, and one line each in DECISIONS / RISKS / ASSUMPTIONS where something was decided. No `apps/web` change. **Test mode only:** every Stripe call goes to stripe-fake (`STRIPE_SECRET_KEY` a `sk_test_…` value, `api_base` pointed at the fake) and every mail to the postmark-shim or Mailpit; no live Stripe or Postmark key, webhook secret or price ID is read, written or configured (live mode is the owner's). L4/L5 parity runs only where the header's gate says so.

## Open questions (with recommendations)
1. **"Flagged stuck": how?** The schema has no stuck column; migrations are not ours to add casually. *Recommendation:* audit type `checkout_stuck` (payload: session id, reason) on the project when there is one, plus the admin email; the admin snapshot already reads audit events. No new column.
2. **Unknown-session admin email recipients.** *Recommendation:* `ADMIN_NOTIFICATION_EMAILS` as for new-project mail (2.7); dedupe by event id.
3. **Owner items:** DV-21 only (DV-15 is approved).

## Conversion record

### Inventory scope
K-05, DV-15 (webhook half).
### Next.js source read
`webhook/route.ts`, `webhook-error-classification.ts`, `checkout-fulfillment.ts:11-18,219,433-436`.
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
