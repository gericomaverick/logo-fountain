# Story 0.8e: Abuse cases 19–23 and every remaining deviation test

Status: review

**Covers:** X-01, A-13, X-06, X-12, K-05, DV-1, DV-2, DV-4…DV-6, DV-8, DV-9, DV-11…DV-13, DV-UX · **Gate:** `@security&@ui`, `@deviation` · **After:** 0.8b–d · **DoD:** E0

## Delivered (`tests/parity/`)
- **Deviation tests** (`journeys/deviations/`, 12 tests, all `@deviation`, all listed in `expected-next-failures.txt`, each fails on Next at the deviating assertion):
  - `dv-checkout.spec.ts`: DV-1 (`allow_promotion_codes:true` on all six session kinds the app creates: 3 packages, a campaign-slug start, add-on, upgrade; read back from stripe-fake). DV-5 (`X-Forwarded-Host: evil.example` + `X-Forwarded-Proto: https` on the package start, add-on and upgrade: `success_url` origin = the canonical base URL, neither URL mentions the forged host).
  - `dv-upsell.spec.ts`: DV-2, Essential 1/1 → add-on 1/2 → upgrade → Professional **2/3**, consumed and reserved unchanged (Next: 2/2).
  - `dv-reprocess.spec.ts`: DV-6, reprocess of a paid session with no webhook → exactly one setup email (`next=/project/{id}`) and one admin "New project created"; a repeat (deduped) sends nothing more.
  - `dv-email.spec.ts`: DV-8, client message with postmark-shim `/__fail` armed once → **201**, the failing attempt is observed (`/__sent` `pendingFailures` reaches 0), then exactly one N-11 arrives by retry (75 s window for the 10 s first backoff, epics 2.7). DV-9, a revision upload → exactly one "Your revised concept is ready"; replaying the same receipt sends nothing.
  - `dv-uploads.spec.ts`: DV-11, finals `FILE_REQUIRED`, `ZIP_LIMIT_EXCEEDED` (bomb) and `FILE_SIGNATURE_MISMATCH` in the standard `{error:{message,code}}`. DV-13, corpus `zip-95000001` → 400 `FILE_TOO_LARGE` with "95" in the message; status and final ZIP unchanged.
  - `dv-images.spec.ts`: DV-12, snapshot, client concepts list and admin concepts list each carry a non-empty `imageKey`, identical across two polls (≥1 s apart), distinct per concept, not the URL; after a revision upload only that concept's key changes.
  - `dv-ux-navigation.spec.ts`: DV-UX (a) one-project customer lands on `/project/{id}` after sign-in; (b) an admin on `/project/{id}` lands on `/admin/projects/{id}`; (c) a buyer with **two** projects sets a password from the second setup link and reaches that project (only `next` can say which).
- **Abuse journeys** (normal tests, current Next behaviour):
  - `j19-cross-tenant-ui.spec.ts` (`@security @ui @authz`, two-tenants): client B opens A's overview, gallery, concept, messages and brief URLs. Nothing of A's (brand, industry, client name, email, A's object-key prefix) appears in the screen **or in any response body** sent to the browser, and no signed object request for A's files. Positive control: the same capture finds B's markers on B's pages.
  - `j20-forged-origin-forms.spec.ts` (`@security @ui @authz`): a page served at `http://evil.example` auto-submits forms (text/plain JSON smuggling and urlencoded) at messages, revision-requests, approve, comments, password and logout, plus a credentialed no-cors fetch. Each is 403 `INVALID_ORIGIN` with the browser's `Origin: http://evil.example`; project, messages, revisions, concepts and comments unchanged; still signed in; password unchanged.
  - `j21-open-redirect-rate-limit.spec.ts` (`@security @ui @auth`, shared `awaiting-brief`, fresh customers only): 8 `next` payloads through the sign-in screen and 3 rewritten fragment `next`s through a real sign-in link → signed in, on the app origin, no request to the attacker host, no script dialog. Five wrong passwords, then the **right** password and another wrong one, all show the identical message.
  - `j22-upload-abuse.spec.ts` (`@security @ui @uploads @admin`): corpus `image-10mib-plus-1`, `png-huge-dimensions`, `jpeg-40mp-plus` (concept upload) and `zip-bomb-declared-ratio`, `zip-bomb-lying-size`, `zip-total-expanded-over-500mib`, `zip-1001-entries` (finals) → 400 with the manifest's `expectedCode`; the admin screens refuse the same files; nothing published or stored.
  - **Journey 23 is not duplicated:** story 0.5 covers it in `contract/webhook-ledger.spec.ts:17` (bad/missing signature → 400), `:39`, `:57`, `:73` (replays and concurrent duplicates → one fulfilment, one email) and `contract/webhook-payment-states.spec.ts:15` (unpaid → not fulfilled).
- **Page objects:** `pages/navigation.ts` (`clientProjectPaths`, `signInWithNext`, `attemptSignIn`, `continueAfterPasswordSet`; own resolver, one export line appended to `pages/index.ts`), `pages/next/navigation.ts`, `pages/laravel/navigation.ts` (stubs: 4.9b, 6.2b).
- `journeys/_j19-j23-helpers.ts`: `corpusFile(id)` (builds `.generated/` files on demand with the corpus generator) and `refusalCode()`.

## DV coverage (every inventory DV row)
| DV | `@deviation` test (black box) | Laravel-only destination (not observable from outside) |
|---|---|---|
| DV-1 | `deviations/dv-checkout.spec.ts` DV-1 | "Fulfilment stores the discounted `amount_total`": no API exposes an order amount (`lib/project-snapshot.ts:141`, `app/api/admin/projects/route.ts:32`) → Pest L2, story 5.3 |
| DV-2 | `deviations/dv-upsell.spec.ts` | (none needed) |
| DV-3 | none: no behaviour change (VAT stays out of scope); C-17 parity is J9 | n/a |
| DV-4 | none: `project_orders.campaign_slug` is in no response (same selects as above) | **Pest L2, story 5.3** (fulfilment copies it), plus 5.1 for the metadata |
| DV-5 | `deviations/dv-checkout.spec.ts` DV-5 | (none needed) |
| DV-6 | `deviations/dv-reprocess.spec.ts` | (none needed) |
| DV-7 | 14 tests, `contract/concept-status-matrix.spec.ts` (0.7d) | arch test, story 2.2 |
| DV-8 | `deviations/dv-email.spec.ts` DV-8 (N-11 as the instance) | every template's queue/backoff/marker: Pest, story 2.7 |
| DV-9 | `deviations/dv-email.spec.ts` DV-9 | (none needed) |
| DV-11 | `deviations/dv-uploads.spec.ts` DV-11 (2 of the 3 places) | the storage-failure branch (`finals/route.ts:90`) needs a forced storage fault → Pest L2, story 7.8a |
| DV-12 | `deviations/dv-images.spec.ts` | "UI keeps the signed URL until the key changes or nears expiry": component test, story 3.4 |
| DV-13 | `deviations/dv-uploads.spec.ts` DV-13 | 95,000,000 accepted: corpus unit test, story 3.3 |
| DV-14 | 2 in `contract/authz-matrix.spec.ts` (0.7d) + J8 (0.8c) | (none needed) |
| DV-UX | `deviations/dv-ux-navigation.spec.ts` (3: landing, admin redirect, `next` after setup) | the look itself: L7 visual baselines, per UI story (Epics 6, 7) |

There is no DV-10 row (F-10 keeps current behaviour).

## Evidence (2026-11-19, stack `-p lf08e`: PG 55610, SMTP 51210, Mailpit 58210, S3 58410, shim 58211, fake 58212 with `STRIPE_FAKE_PUBLIC_URL`; Next 16.4 `next dev --webpack` on 127.0.0.1:4410 + forwarder 4411)
| Run | Result |
|---|---|
| `@security&@ui` | 7/7 passed (3.1 min) |
| `@deviation` | 29/29 "passed" = all 29 listed tests failed on Next as expected (17 earlier + 12 new), none passed (2.8 min) |
| `@ui\|@deviation` (57 tests), one run, default workers | Run 1: 54 passed, 3 failed (J15, J18, DV-UX admin); run 2: 56 passed, 1 failed (J16). Run 2's failure is `timed out waiting for the DB lock` (`adapters/seed.ts:129`, 600 s); all four pass when re-run (5/5 in 1.9 min). Run 3: 55 passed, 2 failed, both in earlier stories' tests: J13 `D-03` (refusal alert read as `""`: the 0.8d overview-poll flake, `admin/projects/[id]/page.tsx:174`) and smoke `A-15` (one `ERR_CONNECTION_REFUSED` from `next dev`). **Every 0.8e test passed in runs 2 and 3.** See open items |
- Each new deviation test was also run with an **empty** expected list to read its Next failure: every one fails at the deviating assertion (e.g. DV-1 `allow_promotion_codes: null`, DV-2 revisions limit 2, DV-5 `success: https://evil.example`, DV-8 `500`, DV-13 `200`).
- `npm run check`: OK (57 spec files, 261 titles, 29 expected Next failures). Strict `tsc` (`--strict --noUnusedLocals`, bundler resolution) clean for every new file.

## Next behaviour worth knowing (paths under `apps/web/src/`)
1. **A failed lifecycle email fails the user's request after commit.** `sendEmail` throws on a non-2xx (`lib/project-lifecycle-email.ts:137`) and the message route awaits it (`app/api/projects/[id]/messages/route.ts:110`), so the client gets **500** although the message is saved. A client retry would post it twice. DV-8 fixes this.
2. **`getRequestOrigin` trusts `X-Forwarded-Proto` as well as `X-Forwarded-Host`** (`lib/request-origin.ts:29-32`): the forged session's `success_url` was `https://evil.example/checkout/success?...`.
3. **The sign-in screen never shows the server's message.** `postAuth` replaces every failure with one fixed string (`lib/auth/client.ts:4`), so rate-limited and wrong-password attempts are identical on screen by construction (the API is uniform too, `app/api/auth/login/route.ts:13`).
4. A buyer without a password who buys twice gets a **second setup email naming the second project** (`next=/project/{p2}`).
5. A 95,000,001-byte ZIP is accepted, published and emailed (N-09) on Next.
6. Test-environment only: Chromium's Private/Local Network Access blocks a public page's `fetch` to a loopback app before it is sent. J20 turns those features off (`test.use({ launchOptions })`), because in production the app isn't on a private address. Form navigations aren't affected.

## Open items
- **For 0.9 (suite scale):** with this story the `db: "exclusive"` tests in `@ui|@deviation` add up to about 13 min of serial DB time, past the lock's 600 s wait (`adapters/seed.ts:72`). The lease isn't FIFO, so with 12 workers an unlucky waiter can time out. Run 1's log wasn't kept; its three failures were exclusive tests and passed in isolation, so this is the likely cause. Fix in `adapters/seed.ts` (FIFO tickets, or a wait limit scaled to the queue), or split the CI run. Not my file to change.
- **Parent:** set inventory Tests for X-01, A-13, X-06, X-12, K-05 (J19–J22; K-05 via 0.5) and every DV row per the table above, including the Laravel-only destinations (DV-4 → 5.3; DV-1 amount → 5.3; DV-11 storage branch → 7.8a; DV-12 UI → 3.4; DV-8 per template → 2.7), so the 0.9 coverage gate can read them. Copy Next points 1–4 into `brownfield/` (`business-rules-and-notifications.md`, `checkout-and-payments.md`, `auth-and-security.md`).
- Assumption for Laravel: in parity mode it sends lifecycle mail through postmark-shim (as J15 already assumes), otherwise DV-8's `pendingFailures` wait fails with a clear message. DV-5 assumes `PUBLIC_SITE_URL` = the suite's base URL.
- Laravel page objects in `pages/laravel/navigation.ts`: stories 4.9b and 6.2b.
- `zip-95000001` (95 MB) and the 10 MiB image are generated into `fixtures/uploads/.generated/` on first use (a few seconds; ~420 MB for the whole generated set).
