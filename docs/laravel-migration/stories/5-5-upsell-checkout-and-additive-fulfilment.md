# Story 5.5: Upsell checkout and additive fulfilment

**Status:** review (created from `origin/workbench/4-integrate` b2e1115) · **DoD variant:** Conversion · **Epic:** 5 · **Covers:** K-08, K-09, DV-2, DV-5, DV-15, FR17, FR18 · **Gate:** `@upsell&@api`, `@deviation` (DV-2) · **After:** 5.3 · **Stacks on:** `origin/workbench/4-integrate`; in the SERIAL chain, the previous Epic 5 story's branch (see `epic-5-build-order` in 5.7). Test mode and fakes only (stripe-fake, postmark-shim); live Stripe/Postmark is the owner's.

> Created with the repo's create-story form. All `apps/web` `file:line` read 2026-11-23; `apps/web` is frozen, so nothing here edits it.

## Story
As a client, I can buy an extra revision or an upgrade from my project; the extras I already bought are kept, and a payment by a different email still lands.

## Acceptance criteria
1. **Guards, in order.** Origin guard (`checkout/session/route.ts:47-48`), signed-in user (`:50`), membership of the project (`:51-52`), project exists else `404 PROJECT_NOT_FOUND` (`:54-61`), JSON body else `400 INVALID_JSON` (`:63-68`), `kind` is `addon` or `upgrade` else `400 INVALID_KIND` (`:70-73`).
2. **Add-on session.** `addonKey` must be `extra_revision` else `400 INVALID_ADDON_KEY` (`:78-81`); price not configured → `500 PRICE_NOT_CONFIGURED` (`:83-85`). Session: `mode=payment`, `customer_creation=always`, one line item, metadata `{kind,projectId,addonKey,fromPackage}`, response `200 {url}` (`:87-102`). Extra revision £95.
3. **Upgrade session.** `toPackage` and the project's current package must be valid package codes else `400 INVALID_UPGRADE_PATH` (`:105-109`); only Essential→Professional (£495) and Professional→Complete (£750) exist else `400 UNSUPPORTED_UPGRADE_PATH` (`:20-25,111-114`). Metadata `{kind,projectId,fromPackage,toPackage}` (`:116-131`). Price IDs come from the server map beside the display prices (K-08), never from the request.
4. **Promotion codes (DV-1).** Both sessions carry `allow_promotion_codes=true`. Next sets none (`:87-99,116-128`). `@deviation`.
5. **Canonical URLs (DV-5).** Success `{PUBLIC_SITE_URL}/project/{id}?upsell=1&kind={addon|upgrade}&session_id={CHECKOUT_SESSION_ID}`, cancel `{PUBLIC_SITE_URL}/project/{id}`, from config. Next uses the request origin (`:75,90-91,119-120`). `@deviation`.
6. **Errors.** Auth/membership failures use the standard shape from Epic 4. Any other failure → `500 CHECKOUT_SESSION_FAILED` with a **fixed message** (**proposed DV-20**, shared with 5.1; Next echoes `error.message`, `:133-135`).
7. **Add-on fulfilment.** The `revisions` entitlement limit rises by 1 (created at limit 1 if missing; a null limit is treated as 0 before the +1, `checkout-fulfillment.ts:221-238`); audit `entitlement_addon_applied` `{checkoutSessionId,paymentIntentId,addonKey,revisionDelta:1}` (`:240-248`).
8. **Upgrade fulfilment, additive (DV-2).** For each of `concepts` and `revisions`: **new limit = current limit + (target tier limit − current tier limit)**; a null (unlimited) limit stays null; consumed and reserved are untouched. Example: Essential 1/1 plus one add-on = 1/2; upgrade to Professional → **2/3** (not 2/2). Project `package_code` becomes the target; audit `package_upgrade_applied` `{checkoutSessionId,paymentIntentId,fromPackage,toPackage}`. Next **sets** each limit to the target tier's, losing the add-on (`:251-290`). `@deviation`. The "current tier" is the project's package at fulfilment time, read inside the transaction.
9. **Order.** `FULFILLED` order for the project's client with `campaign_slug` `addon:extra_revision` or `upgrade:{from}->{to}`, the session's total and PI; audit `order_fulfilled` with `kind` (`:300-317`). No admin new-project email for upsells (`webhook/route.ts:198`).
10. **Idempotent.** An existing order for the session → `deduped` (`:191-207`); the limits change once under concurrent deliveries.
11. **Metadata is trusted only as far as the allowlist.** Metadata that does not parse (unknown kind or addon key, invalid packages, no project id) is treated as a package session and fails as "not an allowlisted package" (`parseUpsellMetadata` `:74-100`, `fulfillCheckoutSession` `:337-339`).
15. **Stale `fromPackage` (critic B3; proposed DV-24).** For an upgrade, inside the transaction compare the project's current `package_code` with the metadata `fromPackage`. If they differ (a second paid session for the same step, or a session fulfilled after the project moved on), **apply nothing**: no limit change, no package change; treat it as a DV-15-style permanent failure (event processed, audit `upgrade_stale_from_package` `{checkoutSessionId,projectPackage,fromPackage,toPackage}`, admin "Payment needs attention" email with the session ID once, flagged stuck as in 5.2) so the owner refunds by hand. **A negative or zero delta is never applied** (limits never go down; no payment is taken for a no-op without an alert). Tests: Essential→Professional paid twice → the second applies nothing and alerts; a Professional-tier session on a Complete project → nothing applied, alert, limits unchanged. `@deviation`. Next does not check this (`checkout-fulfillment.ts:251-290`).
12. **DV-15: buyer email differs from the client's billing email.** Entitlements, order and audit are applied; **no account is provisioned** for that email; audit `upsell_buyer_email_mismatch` `{checkoutSessionId,purchaserEmail}` is written; the admin is emailed **once**; the webhook returns `200`. Next applies the entitlements, then `ensureAccessProvisioning` throws (`:452`) and the event retries as transient. With a matching email the customer sign-in email is sent once as in 5.3 AC 9 (`webhook/route.ts:166-196`).
13. **Unknown project** at fulfilment → permanent, audit + admin email (**proposed DV-21**, defined in 5.2 AC 12).
14. **Test mode.** Fixtures `upsell-addon-extra-revision`, `upsell-upgrade-essential-professional`, `upsell-upgrade-professional-complete` (`{{projectId}}` placeholder, story 0.5); no real price IDs.

## Inventory scope
K-08, K-09, DV-1 (upsell half), DV-2, DV-5 (upsell half), DV-15 (email-mismatch half). K-10 (the return banner) is not here: it belongs to the project hub story.

## Next.js source read
`api/projects/[id]/checkout/session/route.ts:1-138`; `lib/checkout-fulfillment.ts:36-100,182-323,438-465`; `api/stripe/webhook/route.ts:148-207`; contract `webhook-upsell.spec.ts`; `lib/stripe.ts` (`UPSELL_PRICE_TO_ACTION`).

## Behaviour notes
- Next's upgrade does a second `updateMany` for limits lower than the target (`:270-276`), which is redundant with the upsert's `set`; DV-2 replaces both.
- The upgrade does not re-check that the project is on `fromPackage` at fulfilment; with DV-2 the maths uses the project's real current tier (Open question 2).

## Laravel guidance
`app/Actions/Checkout/StartUpsellCheckout.php`, `FulfilUpsell.php` (called by `FulfilCheckout`, 5.3), `app/Support/Checkout/EntitlementMath.php` (pure: `upgrade(current, fromTier, toTier)`, table-tested), policy from 2.2 for membership. Catalog from 5.1.

## Planned deviations from Next.js
| ID | Deviation | Status |
|---|---|---|
| DV-1 | Promo codes on upsell sessions | Owner-approved |
| DV-2 | Additive upgrade | Owner-approved |
| DV-5 | Canonical URLs | Recommendation |
| DV-15 | Email mismatch fulfils + audit + admin email | Owner-approved |
| DV-20, DV-21 | See 5.1, 5.2 | Proposed |
| **DV-24** | Upgrade whose `fromPackage` no longer matches the project: apply nothing, permanent failure with admin alert, never a negative delta | **Proposed, awaiting owner** |
| DV-25 | 100%-off promotion codes (see 5.3 AC 1; applies to upsell sessions too) | **Proposed, awaiting owner** |

## Tasks
1. EntitlementMath + tests. 2. StartUpsellCheckout + controller. 3. FulfilUpsell. 4. DV-15 mismatch branch. 5. Tests. 6. Record, inventory, ledger, sprint-status.

## Test plan
| Layer | Test | Covers |
|---|---|---|
| L1 | `EntitlementMathTest.php`: add-on, each upgrade, null limits, consumed/reserved untouched | DV-2 |
| L2 `@upsell&@api` | `UpsellCheckoutTest.php`: AC 1–3, 6, authz (non-member → `404 PROJECT_NOT_FOUND`, `AGENTS.md:58`) | K-08 |
| L2 `@upsell&@api` | `UpsellFulfilmentTest.php`: AC 7, 9–11, 14 | K-09 |
| L2 `@deviation` | AC 4, 5, 8 (2/3 case), 12 (mismatch) | DV-1, DV-2, DV-5, DV-15 |
| L3 `@pg-race` | two deliveries of one upsell session raise limits once | K-09 |
| L2 `@deviation` | AC 15 stale `fromPackage` (two cases above) | DV-24 |
| L2 | Email-mismatch admin alert has subject "Payment needs attention", session ID in the body, sent once | DV-15 |
| L4 parity | `contract/webhook-upsell.spec.ts` (3; the upgrade case changes under DV-2) | K-09 |
| L4 parity `@deviation` | `journeys/deviations/dv-checkout.spec.ts:43` (DV-1, add-on/upgrade half) and `:58` (DV-5, upsell half); `dv-upsell.spec.ts:16` (DV-2: 2/3); `dv-15-webhook-hopeless-failures.spec.ts:41` (DV-15 mismatch): pass on Laravel, fail on Next | DV-1, DV-2, DV-5, DV-15 |

## Definition of done (Conversion, `epics.md:35`)
`bin/test` green (Pint, Larastan level 9, Pest) with the tests below; the Conversion record filled; inventory Laravel/Tests columns, ledger rows, `sprint-status.yaml` → `review`, and one line each in DECISIONS / RISKS / ASSUMPTIONS where something was decided. No `apps/web` change. **Test mode only:** every Stripe call goes to stripe-fake (`STRIPE_SECRET_KEY` a `sk_test_…` value, `api_base` pointed at the fake) and every mail to the postmark-shim or Mailpit; no live Stripe or Postmark key, webhook secret or price ID is read, written or configured (live mode is the owner's). L4/L5 parity runs only where the header's gate says so. **Conversion variant (`epics.md:35`):** the Next result equals `tests/parity/expected-next-failures.txt` (the deviation specs named in the test plan fail on Next, everything else passes); every earlier gate stays green on Laravel; Laravel page-object methods the story's journeys use are implemented in `tests/parity/pages/laravel/` (accessible locators first, `data-testid` only in Laravel objects, shared journeys unchanged). The parity specs listed in the test plan run on Laravel and on Next.

## Open questions (with recommendations)
1. **DV-20 / DV-21** (see 5.1, 5.2). *Recommendation:* approve both.
2. **Validate upsell metadata against the paid line item.** Next trusts the server-set metadata. *Recommendation:* parity (trust metadata; Stripe sets it from our own session), and re-read the project's package inside the transaction for the maths.
3. **Owner items:** DV-20, DV-21, **DV-24** (stale `fromPackage`, recommendation in AC 15), DV-25 (see 5.3). DV-1/2/15 are approved. Display prices (£95/£495/£750) are config values in minor units (9500, 49500, 75000).

## Conversion record

### Inventory scope
K-08, K-09, DV-1 (upsell half), DV-2, DV-5 (upsell half), DV-15 (email-mismatch half), DV-21, DV-24.
### Next.js source read
`api/projects/[id]/checkout/session/route.ts`, `checkout-fulfillment.ts:182-323`, `webhook/route.ts:166-198`, `stripe-price-allowlist.ts`.
### Behaviour notes
Metadata is parsed by `UpsellMetadata`; unparseable metadata falls through to package fulfilment and fails the allowlist (AC 11). The project row is locked for the entitlement read-modify-write and the order is re-checked under that lock. The `fromPackage` of an add-on is recorded, never used.
### Laravel implementation
`StartUpsellCheckout` + `UpsellCheckoutController` (`POST /api/projects/{id}/checkout/session`, `web` + `auth.verified`, membership via `ProjectPolicy::participate`), `config/catalog.php` `upsells`, `FulfilUpsell`, `EntitlementMath`, `UpsellMetadata`, `PackageEntitlements::tierLimit`, `HopelessCheckoutFailure::upgradeStaleFromPackage`, DV-15 mismatch branch in `FulfilCheckout::followUp` (audit + admin email once, under `Locks::fulfilSideEffects`).
### Deviations from Next.js
| Behaviour | Laravel | Decision ref |
|---|---|---|
| Promotion codes, canonical URLs, fixed 500 message | as 5.1 | DV-1, DV-5, DV-20 |
| Upgrade adds the tier difference | 1/1 + add-on, then Professional = 2/3 | DV-2 |
| Buyer email differs | entitlements applied, no account, audit + one admin email | DV-15 |
| Stale `fromPackage` / downgrade | nothing applied, permanent failure `upgrade_stale_from_package`, admin alert | DV-24: built as recommended, awaiting owner |
| Unknown project | permanent, audit + admin email | DV-21: built as recommended, awaiting owner |
### Tests
`tests/Unit/EntitlementMathTest.php` (L1), `tests/Feature/Checkout/UpsellCheckoutStartTest.php`, `UpsellFulfilmentTest.php` (L1/L2 only; no L3). The DV-24 stale/downgrade/same-tier path through the webhook is tested (critic B3). L4 parity specs and an upsell `@pg-race` test were not written or run.
