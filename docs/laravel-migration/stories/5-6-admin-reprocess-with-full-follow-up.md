# Story 5.6: Admin reprocess with full follow-up

**Status:** ready-for-dev (created from `origin/workbench/4-integrate` b2e1115) · **DoD variant:** Laravel-only · **Epic:** 5 · **Covers:** K-12, DV-6, FR21, ADR-015 · **Gate:** `@admin&@api` (reprocess), `@deviation` (DV-6) · **After:** 5.3 · **Stacks on:** `origin/workbench/4-integrate`; in the SERIAL chain, the previous Epic 5 story's branch (see `epic-5-build-order` in 5.7). Test mode and fakes only (stripe-fake, postmark-shim); live Stripe/Postmark is the owner's.

> Created with the repo's create-story form. All `apps/web` `file:line` read 2026-11-23; `apps/web` is frozen, so nothing here edits it.

## Story
As an admin, I can reprocess a paid session whose webhook never completed, and the customer and the studio get exactly the emails a normal purchase would have sent, once.

## Acceptance criteria
1. **Guards.** `POST /api/admin/checkout/reprocess`: Origin guard first (`reprocess/route.ts:14-15`), signed-in admin only (`:17-18`; anonymous → 401, non-admin → 403 through the Epic 4 guards).
2. **Body.** `{session_id}` trimmed; missing/blank → `400` (`:20-25`). **Proposed DV-23:** the body is the standard `{error:{code:"MISSING_SESSION_ID",message}}`; Next omits the code (`:24`).
3. **Retrieve and fulfil.** Retrieves the session from Stripe (`:27-29`) and runs the **same** `FulfilCheckout` action as the webhook (`:31`; ADR-015), including the paid check, upsell routing and idempotency from 5.3/5.5.
4. **Provisioning with names (DV-6).** Provisioning receives the checkout first/last name as in the webhook; Next passes none on reprocess (`:35` vs `webhook/route.ts:157-160`), so profile names are lost.
5. **Follow-up (DV-6).** After fulfilment, reprocess runs the shared `CompleteFulfilmentSideEffects`: the customer setup-or-sign-in email (marker `email_sent:checkout_auth:{sessionId}`) and, for new-project sessions, the admin new-project email (own marker). Next sends neither (`:31-37`). `@deviation`.
6. **Idempotent.** Given a fulfilled but unemailed session, reprocess sends the customer and admin emails once; reprocessing again sends nothing new and answers `deduped:true`. A reprocess racing the webhook cannot double-send (the markers are the guard; no ledger write by reprocess, Open question 1).
7. **Response.** `200 {ok:true,deduped,projectId,orderId,clientId,purchaserEmail,orderStatus,provisionedUserId,message}`, message "Session fulfilled successfully." or "Session already fulfilled; ensured access provisioning." (`:39-49`).
8. **Unpaid.** `409 {error:{code:"CHECKOUT_SESSION_NOT_PAID",message:"Checkout session has not been paid; nothing was provisioned."}}` and nothing is created or sent (`:51-61`).
9. **Unknown session or Stripe failure. Proposed DV-23.** A Stripe 404 → `404 {error:{code:"CHECKOUT_SESSION_NOT_FOUND"}}`; other Stripe errors → `502 {error:{code:"STRIPE_UNAVAILABLE"}}`, no detail. Next rethrows anything but route-auth errors (`:63`; `lib/auth/require.ts:21-27`), an unhandled 500.
10. **Test mode.** Only stripe-fake sessions (`purchase-unpaid`, fulfilled fixtures) and the mail shim; no live key.

## Inventory scope
K-12, DV-6. Ledger: `reprocess` route test(s) (grep `test-port-ledger.md`).

## Next.js source read
`api/admin/checkout/reprocess/route.ts:13-65`; `api/stripe/webhook/route.ts:148-207`; `lib/auth/require.ts:21-27`; contract `journeys/contract/admin-*.spec.ts`.

## Behaviour notes
- The admin UI (Epic 8/9) explains that Reprocess also sends the customer's email (epics.md, admin project screen).
- Reprocessing an upsell session re-applies nothing (order exists) and sends only the customer email if its marker is missing.

## Laravel guidance
`app/Http/Controllers/Admin/ReprocessCheckoutController.php` calling `FulfilCheckout` then `CompleteFulfilmentSideEffects` (5.3); shared action means one code path with the webhook (arch test: the webhook controller and this controller both call it, neither sends mail directly).

## Planned deviations from Next.js
| ID | Deviation | Status |
|---|---|---|
| DV-6 | Same emails as the webhook, no duplicates | Owner-approved |
| **DV-23** | Standard error codes for a missing/unknown session | **Proposed, awaiting owner** |

## Tasks
1. Controller + route. 2. Names through provisioning. 3. Arch test. 4. Tests. 5. Record, inventory (add DV-23 row), ledger, sprint-status.

## Test plan
| Layer | Test | Covers |
|---|---|---|
| L2 `@admin&@api` | `ReprocessCheckoutTest.php`: AC 1–3, 7, 8, 10 | K-12 |
| L2 `@deviation` | AC 4–6: unemailed session gets both emails once; second run none | DV-6 |
| L2 `@deviation` | AC 2, 9 | DV-23 |
| L3 `@pg-race` | reprocess racing the webhook: each mail once | DV-6 |
| L2 arch | no direct mail send in either controller | ADR-015 |
| L4 parity | admin contract/journeys for reprocess | K-12 |

## Definition of done (Laravel-only, `epics.md:35`)
`bin/test` green (Pint, Larastan level 9, Pest) with the tests below; the Conversion record filled; inventory Laravel/Tests columns, ledger rows, `sprint-status.yaml` → `review`, and one line each in DECISIONS / RISKS / ASSUMPTIONS where something was decided. No `apps/web` change. **Test mode only:** every Stripe call goes to stripe-fake (`STRIPE_SECRET_KEY` a `sk_test_…` value, `api_base` pointed at the fake) and every mail to the postmark-shim or Mailpit; no live Stripe or Postmark key, webhook secret or price ID is read, written or configured (live mode is the owner's). L4/L5 parity runs only where the header's gate says so.

## Open questions (with recommendations)
1. **Should reprocess claim a ledger row?** *Recommendation:* no; the order's unique session ID and the email markers already make it safe.
2. **DV-23.** *Recommendation:* approve.
3. **Owner items:** DV-23 (DV-6 is approved).

## Conversion record

### Inventory scope
K-12, DV-6.
### Next.js source read
`reprocess/route.ts`, `webhook/route.ts:148-207`, `lib/auth/require.ts:21-27`.
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
