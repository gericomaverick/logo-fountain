# Story 6.12: Account, theme and invoices page

**Status:** review, **API half only** (UI half pending the owner's key-screen approval) · **DoD variant:** Conversion · **Epic:** 6 · **Covers:** C-17, C-18, C-19, DV-3 · **Gate:** `@settings&@api`, `@settings&@ui`, `@invoices&@ui` · **After:** 4.7, 5.7, 1.7. Test mode only.

## Story
As a signed-in client, I can set my first and last name, keep my theme choice and see all my invoices.

## Acceptance criteria
1. `GET /api/profile`: `{profile:{id,email,firstName,lastName,fullName}}`; with no profile row the login email and nulls. Anonymous 401. (API, done)
2. `PUT /api/profile`: JSON body, `firstName`/`lastName` each string or null else 400 `INVALID_FIRST_NAME` / `INVALID_LAST_NAME`; bad JSON 400 `INVALID_JSON`. A name is JS-trimmed (`NodeCompat::trimEnv`), blank becomes null, and it is cut to 80 UTF-16 units (`NodeCompat::slice`), as Next does (a cut, not a rejection). Omitted keys keep their value; `fullName` is recomputed (parts joined by a space, null when empty). Unknown keys (VAT, `id`, `email`, `isAdmin`) are ignored (DV-3). Always acts on the signed-in user. Untrusted Origin 403. (API, done)
3. Account invoices list `GET /api/invoices` (C-18, K-11): already built in story 5.7 (`InvoiceController::mine`, `tests/Feature/Checkout/InvoicesApiTest.php`); nothing new here. (API, done in 5.7)
4. Theme (C-19): persisted client-side only (`localStorage` `lf-theme`, `public/theme-init.js`, story 1.7), as in Next. There is no server-side theme route in Next, so none is added. (Done in 1.7)
5. Settings page, invoices page, name form, change password UI. **Pending: UI waits for the owner's key-screen approval.**

## Next.js source read
`apps/web/src/app/api/profile/route.ts` and `route.test.ts` (4 cases), `api/invoices/route.ts`; parity `tests/parity/journeys/contract/client-settings.spec.ts`.

## Deviations from Next.js
| Behaviour | Next.js | Laravel | Why | Decision ref |
|---|---|---|---|---|
| PUT body that is JSON but not an object (`null`, `5`) | 500 (TypeError) | treated as `{}`, 200 | no crash | none |
| Unpaired surrogate (lone `\ud800` in the JSON, or left by the 80-unit cut) | kept as-is | replaced by U+FFFD | PHP/Postgres cannot store a lone surrogate | tested, `ProfileApiTest.php:80-86` (8 cases in the file) |
| Invalid UTF-8 body | Next replaces the bytes and carries on | 400 `INVALID_JSON` | the body does not decode | none |

## Laravel implementation
`ProfileController` (`show`, `update`), two `ErrorCodes`, routes in `routes/checkout.php` (`web`, `auth.verified`). Invoices stay in `InvoiceController` (5.7); this story does not touch it.

## Tests
| Layer | Test | IDs |
|---|---|---|
| L2 | `tests/Feature/Checkout/ProfileApiTest.php` (7 cases: stored GET, email fallback, trim/omit/null/fullName, 80-unit cut incl. astral and unknown keys, invalid names and JSON, per-caller, 401 and Origin 403) | C-17, DV-3 |
| L2 | `tests/Feature/Checkout/InvoicesApiTest.php` (5.7) | C-18 |
| L4 | `client-settings.spec.ts` (`@settings&@api`) | C-17, C-18 |

Next's four `route.test.ts` cases are all matched (stored, email fallback, trim and preserve, invalid JSON and names).

**Test evidence:** `bin/test` (check-agents-guide, Pint, Larastan 9, Pest incl. `tests/Concurrency`) full run: 2206 passed, 1 pre-existing warning (`SafeNextTest`), no failures. Typecheck and lint ran clean (no output). The parity `client-settings.spec.ts` was **not run** on Laravel in this story.

## J9 / J11 page-object stubs
`tests/parity/pages/settings.ts` (`settingsPagesFor`, `accountPagesFor`) is UI only: J9 (`j9-settings.spec.ts`: name, invoices table, password change) and J11 (`j11-logout.spec.ts`: sign-out, back button, protected pages) are `@ui` journeys driving pages; their API parts (`PUT /api/profile`, `GET /api/invoices`, logout) exist already. The stubs wait on the UI.
