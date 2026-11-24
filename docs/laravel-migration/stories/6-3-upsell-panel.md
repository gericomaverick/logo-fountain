# Story 6.3: Upsell panel

**Status:** review · **DoD variant:** Conversion · **Epic:** 6 · **Covers:** C-04, K-08 · **Gate:** `@upsell&@ui` · **After:** 6.2b, 5.5. Test mode only.

## Story
As a client with no revisions left, I am offered one more revision or the next package, with prices, and can put the offer away for a day.

## Acceptance criteria
1. The panel shows in CONCEPTS_READY, REVISIONS_IN_PROGRESS and AWAITING_APPROVAL. The add-on (£95) appears only with nothing left; the upgrade (Essential → Professional £495, Professional → Complete £750) with one or none left; Complete has none.
2. Both buttons are secondary (the turn banner owns the primary action). A purchase POSTs the checkout session and leaves for hosted Stripe; the server checks the real price ids.
3. "Not now" hides the panel for 24 h: a `sessionStorage` key `upsell:dismissed:{project}:{package}` holding an expiry in epoch ms. Unreadable values mean "not dismissed".

## Laravel implementation
`resources/js/lib/upsell.ts` (rules, no imports), `resources/js/Components/project/UpsellPanel.tsx`.

## Deviations from Next.js
None.

## Tests
| Layer | Test | IDs |
|---|---|---|
| L1 | `tests/js/upsell.test.ts`: offer rules, prices, 24 h expiry boundary, key, unreadable values | C-04, K-08 |
| L7 | `project-overview.spec.ts` "Not now" hides it and a reload keeps it hidden | C-04 |

## Test evidence
As 6.2b: `bin/ui-test` exit 0 (237 unit tests), browser 34 passed.

## Parity result
L4 `@upsell&@ui` on head 442aef9: J6 buy extra revision and J6 upgrade Essential→Professional both passed (2 passed); `@client&@ui` not run (the J6 journeys drive this panel).

## Check with the owner
Panel copy and its tinted accent surface; sessionStorage means a new tab shows the offer again.
