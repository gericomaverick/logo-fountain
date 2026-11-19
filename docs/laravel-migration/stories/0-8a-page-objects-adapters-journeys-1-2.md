# Story 0.8a: Page objects, adapters, journeys 1–2

Status: done

**Covers:** K-02, A-06, N-01, N-02, C-01 (+ K-01, K-06, A-05) · **Gate:** `@checkout&@ui`, `@auth&@ui` · **After:** 0.5, 0.7a · **DoD:** E0

## Delivered (`tests/parity/`)
- **One DB lock** (`adapters/seed.ts`, `fixtures.ts`): a cross-process readers-writer lease per database (`$TMPDIR/lf-parity-db-<sha256(PARITY_DATABASE_URL)>/`: `writer/pid`, `readers/<pid>-x`, `baseline`). Writer preference, dead-pid takeover, atomic pid write. Test option `db`: `"none"` (default), `"exclusive"` (per test), `{ shared: "<scenario>" }` (per file; the first holder seeds the baseline, holders only add data). `seed()` throws without an exclusive lease. `lockDbForFile()` for `beforeAll`. `PARITY_LOCK_LOG` traces every lease and seed.
- Migrated onto it, duplicates removed: `_auth-helpers.ts` (`acquireDbLock`/`releaseDbLock` = file-wide exclusive), `_admin-helpers.ts` (`db: "exclusive"`), `_client-helpers.ts` (`useScenario` = `test.use({db:"exclusive"})` + reseed in `beforeEach`; covers the 0.7b client specs and 0.7d `authz-matrix`, `origin-guard`, `concept-status-matrix`, so `--workers=1` is no longer needed), `adapters/stripe.ts` (`seedOnceForRun` = file-wide shared on `awaiting-brief`; the mail lock moved under the same directory with pid liveness; `adminClient()` re-signs in after a new lease). Spec files unchanged apart from removing the two duplicate `test.fixme` admin-reply tests (`client-concepts.spec.ts:80`, `client-messages.spec.ts:65`; DV-14 replaces them).
- **Bug the consolidation fixed:** the three old locks used three different directories (auth `sha256(baseURL|DB)`, admin `hex(DB)`, client `sha1(baseURL)`), so they never excluded each other, and `seedOnceForRun` held nothing while webhook tests ran.
- `adapters/mail.ts`: `mailbox()` snapshots and `proofLink()` (moved from `_auth-helpers.ts`, which re-exports them). `adapters/stripe.ts`: `withMailInFlight()`, `fakeDeliveries()`, `fulfilledProjectId()`.
- **Page objects** (`pages/index.ts`): `auth.signIn/requestMagicLink/confirmMagicLink/setPasswordFromLink`, `checkout.start/payOnFakeStripe/waitForConfirmation`, `portal.openProject(name?)/currentProjectId/projectStatus/currentTurn`. `pages/next/*` use role/label locators. `pages/stripe-fake.ts` is shared. `pages/laravel/index.ts` is typed stubs (4.9b, 5.1, 5.4, 6.1, 6.2b).
- **Journeys:** `journeys/j1-purchase.spec.ts` and `journeys/j2-returning-customer.spec.ts` (`@ui`, shared `awaiting-brief`). J1: buy in the browser → the success page polls `/api/checkout/status` → exactly one setup email (fragment token, "one hour") → set password → sign in → the project is `AWAITING_BRIEF`, the customer's turn, and the setup link is single-use. J2: its own returning customer (first purchase and password set over HTTP) buys again in the browser → exactly one sign-in email, no setup email → explicit confirm on `/auth/callback` → signed in on the new project, and the password still works.
- The storage adapter named in the epic isn't needed by J1/J2. It's left to 0.8b (J4 signed image).

## Evidence (2026-11-19, isolated stack `-p lf08a`, Next 16.4 `next dev --webpack` on 127.0.0.1:4360)
| Run | Result |
|---|---|
| `@checkout&@ui` | 2/2 |
| `@auth&@ui` | 2/2; `--repeat-each=3`: 6/6 |
| ONE run, default workers (12): `@auth&@api \| @admin&@api \| @webhook&@api \| @client&@api \| @authz&@api \| @ui` | **433 passed**, 16 expected Next failures (the 0.7d deviations), 5 skipped (existing `fixme`/`skip`), 0 failed, 8.7 min. Lock log: 385 exclusive and 7 shared leases, 432 seeds, **0 overlaps** (checked from `PARITY_LOCK_LOG`) |
- The first combined run found a real race and it was fixed: a waiter read the writer's pid file while it was still empty, took the writer for dead and removed its lock (2 overlaps, then a 404 and an `INVALID_CREDENTIALS` in other tests). The pid is now written atomically (temp file and rename), and an empty pid counts as "being written". The same guard was added to the mail lock.
- `npm run check`: OK (30 spec files, 221 titles, 16 expected failures). A `tsc` pass (strict, through apps/web's TypeScript) is clean for every file touched here. `origin-guard.spec.ts:67` (0.7d) has one pre-existing type error.

## Next behaviour worth knowing
1. With `next dev --hostname 0.0.0.0`, Next allows only `localhost` and the bind host for dev resources (`next/dist/server/lib/router-utils/block-cross-site-dev.js:75-105`). It blocks the HMR socket for a `127.0.0.1` page, so client pages reload rather than hydrate, and the success page never polls. Fix (README): bind to `127.0.0.1`, run a TCP forwarder for stripe-fake, and set `POST /__config {webhookUrl}`.
2. `next dev` can full-reload a freshly compiled page after first paint. That wipes the typed input and the fragment token, because `takeMailboxProof` strips the hash on mount (`apps/web/src/lib/auth/client.ts:7-13`). The page objects retry from `goto` (`pages/next/auth.ts` `attempt`). The token isn't consumed until submit.
3. The setup link carries `next=/project/{id}` (`lib/magic-link-email.ts:7`), but `/set-password` ignores it and always goes to `/login?password=updated` (`app/set-password/page.tsx:47`). Login then defaults to `/dashboard` (`app/login/page.tsx:17-20`), so J1 reaches the project through the list. The sign-in link (J2) does land on `/project/{id}` (`app/auth/callback/page.tsx:21`).
4. The project hub has no turn indicator, and its status badge has no role. `portal.projectStatus()` reads the badge before the only `h1` and maps it through `PROJECT_STATE_LABELS` (`lib/project-state-machine.ts:39`). `currentTurn()` follows the dashboard grouping (`app/dashboard/page.tsx:38`).
5. stripe-fake posts the webhook before it redirects to `success_url`, so the first status poll already reads `fulfilled`. The 45 s troubleshooting path isn't exercised. That belongs to 0.8e or 5.4.

## Open items
- **Parent:** update the inventory status for K-02, A-06, N-01, N-02 and C-01 (L5 parity tests exist), and copy Next points 1–3 into `brownfield/ui-pages.md`.
- Pre-existing `test.fixme` `client-settings.spec.ts:107` (receipt download) still needs a seeded Stripe charge in stripe-fake. Next in these runs uses `STRIPE_API_BASE` = stripe-fake, never real Stripe.
- Laravel page objects: fill them in with stories 4.9b, 5.1, 5.4, 6.1 and 6.2b.


## Parent review (2026-11-19)
Cherry-picked to main. `npm run check` OK (30 specs). Surprises 1–4 copied into `brownfield/ui-pages.md`. The unified lock and seed API is documented in this record and is now **the only mechanism** (`test.use({ db: "exclusive" | { shared } })`).
