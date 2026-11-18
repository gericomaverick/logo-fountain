# Test strategy: proving each converted piece end to end

## 1. Principle

**The current Next.js app is the specification.** Before any Laravel code is written (Epic E0), we build a framework-agnostic **parity suite** that drives the app only from outside: the browser, HTTP, email inbox, object store and Stripe events. We make it pass against Next.js. Each Laravel slice is then "done" when the same tests, unchanged, pass against Laravel.

A parity test may only change when:
- Next.js is wrong (a bug). Fix or mark it in the test, log a decision, and note it in the story record. Or:
- the behaviour is deliberately changed, by a logged decision.

A test may never be edited just to make Laravel pass.

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
| L7 Visual | Playwright screenshots of key screens, light and dark, desktop and 390px mobile | **Both apps** (Next as the baseline) | The ported UI looks the same, within a pixel-diff tolerance agreed in E0 | Client/admin UI stories |
| L8 External sandbox | Mailpit, MinIO, Stripe test-mode fixtures | **Both apps** | Emails (subject, recipient, link works), object storage behaviour, webhook handling | Every story with email, storage or payment |
| L9 Owner-run live | Manual checklist | Laravel staging/prod | Live R2, live Postmark, Stripe live webhook, proxy headers, HSTS | Release gates only |

## 3. The shared parity suite

- **Location:** `tests/parity/` at the repo root. It belongs to neither app.
- **Target:** `PARITY_BASE_URL` (e.g. `http://localhost:3000` for Next, `http://localhost:8000` for Laravel) and `PARITY_TARGET=next|laravel`. Only the adapters in `tests/parity/adapters/` may branch on the target (how to seed, where Mailpit is). Tests never branch on it.
- **Seeding:** each app gets a seed command that builds the **same named scenarios** with the same emails and passwords: `npm run parity:seed -- <scenario>` (Next) and `php artisan parity:seed <scenario>` (Laravel). Both are guarded so they can't run against a non-local database (port `lib/local-dev-fixture-guard.ts`). Scenarios:
  `fresh-purchase`, `awaiting-brief`, `brief-draft`, `brief-submitted`, `concepts-ready`, `revision-reserved`, `revisions-exhausted`, `awaiting-approval`, `final-files-ready`, `delivered`, `on-hold`, `two-tenants` (client A and client B), `admin-only`.
- **Sign-in in tests** goes through the real login form or API. There's no test-only auth backdoor in production code.
- **Email:** both apps send to **Mailpit** in test (SMTP). The `mail` adapter waits for a message, asserts recipient and subject (N-series), pulls out the link and follows it. That's how setup, magic and reset links are tested for real.
- **Storage:** **MinIO** stands in for R2. E0 must verify MinIO honours `If-None-Match: *` on PUT. If it doesn't, X-10 conditional-write tests move to L3 using a stub, plus the live L9 check.
- **Stripe:** fixture `checkout.session.*` events are signed locally with the test webhook secret and POSTed to `/api/stripe/webhook`. So it's deterministic and offline. Checkout Session lookups go to Stripe **test mode** (`STRIPE_SECRET_KEY=sk_test_…`). A smaller `@stripe-live-test` set runs through real Checkout with `stripe listen`, and is opt-in.
- **Tags** (Playwright `--grep`) match the inventory: `@smoke @auth @authz @security @contract @checkout @webhook @upsell @entitlements @revisions @brief @concepts @approval @finals @messages @settings @invoices @admin @state @audit @email @storage @uploads @visual @ops @cli @pg-race`.
- **Traceability:** every test title starts with its inventory ID(s), e.g. `test('K-05 webhook retry after transient failure is processed @webhook', …)`. A script `tests/parity/scripts/coverage.mjs` fails if any inventory row (other than O-series) has no test.

## 4. End-to-end journeys (L5), the minimum set

**Client**
1. Buy a package → success page polls → setup email (Mailpit) → set password → dashboard shows the project `AWAITING_BRIEF`. (K-01/02/05/06, A-06, N-01, C-01)
2. Existing account buys again → sign-in link, not setup. (A-06, N-02)
3. Brief: start, autosave a draft, reload, draft restored, submit → status, system message, admin email. (C-05/06/07, N-15)
4. Admin publishes a concept → client gets the email, sees the badge, opens the concept, signed image loads, badge clears. (D-06, N-04, C-08/09/15)
5. Comment on a concept → admin gets the email. Request a revision → allowance shows reserved → admin marks it delivered → shows consumed, client email. (C-10/11, D-09, K-14, N-05/12)
6. Revisions exhausted → add-on upsell shows → buy (fixture webhook) → banner polls → allowance increases. Upgrade path the same. (C-04, K-08/09/10)
7. Approve with acknowledgement → emails → admin uploads finals → client downloads ZIP (correct filename and bytes). (C-12/13, D-11, N-07/08/09)
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
17. Health page with MinIO up and with MinIO down. (D-18)
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
| Pre-cutover | The **entire** parity suite green on both apps, three consecutive runs (flake check), L3 nightly green for 7 days, the L9 checklist signed off by the owner |

CI: a GitHub Actions workflow with jobs `laravel-ci` (Pint, Larastan, Pest with a Postgres service) and `parity` (matrix `target: [next, laravel]` with Postgres, Mailpit and MinIO services; runs the tags for converted slices from `tests/parity/converted-tags.txt`, which each story updates).

## 6. Test-port ledger

The 95 Vitest files and their 614 tests encode a lot of edge cases. **Done in Phase 0 (2026-11-18):** `test-port-ledger.md` maps all 110 test files (Vitest plus Playwright): one row per Vitest file → its inventory IDs → where its intent lives after the port (Pest unit, Pest feature, parity test, or "not applicable: framework-specific", with a reason). Every row must be resolved before its epic closes. The 18 real-PG integration tests map one-to-one to L3 tests.

## 7. Test infrastructure to build in E0

- [ ] `tests/parity/` Playwright project, adapters, tag conventions, coverage script
- [ ] `docker-compose.test.yml`: postgres, mailpit, minio (bucket bootstrap), plus later the Laravel app and queue worker
- [ ] Next.js: point SMTP at Mailpit in test mode (Postmark stays for production), point R2 at MinIO, `parity:seed` scenarios
- [ ] Stripe fixture signer (`tests/parity/stripe/sign.mjs`) and fixture events
- [ ] **Golden upload corpus** `tests/parity/fixtures/uploads/` (valid and malicious PNG/JPEG/WebP/ZIP), each with its expected error code captured from Next. Run by Vitest (Next), Pest (Laravel) and an HTTP subset in the parity suite (see `brownfield/storage-and-uploads.md` §7)
- [ ] **Shared rule fixtures** `tests/parity/fixtures/rules/*.json` for the logic that exists in both PHP and TS: the state-machine transition table, `safeAuthNextPath` cases, brief normalisation and validation, display status, entitlement usage. Both test suites must agree on every case
- [ ] **Snapshot contract:** a JSON-schema of the full `GET /api/projects/{id}` snapshot shape (`brownfield/business-rules-and-notifications.md` §3), asserted against both apps for each seed scenario
- [ ] **Origin-guard architecture test** (replaces `route-guards.test.ts`): Pest asserts every non-exempt mutating route carries the Origin middleware, plus the L6 matrix checks it over HTTP
- [ ] **Next.js test seams** (the only allowed `apps/web` changes during the freeze, each with an inventory note): a Postmark → SMTP (Mailpit) switch in test mode, an R2 endpoint override → MinIO, and the `parity:seed` script
- [ ] The full suite green against Next.js, then recorded as the baseline in `handoff.md` with counts
