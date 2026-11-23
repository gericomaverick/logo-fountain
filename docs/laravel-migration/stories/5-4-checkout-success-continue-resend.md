# Story 5.4: Checkout success, continue, resend

**Status:** review (created from `origin/workbench/4-integrate` b2e1115) · **DoD variant:** Conversion · **Epic:** 5 · **Covers:** K-02, K-03, K-04, FR14, FR58 · **Gate:** `@checkout&@api`, `@checkout&@ui` · **After:** 5.3, 1.9 · **Stacks on:** `origin/workbench/4-integrate`; in the SERIAL chain, the previous Epic 5 story's branch (see `epic-5-build-order` in 5.7). Test mode and fakes only (stripe-fake, postmark-shim); live Stripe/Postmark is the owner's.

> Created with the repo's create-story form. All `apps/web` `file:line` read 2026-11-23; `apps/web` is frozen, so nothing here edits it.

## Story
As a customer returning from Stripe, I see when my order is ready, and if the first email did not reach me I can ask for another without being able to do harm with the session ID.

## Acceptance criteria
1. **Status.** `GET /api/checkout/status?session_id=…`: missing/blank → `400 {error:{code:"MISSING_SESSION_ID",message:"Missing session_id",nextStep:"Include session_id query param."}}` (`status/route.ts:8-12`). Otherwise exactly `{fulfilled:boolean,status:"FULFILLED"|"PENDING"}` (`:22-26`); `FULFILLED` only for an order whose status is `FULFILLED`. An unknown session and a not-yet-fulfilled or `NEEDS_CONTACT` order are **byte-identical** (`PENDING`): no IDs, prices, customer data or enumeration signal (`:19-21`).
2. **Send link** `POST /api/checkout/magic-link {session_id}` and `POST /api/checkout/resend-magic-link` are the same action (`checkout-auth-email.ts:17`; both routes `:5-7`). Invalid JSON → `400 INVALID_JSON`; missing/blank id → `400 MISSING_SESSION_ID` (`:18-26`).
3. **Fulfilled only.** No order or status ≠ `FULFILLED` → `409 NOT_FULFILLED` (`:28-39`); no billing email → `409 MISSING_EMAIL` (`:41-42`). The link is **emailed to the purchaser, never returned** (`:65`).
4. **Always sign-in.** The flow is `signin`, never `setup`, so a leaked session ID cannot set a password (`:57-58`). Possession of the ID only triggers an email to the already-recorded address.
5. **Limits** (`checkout-auth-email-rate-limit.ts:5-8,52-53`): 3 sends per session per 15 min **and** 5 per destination per 60 min, all-or-nothing, keys hashed. Over limit → `429 {error:{code:"RATE_LIMITED",message:"Please wait before requesting another sign-in email."}}` with `Retry-After` (`checkout-auth-email.ts:44-50`). The count is shared across processes through 2.5 (checkout mode). Next's store is an in-process `Map` (`rate-limit.ts:21`), so each instance counts separately; 2.5 AC 10 already fixes this, so no new DV.
6. **Outcomes.** Skipped send → `503 EMAIL_UNAVAILABLE`; any throw → `500 AUTH_EMAIL_SEND_FAILED` with a fixed message, **no provider detail logged or returned** (Postmark bodies can echo the URL; `:61-70`); success → `200 {ok:true,delivery:"email"}`.
7. **Success page** `/checkout/success?session_id=…`: polls status every 2 s; after 45 s switches to every 10 s and shows the "Still waiting for confirmation" panel with **Retry now** (restarts polling); the panel hides once fulfilled; polling stops on unmount (`success-processing-client.tsx:15-17,37-80,157-180`; `checkout-success.ts:1-3`). No session id → "Missing checkout session. Please return to pricing and try again." (`:38-41`).
8. **Resend control** on the success page and the **continue page** (`checkout/continue/page.tsx:19-49`): "Missing session id." without an id; on success "Sign-in link sent. Check the purchaser email inbox to continue."; failures show the server message, and `429` shows the retry wait.
9. **Proposed DV-22.** (a) Troubleshooting copy is customer-safe: Next lists developer steps ("Ensure `stripe listen` is running", "Confirm your Stripe webhook secret…", `:162-168`) to the public. (b) One failed poll does not end polling: Next stops for good on the first error (`:69-71`). Polling continues on its schedule and shows the error inline; **Retry now** stays available.
10. **UI** built to the UX spec (checkout screens) with 1.8/1.9 components and `usePolling` (1.8c): focus, `role="alert"` on errors, labelled button states.

## Inventory scope
K-02, K-03, K-04, FR58 (limits). Ledger rows for the three route tests and `checkout-success` test.

## Next.js source read
`api/checkout/status/route.ts:6-27`; `api/checkout/magic-link/route.ts`; `resend-magic-link/route.ts`; `lib/checkout-auth-email.ts:17-71`; `lib/checkout-auth-email-rate-limit.ts:5-53`; `app/checkout/success/success-processing-client.tsx`; `app/checkout/continue/page.tsx:19-49`; `lib/checkout-success.ts`.

## Behaviour notes
- Status is the only unauthenticated read of order state; keep it to two fields forever.
- The limiter consumes before sending, so a failed send still costs an attempt.

## Laravel guidance
`app/Http/Controllers/Api/CheckoutStatusController.php`, `CheckoutAuthEmailController.php` (one action, two routes), reuse `RateLimits::consumeCheckoutEmail` (2.5) and `SendAuthLink` (4.4, `flow=signin`). Pages are React/Inertia (the portal UI, `resources/js`); polling via the 1.8c `usePolling` equivalent.

## Planned deviations from Next.js
| ID | Deviation | Status |
|---|---|---|
| **DV-22** | Customer-safe troubleshooting copy; polling survives one failed poll | **Decided (owner, 2026-11-23)** (UX redesign, DV-UX, may already cover the copy) |

## Tasks
1. Status endpoint. 2. Send-link action + routes. 3. Success and continue pages. 4. Tests. 5. Record, inventory (add DV-22 row), ledger, sprint-status.

## Test plan
| Layer | Test | Covers |
|---|---|---|
| L2 `@checkout&@api` | `CheckoutStatusTest.php`: AC 1 (unknown = pending byte-identical) | K-02 |
| L2 | `CheckoutSendLinkTest.php`: AC 2–4, 6, never returns the URL, never `setup` | K-03, K-04 |
| L2/L3 | `CheckoutSendLimitTest.php`: AC 5 across two processes (`@pg-race`) | FR58 |
| L2 `@checkout&@ui` | `tests/browser/checkout-success.spec.ts` (Playwright, the portal's browser suite): AC 7–10 with a fake clock and stripe-fake | K-02 |
| L4 parity | `contract/checkout-contracts.spec.ts`; journey 1 success step | K-02–K-04 |

## Definition of done (Conversion, `epics.md:35`)
`bin/test` green (Pint, Larastan level 9, Pest) with the tests below; the Conversion record filled; inventory Laravel/Tests columns, ledger rows, `sprint-status.yaml` → `review`, and one line each in DECISIONS / RISKS / ASSUMPTIONS where something was decided. No `apps/web` change. **Test mode only:** every Stripe call goes to stripe-fake (`STRIPE_SECRET_KEY` a `sk_test_…` value, `api_base` pointed at the fake) and every mail to the postmark-shim or Mailpit; no live Stripe or Postmark key, webhook secret or price ID is read, written or configured (live mode is the owner's). L4/L5 parity runs only where the header's gate says so. **Conversion variant (`epics.md:35`):** the Next result equals `tests/parity/expected-next-failures.txt` (the deviation specs named in the test plan fail on Next, everything else passes); every earlier gate stays green on Laravel; Laravel page-object methods the story's journeys use are implemented in `tests/parity/pages/laravel/` (accessible locators first, `data-testid` only in Laravel objects, shared journeys unchanged). The parity specs listed in the test plan run on Laravel and on Next.

## Open questions (with recommendations)
1. **DV-22.** *Recommendation:* approve both halves; (b) is a plain bug.
2. **Cache headers on status.** Next sets none (the client sends `no-store`). *Recommendation:* add `Cache-Control: no-store` server-side; additive, invisible to the contract.
3. **Owner items:** DV-22.

## Conversion record

### Inventory scope
K-02, K-03, K-04, FR14, FR58.
### Next.js source read
status, magic-link, resend routes, `checkout-auth-email*.ts`, success client, continue page.
### Behaviour notes
Status exposes two fields only; unknown = pending byte-identical. Send-link is one action on two routes, always `magic` (sign-in), emailed to the recorded address, never returned. Limiter consumes before sending (`RateLimits::consumeCheckoutEmail`, 2.5).
### Laravel implementation
`CheckoutStatusController`, `CheckoutAuthEmailController`, routes in `routes/checkout.php` (no web group); pages `Pages/Checkout/{Success,Continue}.tsx`, `Components/ResendLink.tsx`, `lib/checkout.ts`; `Cache-Control: no-store` added on status (open question 2).
### Deviations from Next.js
DV-22 (customer-safe copy; polling survives a failed poll via `usePolling`) implemented as (decided, owner 2026-11-23) approval. A purchaser with no user account answers 503 EMAIL_UNAVAILABLE (Next's `skipped`).
### Tests
| Layer | Test file / title | Inventory IDs |
|---|---|---|
| L2 | `tests/Feature/Checkout/CheckoutStatusTest.php` (7 cases: status 400/two fields/byte-identical; send-link validation, 409s, sign-in only + both routes, 429, 503/500) | K-02, K-03, K-04, FR58 |
### Test evidence
`bin/test` green: Pint, Larastan, Pest 2069 passed.
### Gotchas
Not done: Playwright `checkout-success.spec.ts` (AC 7-10 browser), L4 parity specs, two-process limiter `@pg-race` test, inventory/ledger rows, DECISIONS/RISKS lines. The pages are visually unchecked and untested in a browser. Next's story header in Docs updated: status only.
### Docs updated
This record, sprint-status.
### Open items
Browser spec and parity; owner: DV-22.

**L4 parity run (2026-11-23, workbench/parity-4-5):** @auth 37 tests: Next 37 pass; Laravel 15 pass / 11 fail / 11 not reached. @checkout 28: Next 28 pass; Laravel 1 / 20 / 7. @entitlements 10: Next 10 pass; Laravel 0 / 10 / 0. Failures are the unwired Stripe/Postmark/Mailpit infra on the Laravel stack and not-yet-built pages/routes, listed with titles in `docs/laravel-migration/parity-run-2026-11-23.md`. This story's parity tests are not shown to match: stays at `review`.

**Note (owner correction 2026-11-23, DV-25):** a 100%-off checkout is now fulfilled, so its success/continue pages read like any paid order (status is by order existence, unchanged). The resend-link route still sends synchronously; the Q2 equal-time change (story 4.4, DV-27) covers magic-link and forgot-password only. Not changed here; for the owner to decide.
