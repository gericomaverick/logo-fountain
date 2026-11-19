# Test strategy: proving each converted piece end to end

## 1. Principle

**The current Next.js app is the specification.** Before any Laravel code is written (Epic E0), we build a framework-agnostic **parity suite** that drives the app only from outside: the browser, HTTP, email inbox, object store and Stripe events. We make it pass against Next.js. Each Laravel slice is then "done" when the same tests, unchanged, pass against Laravel.

A parity test may only change when:
- Next.js is wrong (a bug). Fix or mark it in the test, log a decision, and note it in the story record. Or:
- the behaviour is deliberately changed, by a logged decision.

A test may never be edited just to make Laravel pass.

**Behavioural parity, not visual parity (decision 2026-11-18, DV-UX).** The Laravel UI is redesigned from the start, so the parity suite proves that **the same things happen** (data, state transitions, emails, files, permissions, error codes, what the person can do at each step), **not** that the screens look the same. Consequences:
- Browser tests never depend on markup, CSS classes or layout. They drive the app through **page objects** (`tests/parity/pages/`), such as `hub.requestRevision(conceptNo, text)` and `admin.publishConcept(file)`, with **one implementation per target** (`pages/next/*`, `pages/laravel/*`). The journeys (`tests/parity/journeys/*`) are shared and never branch on the target.
- Page objects use accessible locators first (`getByRole`, `getByLabel`). Where the new design adds `data-testid`, only the Laravel page object uses it.
- Copy that **states a rule, a price or a legal fact** (prices, allowance counts, "single-use link expires in one hour", error messages from the API) is still asserted. Marketing and UI wording isn't, unless the UX spec freezes it.

**Decided deviations** (`01-feature-inventory.md` → DV- rows) are tests tagged `@deviation`. They assert the **new** behaviour and run on **both** targets. On Laravel they must pass. On Next the reporter **expects them to fail**, and they're listed in `tests/parity/expected-next-failures.txt`, so a deviation test that unexpectedly passes on Next fails the run (meaning the deviation isn't what we think).

**Navigation and IA changes from DV-UX** (the one-project landing, admin redirects, the Files grouping) are absorbed by page objects. For example, `portal.openProject(name)` works whether or not a list is shown. A test that asserts a landing URL or redirect target is tagged `@deviation` (DV-UX) and listed in `expected-next-failures.txt`.

## 2. Test layers

| Layer | Tool | Runs against | What it proves | When |
|---|---|---|---|---|
| L0 Static | Pint, Larastan (max level achievable), `tsc`, ESLint for Inertia/React | Laravel | Types, style, dead code | Every commit |
| L1 Unit | Pest | Laravel | Pure logic ported from `src/lib`: state machine, entitlement deltas, brief wizard rules, safe-next, origin parsing, ZIP and image validation, filename sanitising, admin dashboard sort, upsell rules | Every commit |
| L2 Feature | Pest HTTP tests on **real PostgreSQL** (not SQLite: UUIDs, JSONB, advisory locks) with `RefreshDatabase` | Laravel | Every endpoint: authz, validation, status codes, DB effects, audit rows, queued mail | Every commit |
| L3 Concurrency | Pest plus parallel processes and real PG (port of the 18 `*.postgres.integration.test.ts`) | Laravel | Webhook retries converge, auth fencing races, single-use tokens, concept upload receipts, ambiguous commits | Every story touching X-09/A-10/K-05, and nightly |
| L4 Contract | Playwright `request` (no browser) in the **shared parity suite** | **Both apps** | Paths, methods, status codes, JSON shapes, error codes, headers, cookies, for all 49 endpoints | Every story |
| L5 E2E browser | Playwright in the **shared parity suite** | **Both apps** | Real journeys for client and admin (§4) | Every story |
| L6 Authz matrix | Generated Playwright contract tests | **Both apps** | Every endpoint × {anonymous, client A, client B (other tenant), admin} → expected status. Builds on `docs/rls-matrix-v1.0.md` | Every story |
| L7 Visual | Playwright screenshots of every screen, light and dark, 1280 px and 390 px | **Laravel only**: baselines are approved against the **UX design spec** when each screen's story is done, then guarded against unintended change | The redesign is built as specified and doesn't regress | Every UI story |
| L7a Accessibility | `@axe-core/playwright` on every screen and state (WCAG 2.2 AA), plus keyboard-only runs of the main journeys | Laravel | No serious or critical violations; focus order and visible focus | Every UI story |
| L7b Design-system lint | ESLint rule plus grep check: no raw colours, pixel font sizes or ad-hoc gradients outside the token files (the rules from the UX spec) | Laravel | The design system is followed everywhere | Every commit |
| L8 External sandbox | Mailpit, SeaweedFS, Stripe test-mode fixtures | **Both apps** | Emails (subject, recipient, link works), object storage behaviour, webhook handling | Every story with email, storage or payment |
| L9 Owner-run live | Manual checklist | Laravel staging/prod | Live R2, live Postmark, Stripe live webhook, proxy headers, HSTS | Release gates only |

## 3. The shared parity suite

- **Location:** `tests/parity/` at the repo root. It belongs to neither app.
- **Target:** `PARITY_BASE_URL` (e.g. `http://localhost:3000` for Next, `http://localhost:8000` for Laravel) and `PARITY_TARGET=next|laravel`. Only the adapters in `tests/parity/adapters/` may branch on the target (how to seed, where Mailpit is). Tests never branch on it.
- **Seeding:** each app gets a seed command that builds the **same named scenarios** with the same emails and passwords: `npm run parity:seed -- <scenario>` (Next) and `php artisan parity:seed <scenario>` (Laravel). Both are guarded so they can't run against a non-local database (port `lib/local-dev-fixture-guard.ts`). Scenarios:
  `fresh-purchase`, `awaiting-brief`, `brief-draft`, `brief-submitted`, `concepts-ready`, `revision-reserved`, `revisions-exhausted`, `awaiting-approval`, `final-files-ready`, `delivered`, `on-hold`, `two-tenants` (client A and client B), `admin-only`.
- **Sign-in in tests** goes through the real login form or API. There's no test-only auth backdoor in production code.
- **Stripe:** a **stripe-fake** service in the test stack (decision 2026-11-18, readiness C1) implements the Stripe endpoints both apps call (Checkout Session create, retrieve and line items; customers; invoices; payment intents; accounts). Both apps point at it in test mode (`STRIPE_API_BASE`; Node SDK `host/port/protocol`, PHP `api_base`). Fixtures in `tests/parity/fixtures/stripe/` define every purchase scenario. A fake hosted-checkout page "pays" or "fails" a session and posts a **locally signed** webhook (current timestamp, because of the 300 s tolerance). That keeps the suite deterministic and **offline**, needs no secrets in CI, and doesn't depend on whether the hard-coded price IDs are live or test. An optional `@stripe-live-test` set uses real Stripe test mode with the owner's test key (owner-run, excluded from CI).
- **Storage:** **SeaweedFS** stands in for R2 (MinIO's repository was archived on 2026-04-25; see research §6.2). E0 must verify with a probe test that SeaweedFS honours `If-None-Match: *` on PUT (412 on conflict). **Verified 2026-11-19 (story 0.2):** 412 on the second PUT, with the first body kept; with 8 concurrent writers exactly 1 gets 200. So X-10 stays at L4/L8 and no L3 stub is needed. If it doesn't, X-10 conditional-write tests move to L3 using a stub, plus the live L9 check. **Layer tags:** `@unit` (Pest or Vitest), `@api` (L4/L6 HTTP), `@ui` (L5 browser), `@pg-race` (L3), `@visual` (L7/L7a). A story's gate is a tag **expression** such as `@auth&@api` (see `epics.md`).
- **Stripe:** fixture `checkout.session.*` events are signed locally with the test webhook secret and POSTed to `/api/stripe/webhook`. So it's deterministic and offline. Checkout Session lookups go to Stripe **test mode** (`STRIPE_SECRET_KEY=sk_test_…`). A smaller `@stripe-live-test` set runs through real Checkout with `stripe listen`, and is opt-in. Rows whose only destination is a Laravel-only layer (L1–L3, L7) satisfy the script by recording that destination in the ledger or inventory.
- **Tags** (Playwright `--grep`) match the inventory: `@smoke @auth @authz @security @contract @checkout @webhook @upsell @entitlements @revisions @brief @concepts @approval @finals @messages @settings @invoices @admin @state @audit @email @storage @uploads @visual @ops @cli @pg-race`.
- **Traceability:** every test title starts with its inventory ID(s), e.g. `test('K-05 webhook retry after transient failure is processed @webhook', …)`. A script `tests/parity/scripts/coverage.mjs` fails if any inventory row (other than O-series) has no test.

## 4. End-to-end journeys (L5), the minimum set

**Client**
1. Buy a package → success page polls → setup email (Mailpit) → set password → dashboard shows the project `AWAITING_BRIEF`. (K-01/02/05/06, A-06, N-01, C-01)
2. Existing account buys again → sign-in link, not setup. (A-06, N-02)
3. Brief: start, autosave a draft, reload, draft restored, submit → status, system message, **no email** (N-13). (C-05/06/07, N-15)
4. Admin publishes a concept → client gets the email, sees the badge, opens the concept, signed image loads, badge clears. (D-06, N-04, C-08/09/15)
5. Comment on a concept (**no email**). Request a revision → allowance shows reserved → admin marks it delivered → shows consumed, client email. (C-10/11, D-09, K-14, N-05/12)
6. Revisions exhausted → add-on upsell shows → buy (fixture webhook) → banner polls → allowance increases. Upgrade path the same. (C-04, K-08/09/10)
9. Settings: update the name, see the invoices, change password → every session ends, including the current one. (C-17/18, K-11, A-09)
8. Messages both ways, with system messages interleaved. (C-14, D-17, N-06/11)
9. Settings: update the name and VAT number, see the VAT on invoices, change password → other sessions are revoked. (C-17/18, K-11, A-09)
10. Forgot password → reset email → reset → old sessions are dead, the old reset link is dead. (A-07/08)
11. Logout is verified; the back button doesn't reveal protected pages. (A-02/03)

**Admin**
12. Dashboard ordering for a mix of scenarios (needs-action first, unread first). (D-01)
13. Every allowed status transition works, every disallowed one is rejected, and on-hold/resume returns to the previous state. (D-03, X-07)
14. Upload a concept: retry with the same receipt is idempotent. Delete a concept. (D-05/07, X-13)
15. Replace finals in `DELIVERED`: the newest asset is served, the old download link is still valid until it expires, notification retry. (D-11/12/13)
16. Entitlement override and reset; project reset keeps the stored objects; audit log shows each action. (D-14/15/16, X-08)
17. Health page with SeaweedFS up and with SeaweedFS down. (D-18)
18. Reprocess a stuck purchase. (K-12)

**Abuse and security**
19. Cross-tenant access to every client resource → 403/404 (L6 matrix). Non-admin to every admin route → 403.
20. Bad or missing Origin on every mutation → 403 `INVALID_ORIGIN`, checked before auth.
21. Open-redirect `next` payloads rejected. Rate limits trigger with uniform responses.
22. Oversized image, decompression-bomb ZIP, too many ZIP entries → rejected with the same error codes.
23. Webhook with a bad signature → 400. Replayed event → no double fulfilment. Unpaid session → not fulfilled.

## 5. Gates

| When | Must pass |
|---|---|
| Every commit (CI) | L0, L1, L2 for Laravel; unit tests for Next (until archived) |
| Story done | The story's parity tags against **Laravel and Next**, plus **all earlier stories' tags** against Laravel (regression), plus L3 if relevant, plus the coverage script |
| Epic done | The full parity suite against Laravel for everything converted so far, L7 visual for that epic's screens, and the retrospective |
CI: a GitHub Actions workflow running `docker compose` inside the job (ADR-028), with jobs `laravel-ci` (Pint, Larastan 9, Pest including the L3 group), `parity` (matrix `target: [next, laravel]`; runs the expressions in `tests/parity/converted-tags.txt`, which each story updates), `ui` (Vitest, tsc, ESLint plus the design lint, L7/L7a, Lighthouse) and `audit` (composer and npm audit, the security check, the log grep). An expression goes into `converted-tags.txt` only when every test it selects has its prerequisites built.

**Runtime modes:** Next runs `next dev` on loopback with `PARITY_MODE=1`. Laravel runs `APP_ENV=testing`. Production-only behaviour (A-17 fail-closed, X-04 HTTPS, `__Host-` cookies, HSTS) is proven by Pest/Vitest plus L9, not by the parity suite.

CI: a GitHub Actions workflow with jobs `laravel-ci` (Pint, Larastan, Pest with a Postgres service) and `parity` (matrix `target: [next, laravel]` with Postgres, Mailpit and SeaweedFS services; runs the tags for converted slices from `tests/parity/converted-tags.txt`, which each story updates).

## 6. Test-port ledger

The 95 Vitest files and their 614 tests encode a lot of edge cases. **Done in Phase 0 (2026-11-18):** `test-port-ledger.md` maps all 110 test files (Vitest plus Playwright): one row per Vitest file → its inventory IDs → where its intent lives after the port (Pest unit, Pest feature, parity test, or "not applicable: framework-specific", with a reason). Every row must be resolved before its epic closes. The 18 real-PG integration tests map one-to-one to L3 tests.
- [x] `docker-compose.test.yml` (story 0.2, `tests/parity/infra/`): postgres 18.7 (init: `lf_parity` plus `parity.parity_marker`), mailpit v1.33.0, seaweedfs 4.51 (bucket bootstrap), **stripe-fake**, **postmark-shim** (relays to Mailpit; `/__fail` forces 5xx), plus later the Laravel app and queue worker
## 7. Test infrastructure to build in E0

- [ ] `tests/parity/` Playwright project, adapters, tag conventions, coverage script
- [ ] `docker-compose.test.yml`: postgres, mailpit, minio (bucket bootstrap), plus later the Laravel app and queue worker
- [ ] Next.js: point SMTP at Mailpit in test mode (Postmark stays for production), point R2 at SeaweedFS, `parity:seed` scenarios
- [x] Stripe signer: `infra/stripe-fake/server.mjs` (`signPayload`) plus fixtures in `fixtures/stripe/` (story 0.2; scenarios in 0.5)
- [ ] **Golden upload corpus** `tests/parity/fixtures/uploads/` (valid and malicious PNG/JPEG/WebP/ZIP), each with its expected error code captured from Next. Run by Vitest (Next), Pest (Laravel) and an HTTP subset in the parity suite (see `brownfield/storage-and-uploads.md` §7)
- [ ] **Shared rule fixtures** `tests/parity/fixtures/rules/*.json` for the logic that exists in both PHP and TS: the state-machine transition table, `safeAuthNextPath` cases, brief normalisation and validation, display status, entitlement usage. Both test suites must agree on every case
- [ ] **Snapshot contract:** a JSON-schema of the full `GET /api/projects/{id}` snapshot shape (`brownfield/business-rules-and-notifications.md` §3), asserted against both apps for each seed scenario
- [ ] **Origin-guard architecture test** (replaces `route-guards.test.ts`): Pest asserts every non-exempt mutating route carries the Origin middleware, plus the L6 matrix checks it over HTTP
- [ ] **Next.js test seams** (the only allowed `apps/web` changes during the freeze; inventory row O-09; inert unless `PARITY_MODE=1`): `POSTMARK_API_URL` override (→ postmark-shim), `R2_ENDPOINT` plus path-style (→ SeaweedFS), `STRIPE_API_BASE` (→ stripe-fake, both Stripe clients), and `scripts/parity-seed.mjs` with its own guard (`PARITY_MODE`, a loopback or `postgres` host, the `lf_parity` DB, the `parity_marker` table)
- [ ] The full suite green against Next.js, then recorded as the baseline in `handoff.md` with counts
