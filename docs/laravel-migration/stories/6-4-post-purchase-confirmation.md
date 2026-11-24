# Story 6.4: Post-purchase confirmation

**Status:** review · **DoD variant:** Conversion · **Epic:** 6 · **Covers:** K-10, FR19 · **Gate:** `@upsell&@ui` · **After:** 6.3. Test mode only.

## Story
As a client back from Stripe, I am told my purchase is being confirmed, then that it is.

## Acceptance criteria
1. `?upsell=1&session_id=…[&kind=addon|upgrade]` shows a banner; anything else shows none.
2. It polls `GET /api/checkout/status` at once, again after 2.5 s, then every 7 s, until `fulfilled`. Confirmed copy depends on `kind`; the allowances refresh at once.
3. A refresh keeps it (the state comes from the URL, not storage) and restarts the polling.
4. A failing status call shows the delayed state ("Refresh the page in a moment").
5. A polite live region: it never takes focus.

## Laravel implementation
`resources/js/Components/project/PurchaseBanner.tsx`; schedule and copy in `lib/upsell.ts`.

## Deviations from Next.js
None.

## Tests
| Layer | Test | IDs |
|---|---|---|
| L1 | `tests/js/upsell.test.ts`: 2.5 s then 7 s, copy per state, URL parsing | K-10 |
| L7 | `project-overview.spec.ts`: confirming, refresh, confirmed on the third later poll (page.clock) | K-10 |

## Test evidence
As 6.2b. The delayed state is covered by the unit copy test only, not in the browser.
