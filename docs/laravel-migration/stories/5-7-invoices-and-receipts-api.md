# Story 5.7: Invoices and receipts API

**Status:** review (created from `origin/workbench/4-integrate` b2e1115) · **DoD variant:** Conversion · **Epic:** 5 · **Covers:** K-11, FR20 · **Gate:** `@invoices&@api` · **After:** 5.3 · **Stacks on:** `origin/workbench/4-integrate`; in the SERIAL chain, the previous Epic 5 story's branch (see `epic-5-build-order` in 5.7). Test mode and fakes only (stripe-fake, postmark-shim); live Stripe/Postmark is the owner's.

> Created with the repo's create-story form. All `apps/web` `file:line` read 2026-11-23; `apps/web` is frozen, so nothing here edits it.

## Story
As a client or admin, I can list a project's orders with the right invoice or receipt document from Stripe, and never a draft link for a paid order.

## Acceptance criteria
1. **Three routes, one resolver.** `GET /api/invoices` (orders of every client the user belongs to, `invoices/route.ts:12-40`), `GET /api/projects/{id}/invoices` (membership required, `projects/[id]/invoices/route.ts:13-15`), `GET /api/admin/projects/{id}/invoices` (admin, `admin/projects/[id]/invoices/route.ts:10-11`). Anonymous → 401; non-member → the project policy's response; non-admin → 403. Orders newest first.
2. **Item shape** `{id,projectId,projectName,amountCents,currency,status,date,invoiceId,invoicePdfUrl,hostedInvoiceUrl,receiptUrl,documentType,downloadUrl}` inside `{invoices:[…]}` (`invoices/route.ts:57-70`). `status` is `"Paid"` for `FULFILLED`, else the raw order status. `downloadUrl` = PDF, else hosted, else receipt. The project route adds `documentLabel` ("Payment receipt (paid-safe)" for receipts, else "Invoice"; `:61`); the other two do not. The project name is the brief's brand name or the display title, audience client for the user/project routes and admin for the admin route (`:47-55`).
3. **Resolver input** is the order's session ID, payment-intent ID, and `isOrderSettled = status==="FULFILLED"` (`client-invoices.ts:85-88`).
4. **Settled invoice test** (`:23-27`): status `paid`, or nothing remaining and a `paid_at` transition.
5. **Settled orders prefer paid-safe documents.** With a session: retrieve it expanding `invoice` and `payment_intent.latest_charge`; a settled order with a charge receipt URL returns the **receipt** first (`:100-107`); else the session's invoice only if settled and with a PDF; else resolve a string invoice ID; else the latest charge's invoice (settled, with a PDF); else the receipt (`:109-136`). For a settled order the hosted-invoice URL is always dropped and `source` is `invoice` only when a PDF exists (`:41-55`).
6. **Unsettled orders** accept a PDF or a hosted URL and report `source:"invoice"` (`:41-44,46`).
7. **Payment-intent fallback.** With no usable session path and a payment-intent ID: retrieve it expanding the latest charge and apply the same receipt-then-invoice order (`:138-161`).
8. **Nothing found, or any Stripe error:** all document fields null, `source:"none"`; the error is logged (message only) and never reaches the caller (`:162-177`).
9. **Cases are table-driven** from stripe-fake fixtures (invoices, charges with receipt URLs, payment intents) and assert the same chosen document as Next for each (K-11's "same documents as Next").
10. **VAT.** K-11 says the VAT number shows when present at £0 VAT. `client-invoices.ts` contains no VAT handling, so this comes from the Stripe-hosted PDF/receipt itself and from the UI; nothing is built here. (Unverified: the UI part, a later story.)
11. **Test mode.** Only stripe-fake documents; no real invoice or receipt URL is fetched or stored.

## Inventory scope
K-11 (API half), FR20. Ledger: three `invoices` route tests and `client-invoices.test.ts` (grep `test-port-ledger.md`).

## Next.js source read
`lib/client-invoices.ts:1-177`; `api/invoices/route.ts:8-70`; `api/projects/[id]/invoices/route.ts:8-70`; `api/admin/projects/[id]/invoices/route.ts:8-70`.

## Behaviour notes
- One Stripe round trip per order (`Promise.all`, `invoices/route.ts:42`); no caching in Next. Keep parity; note as a risk for projects with many orders.
- Receipt-before-invoice for settled orders is deliberate ("paid-safe").

## Laravel guidance
`app/Support/Stripe/InvoiceResolver.php` (pure given a Stripe client; returns a value object), one `InvoiceController` with three actions or three thin controllers, a shared `InvoiceListItem` resource. Policies from 2.2.

## Planned deviations from Next.js
None.

## Tasks
1. InvoiceResolver + table test. 2. Controllers/routes. 3. Tests. 4. Record, inventory, ledger, sprint-status.

## Test plan
| Layer | Test | Covers |
|---|---|---|
| L1/L2 | `InvoiceResolverTest.php`: AC 3–9, one case per branch against stripe-fake | K-11 |
| L2 `@invoices&@api` | `InvoicesApiTest.php`: AC 1, 2, authz for each route | K-11 |
| L4 parity | the three invoice routes' contract specs | K-11 |

## Definition of done (Conversion, `epics.md:35`)
`bin/test` green (Pint, Larastan level 9, Pest) with the tests below; the Conversion record filled; inventory Laravel/Tests columns, ledger rows, `sprint-status.yaml` → `review`, and one line each in DECISIONS / RISKS / ASSUMPTIONS where something was decided. No `apps/web` change. **Test mode only:** every Stripe call goes to stripe-fake (`STRIPE_SECRET_KEY` a `sk_test_…` value, `api_base` pointed at the fake) and every mail to the postmark-shim or Mailpit; no live Stripe or Postmark key, webhook secret or price ID is read, written or configured (live mode is the owner's). L4/L5 parity runs only where the header's gate says so. **Conversion variant (`epics.md:35`):** the Next result equals `tests/parity/expected-next-failures.txt` (the deviation specs named in the test plan fail on Next, everything else passes); every earlier gate stays green on Laravel; Laravel page-object methods the story's journeys use are implemented in `tests/parity/pages/laravel/` (accessible locators first, `data-testid` only in Laravel objects, shared journeys unchanged). The parity specs listed in the test plan run on Laravel and on Next.

## Open questions (with recommendations)
1. **Per-order Stripe calls.** *Recommendation:* parity now; record the risk, no cache.
2. **Owner items: none.**

## Conversion record

### Inventory scope
K-11 (API half), FR20.
### Next.js source read
`lib/client-invoices.ts`, the three invoice routes.
### Behaviour notes
One resolver, three thin actions. Settled orders return the charge receipt first, else a settled invoice with a PDF (hosted link dropped); unsettled orders keep PDF and hosted link. Any Stripe error gives all-null fields and `documentType:"none"`, and only the message is logged. An invalid or unknown project id on the admin list gives `{invoices:[]}` (Next's behaviour: no existence check); on the project list, 404 `PROJECT_NOT_FOUND` for a non-member, an admin who is not a member included (`participate`).
### Laravel implementation
`app/Support/Stripe/InvoiceResolver.php` and `InvoiceDocument.php`; `app/Http/Controllers/Api/InvoiceController.php` (`mine`, `project`, `admin`); three routes in `routes/checkout.php` (`web` + `auth.verified`, and `web` + `admin`). `date` is formatted as Next's `toISOString()` (UTC, milliseconds).
### Deviations from Next.js
None.
### Tests
| Layer | Test file / title | Inventory IDs |
|---|---|---|
| L1/L2 | `tests/Feature/Checkout/InvoiceResolverTest.php` (16 table cases, one per branch, plus the error/log case) | K-11 |
| L2 | `tests/Feature/Checkout/InvoicesApiTest.php` (item shape and order, all-clients list, admin naming, guards for each route) | K-11, D-19 |
| L4 | not run: parity specs for the three routes were not run on Laravel or Next | |
### Test evidence
`bin/test`, once, on the final code: Pint and Larastan level 9 pass; Pest 2120 passed, 1 failed (`PrivateStorageSeaweedTest`, an environment fault: SeaweedFS "No writable volumes" while the host disk was at 98%, under 500 MB free; no code in this story touches storage). Earlier runs in this story failed Pint (two test files), Larastan (two types) and one list-key-order assertion, all fixed.
### Gotchas
`FakeStripe` answers queued bodies in call order, so a resolver test lists them in the order the resolver asks. A payment-intent charge that is not expanded (a string) yields nothing, as in Next.
### Docs updated
Inventory K-11 and D-19 rows (C-18 untouched: UI not built), ledger rows 16, 34, 45, 82, `sprint-status.yaml`, DECISIONS, RISKS, ASSUMPTIONS, `epic-5-build-order` final status below.
### Open items
L4 parity not run. The per-order Stripe calls have no cache (RISKS). No owner decisions.

---

## epic-5-build-order
**Order (revised after critic 11916, B2):** SERIAL, one builder, each story forked from the previous branch: **5.1 → 5.2 → 5.3 → 5.4 → 5.5 → 5.6 → 5.7**, but **5.2's gate runs against a stub fulfiller** (5.2, "Scope split"). The assertions that need the real `FulfilCheckout` (one client/project/order, the fulfilment fields of the response, DV-15 detection, and the parity specs `webhook-ledger`, `webhook-payment-states`, `dv-15-…:21,32`) are **gated in 5.3**, so 5.2 never needs 5.3 and 5.3 closes both. 5.2's Conversion parity result is complete only once 5.3 is green. All seven stories use the **Conversion** DoD (`epics.md:35`).
Real dependencies: 5.1 ← 1.3, 0.5; 5.2 ← 2.4, 0.5; 5.3 ← 5.2, 4.4, 2.7; 5.4 ← 5.3, 1.9; 5.5, 5.6, 5.7 ← 5.3. After 5.3, 5.4–5.7 are independent of each other.
Shared files (names suggested; add rows to `AGENTS.md` §7 in the story that creates each): `app/Actions/Checkout/` (StartCheckout 5.1; ClaimStripeEvent 5.2; FulfilCheckout, ProvisionAccess, CompleteFulfilmentSideEffects 5.3; StartUpsellCheckout, FulfilUpsell 5.5), `app/Support/Stripe/` (StripeCatalog 5.1 and 5.5; WebhookClassifier 5.2; InvoiceResolver 5.7), `app/Http/Controllers/Api/` and `Stripe/` (5.1–5.5), the checkout route file (5.1 creates; 5.2, 5.4, 5.5 append), `config/services.php`/`config/portal.php` price map (5.1, 5.5), `tests/Concurrency/` (5.2, 5.3, 5.5, 5.6), `tests/Arch/` (5.2 webhook, 5.6 shared action), and the `webhook` fulfilment path (5.3 builds, 5.5 and 5.6 extend; 5.5 edits `FulfilCheckout`'s upsell branch).
Possible parallel: 5.7 with 5.5/5.6 once 5.3 lands (own controller/resolver, but the API route file and `AGENTS.md` §7 rows are shared: expect small merge conflicts); 5.4's UI half with 5.5.
DV-25 correction (2026-11-23): a £0 order has no payment intent and usually no invoice; `InvoiceResolver` returns `none` (or the zero-value paid invoice's PDF) with no error; two cases added to `InvoiceResolverTest`.

Proposed DV rows opened by this epic, all awaiting the owner: **DV-20** (5.1, 5.5: no Stripe text in 500s), **DV-21** (5.2, 5.5: upsell for a missing project is permanent), **DV-22** (5.4: customer-safe troubleshooting copy, polling survives an error), **DV-23** (5.6: standard codes for a missing/unknown reprocess session), **DV-24** (5.5: stale `fromPackage` applies nothing, alerts the admin, never lowers limits), **DV-25** (5.3, 5.5: 100%-off promotion codes, `no_payment_required`). Also for the owner: the "flag stuck" mechanism (5.2 Open question 1). Live-mode Stripe and Postmark configuration is the owner's and is out of every story here.

**Final status (2026-11-23):** all seven stories are built on the chain and at `review`: 5.1 to 5.7. Each has L2/L3 tests green under `bin/test` (the one standing failure, `PrivateStorageSeaweedTest`, is host-disk exhaustion, not code). No L4 parity or L5 run happened for any of the seven; the specs named in each story's test plan are still to be run where the header's gate allows. The critic is reviewing 5.5 and 5.6; fixes follow. DV-20 to DV-25 and the "flag stuck" mechanism are still awaiting the owner. No live Stripe or Postmark configuration was touched.

**L4 parity run (2026-11-23, workbench/parity-4-5):** @auth 37 tests: Next 37 pass; Laravel 15 pass / 11 fail / 11 not reached. @checkout 28: Next 28 pass; Laravel 1 / 20 / 7. @entitlements 10: Next 10 pass; Laravel 0 / 10 / 0. Failures are the unwired Stripe/Postmark/Mailpit infra on the Laravel stack and not-yet-built pages/routes, listed with titles in `docs/laravel-migration/parity-run-2026-11-23.md`. This story's parity tests are not shown to match: stays at `review`.
