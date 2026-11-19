# Story 0.7a: Contract suite: auth, checkout, webhook

Status: done

**Covers:** A-01…A-11, A-13, A-17, K-01…K-04, X-01, X-06, N-01…N-03 · **Gate:** `@auth&@api`, `@checkout&@api` · **After:** 0.4, 0.5 · **DoD:** E0
Webhook cases (K-05, K-06) are in story 0.5's `journeys/contract/webhook-*.spec.ts`, not here.

## Delivered (`tests/parity/journeys/contract/`)
- `auth-session.spec.ts` (15 tests): login (identical 400 for wrong, unknown, no-password, >72-byte and rate-limited; failure bucket cleared on success), session shape and no-store, logout (old cookie dead server-side), password change (401, INVALID_PASSWORD_CHANGE, CURRENT_PASSWORD_INVALID, per-user 429, `signedOut:true` revokes every session), auth wrapper (INVALID_JSON, 413 at >8192 bytes, AUTH_FAILED), headers, Origin/Referer guard.
- `auth-links.spec.ts` (12): magic-link request and verify (single use, shape, kinds don't cross), safe `next`, forgot/reset (INVALID_EMAIL, WEAK_PASSWORD, reset revokes sessions and all links, no session), A-11 send failure, setup flow for the fresh-purchase user, setup → sign-in degrade, identity bucket 5/15 min on link and token endpoints.
- `checkout-contracts.spec.ts` (8): `/checkout/start` (INVALID_PACKAGE, 303 to stripe-fake, metadata, `campaign_slug` trim/80 via stripe-fake's stored session), status, checkout magic-link/resend (INVALID_JSON, MISSING_SESSION_ID, 409, sign-in link even for a no-password buyer, 3/session then 429 + `retry-after`, A-11 500).
- `_auth-helpers.ts`: Mailpit reader (snapshot a mailbox, wait for new mail, parse the fragment link), postmark-shim `/__fail`, stripe-fake session read, `purchase()` (real `/checkout/start` → stripe-fake pay → signed webhook → app), and a **cross-file DB lock**.

## Evidence (2026-11-19, Next on an isolated stack `-p lf07a`)
- `@auth&@api`: **27 passed**. `@checkout&@api`: **10 passed** (8 + the two A-06 setup tests). Combined, rerun on the same Next process: 35/35.
- `npm run check`: OK (4 files, 37 tests). `tsc --strict` on the new files: clean.

## Design notes
- **Rerunnable on Next:** the checkout-email limiter is process-local (`lib/checkout-auth-email-rate-limit.ts:21`) and survives reseeding, so every checkout-email test buys a fresh session for a unique buyer through `purchase()`.
- **Cross-file lock** (`_auth-helpers.ts`, `acquireDbLock`): every file reseeds one DB, and `fullyParallel` would otherwise run two files at once. 0.7b–d should use the same lock, or the config should set `workers: 1` for DB-mutating gates.
- Raw bodies are sent as `Buffer`: Playwright JSON-encodes a string `data` when the content type is JSON.
- Next must run with `--webpack` in a worktree with a symlinked `node_modules`. Turbopack refuses a symlink that leaves its root.

## Next behaviour that differs from the brownfield docs
1. **Referrer-Policy on `/api/auth/*` is `strict-origin-when-cross-origin`, not `no-referrer`.** `next.config.ts:28,44` (the global header) overrides `lib/auth/http.ts:7`. The doc is wrong at `auth-and-security.md:42`. The test asserts the current value: decide whether Laravel keeps it or a DV row is added.
2. `403 INVALID_ORIGIN` and `503 PUBLIC_SITE_URL_REQUIRED` responses don't carry `Cache-Control: no-store` (`lib/request-origin.ts:96,102` use plain `Response.json`). The checkout email endpoints don't either (`lib/checkout-auth-email.ts:46,65`).
3. A-11 on `/api/auth/magic-link` and `/forgot-password`: a send failure is **swallowed** and the uniform 200 is returned (`magic-link/route.ts:8`, `forgot-password/route.ts:9`). The "fixed error" (`auth-and-security.md:33`) surfaces only on the checkout endpoints (`500 AUTH_EMAIL_SEND_FAILED`).
4. `reset-password` checks WEAK_PASSWORD **before** the token (`lib/auth/service.ts:75`). `/api/auth/password` returns 401 before validating the body, and every attempt, invalid ones included, spends the per-user bucket (`password/route.ts:10-11`).

## Not covered (and why)
- Login for an unverified mailbox that **has** a password: no scenario has one, and there's no black-box way to make one (the fresh-purchase user has neither).
- A-11 "proof deleted": the failed token never leaves the server. Covered indirectly (nothing delivered, and a retry works). Needs L3.
- A-04 (7-day cap, needs a clock), A-03 503, A-17 production 503s and the address buckets (no proxy config in parity mode; prod-only per test strategy §92).
- `MISSING_EMAIL`, `EMAIL_UNAVAILABLE`, `CHECKOUT_URL_MISSING`, `CHECKOUT_SESSION_FAILED`: none can be triggered without config changes or Stripe failure injection. The checkout 5/60-min destination limit isn't covered either.
- DV-5 (forwarded-header success URL) belongs to 0.7d. A-18 (callback UI) belongs to 0.8a.

## Inventory rows to update (Tag/Tests columns; status stays Not started)
A-01, A-02, A-03, A-05, A-06, A-07, A-08, A-09, A-11, A-13, A-17: `parity/journeys/contract/auth-session.spec.ts`, `auth-links.spec.ts`. K-01…K-04: `checkout-contracts.spec.ts`. X-01, X-06: both auth files. N-01…N-03: `auth-links.spec.ts`. A-07's source column still cites the dead `lib/forgot-password-rate-limit.ts`.


## Parent review (2026-11-19)
Cherry-picked to main. `npm run check` OK (13 specs, 96 tests). Corrections copied into `brownfield/auth-and-security.md`. **Follow-up (0.8a):** merge the DB locks in `_auth-helpers.ts` and `_admin-helpers.ts` into one lock in `fixtures.ts`.
