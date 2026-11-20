# Story 1.4: Origin guard as the CSRF control

- **Status:** review (the guard is complete; the `@security&@api` gate can't be green on Laravel until the product endpoints and seeding exist, see Test evidence)
- **Covers:** X-01, ADR-008, NFR-S1 · **Gate:** `@security&@api` · **After:** 1.3 · **DoD:** Conversion
- **Branch:** `worktree-agent-a7443a143bd2cb637` (from `908e4bd`)

## Story

As the portal, I refuse every cookie-authenticated mutation under `/api` whose Origin (or, without an Origin, Referer) isn't the canonical origin, before session, auth or body parsing, with Next's exact codes and exemptions; Laravel's CSRF token check stays off `/api/*` and on for any other form post.

**Acceptance (epics.md, Story 1.4):** `Origin: null` → `403 INVALID_ORIGIN` even with a valid Referer; the guard runs before session, auth and body parsing. Exempt: `POST /api/stripe/webhook`, `POST /api/checkout/magic-link`, `POST /api/checkout/resend-magic-link`, `GET /checkout/start`, all GETs, `/api/health`. `/api/*` is excluded from `PreventRequestForgery`. The arch test fails if a non-exempt mutating route lacks the guard.
**Moved here from 1.1b (owner-approved):** the Laravel parity stack runner, `tests/parity/converted-tags.txt`, and a `laravel` parity job in CI.

## Inventory scope

IDs: **X-01** (plus ADR-008, NFR-S1). Ledger rows 51 (`route-guards.test.ts`, the origin half) and 105 (`request-origin.test.ts`, the X-01 half; X-04 half was 1.3).

## Next.js source read

- `apps/web/src/lib/request-origin.ts` (whole file: `hasCanonicalProvenance` :59-82, `rejectUntrustedMutationOrigin` :91-106, `getSecuritySensitivePublicOrigin` :115-141).
- Every caller: 23 route files call `rejectUntrustedMutationOrigin` first (`app/api/**/route.ts`, listed by `grep -rn rejectUntrustedMutationOrigin apps/web/src/app`), plus `lib/auth/http.ts:18-22` (`authMutation`, used by 6 auth routes) and `app/api/auth/logout/route.ts:5-9` (origin first, then the proxy check).
- `apps/web/src/lib/request-origin.test.ts`, `apps/web/src/app/api/route-guards.test.ts` (`MUTATION_ORIGIN_EXEMPTIONS` :34-38).
- Docs: `brownfield/auth-and-security.md` §4, §5 and correction 2; `architecture.md` §4.1; ADR-008, ADR-020 (arch-test pattern), ADR-028; inventory X-01; `02-test-strategy.md` (CI, origin-guard arch test); stories 1.3 and 1.6 records.
- Parity: `journeys/contract/origin-guard.spec.ts`, `_authz-table.ts`, `auth-session.spec.ts:184-216`, `admin-guards.spec.ts:59`, `j20-forged-origin-forms.spec.ts`; `scripts/next-stack.mjs`, `scripts/gate.mjs`, `adapters/seed.ts`, `.github/workflows/parity.yml`, `portal.yml`.

## Behaviour notes (written before converting)

**Where it runs (Next).** Not middleware: each guarded handler's *first statement* is `const originError = rejectUntrustedMutationOrigin(req); if (originError) return originError;` (enforced by `route-guards.test.ts`). So it runs after routing (an unknown path is 404, a wrong method 405) and before auth, body reading and I/O. `authMutation` (`lib/auth/http.ts:18-22`) runs the **production proxy check first** (`503 AUTH_UNAVAILABLE`), then the origin guard; `logout` runs the origin guard first, then the proxy check.

**Coverage (Next).** Every non-GET `/api` handler except the three in `MUTATION_ORIGIN_EXEMPTIONS` (`route-guards.test.ts:34-38`):
```
"stripe/webhook/route.ts": "Stripe signature authenticates the exact raw body."
"checkout/magic-link/route.ts": "Public post-checkout possession-token flow; independently rate limited."
"checkout/resend-magic-link/route.ts": "Public post-checkout possession-token flow; independently rate limited."
```
= 30 guarded method endpoints in 29 files (`_authz-table.ts` `guarded: true`), including all 7 `/api/auth/*` POSTs. GETs (incl. `/api/health`, `/checkout/start`) are never guarded. Next has no method override.

**Algorithm** (`rejectUntrustedMutationOrigin`, :91-106):
1. `canonical = getSecuritySensitivePublicOrigin(req)`; on throw → `503 {"error":{"code":"PUBLIC_SITE_URL_REQUIRED","message":"Request validation is temporarily unavailable."}}` (story 1.3 already ports this and the canonical rules).
2. `hasCanonicalProvenance(req, canonical)` (:59-82):
   - `supplied = headers.get("origin")`. **If present at all** (including `""` and `"null"`): pass iff `supplied === new URL(supplied).origin && parsed.origin === canonical`; a parse error → fail. *A Referer never rescues a failed Origin.* Since `canonical` is itself a serialised origin, this is exactly `supplied === canonical` (byte equality; `https://app.example.com/` with a slash, a path, a query, userinfo, `\`, `%00`, other case/port all fail).
   - Else `referer = headers.get("referer")`: fail if empty/absent or it matches `/[\u0000-\u001f\u007f\\]/`; must parse as a URL, **start with `canonical + "/"`** (raw string), have `origin === canonical`, no username, no password and **`hash === ""`** (WHATWG: a bare trailing `#` has an empty hash and passes; `#x` fails). `/settings` (relative) fails (doesn't parse). A query is fine.
   - Fetch `Headers.get` joins repeated headers with `", "`; values are trimmed of OWS.
3. Failure → `403 {"error":{"code":"INVALID_ORIGIN","message":"Request origin is not allowed."}}` via `Response.json` (no `Cache-Control: no-store`, `brownfield` correction 2).

**Ignored signals:** `Sec-Fetch-Site`, `Host`, `X-Forwarded-*` never make a request trusted (`request-origin.test.ts` "fails closed for unverified provenance").

**Side effects:** none. The guard does no I/O and the 403 is returned before auth (anonymous callers get 403, never 401: `origin-guard.spec.ts`).

## Laravel implementation

| Behaviour | Where |
|---|---|
| Guard, exemptions, proxy-first order, provenance check | `apps/portal/app/Http/Middleware/RequireCanonicalOrigin.php` (`guards()`, `hasCanonicalProvenance()`, `EXEMPT_PATHS`, `PROXY_FIRST_PATHS`, `SAFE_METHODS`) |
| Pipeline position: global, right after SecurityHeaders, before ValidatePostSize/TrimStrings/ConvertEmptyStringsToNull and the `web` group (session, auth) | `apps/portal/bootstrap/app.php:19-22` (`prepend` called before SecurityHeaders' `prepend`) |
| `/api/*` out of `PreventRequestForgery` (the Laravel 13 name; `validateCsrfTokens()` is the deprecated alias); other posts keep it via the `web` group | `apps/portal/bootstrap/app.php:22` |
| `INVALID_ORIGIN` code | `apps/portal/app/Support/ErrorCodes.php` |
| Both errors thrown as `ApiException` (the 1.3 inline 503 refactored, per the AGENTS gotcha) | `RequireCanonicalOrigin::guard()` |
| Unguarded `PUT /storage/{path}` removed (local disk `serve` off) | `apps/portal/config/filesystems.php:36-39` |
| Arch testsuite added (`tests/Arch`), run in CI | `apps/portal/phpunit.xml`, `tests/Pest.php`, `.github/workflows/portal.yml:45-46` |
| Laravel parity runner, override, CI job, converted tags | `tests/parity/scripts/laravel-stack.mjs`, `tests/parity/infra/laravel.compose.yaml`, `.github/workflows/parity.yml` (job `laravel`), `tests/parity/converted-tags.txt`, `tests/parity/README.md` |

Design: **global and path-based**, as architecture §4.1 draws it ("global: SecurityHeaders → RequireCanonicalOrigin* (mutations; exemptions per X-01)"). A new `/api` route is guarded by default and a route can't opt out (`withoutMiddleware` doesn't touch global middleware). Decisions in the guard:
- **Real method** (`getRealMethod()`), so `_method=OPTIONS` or `X-HTTP-Method-Override` can't skip it (Symfony allows a POST→OPTIONS override; 1.3's `isMethodSafe()` check could be skipped this way).
- **The path Laravel routes on** (`rawurldecode(pathInfo)`, edge slashes trimmed), so `/%61pi/...` and `/api/x/` are guarded and `/api/stripe/webhook/` stays exempt.
- **Proxy-first paths:** for the 6 `authMutation` endpoints the guard calls `EnsureAuthAvailable` first (Next order). Logout isn't in the list: origin first, then route-level `EnsureAuthAvailable` (Epic 4).

## Deviations from Next.js

| Behaviour | Next.js | Laravel | Why | Decision ref |
|---|---|---|---|---|
| A mutation to an unknown `/api` path, or with a wrong method, and a bad Origin | 404 / 405 (the guard lives in the handler) | 403 `INVALID_ORIGIN` (with a canonical Origin: 404/405 as before) | Global guard per architecture §4.1: secure by default, before body parsing. No parity test probes it | Proposed DECISION below |
| JSON key order of the 403/503 bodies | `{"error":{"code","message"}}` | `{"error":{"message","code"}}` (the X-03 `ApiError` order) | One renderer (AGENTS: never hand-build error JSON); parity compares parsed JSON | Proposed DECISION below |
| POST with `_method` / `X-HTTP-Method-Override` | no override exists | the guard decides on the real method | Closes an override bypass | — |

## Tests

| Layer | Test file / title | Inventory IDs |
|---|---|---|
| L2 Pest | `apps/portal/tests/Feature/OriginGuardTest.php`, 75 cases: exact Origin; 15 refused Origins (incl. `null`, `""`, trailing `/`, case, port, `\`, `%00`); a Referer never rescues; Referer accept/refuse table (incl. bare `#`, control chars, `Sec-Fetch-Site`/Host ignored); repeated headers; before body and session (no cookies), with X-02 headers and no `no-store`; safe methods; method override; path spellings; exemptions; non-API posts keep CSRF; `/api/*` excluded from `PreventRequestForgery` (subclass with the unit-test skip off); 503 config table; proxy-first vs logout order in production; loopback canonical | X-01 |
| Arch (Pest) | `apps/portal/tests/Arch/OriginGuardTest.php`: global order; pinned exemptions; CSRF exclusion exactly `api/*`; **every registered route**: an `/api` mutation must be covered and answer a foreign Origin with 403 `INVALID_ORIGIN` through the real kernel, and any other mutation must carry `PreventRequestForgery`; a self-test with escaping routes | X-01 |
| L2 Pest (updated) | `tests/Feature/ConfigFailClosedTest.php` (routes moved under `/api`, canonical Origin sent), `tests/Feature/AuthJsonBoundaryTest.php` (canonical Origin sent) | X-04, A-17 |
| Parity | `journeys/contract/origin-guard.spec.ts`: the 180 refused cells (spec unchanged) | X-01 |

Test-port ledger rows resolved (proposed): **51** `route-guards.test.ts` (the origin half → arch test; the auth and admin halves belong to Epics 4/7), **105** `request-origin.test.ts` (X-01 cases → `OriginGuardTest.php`; the X-04 cases were 1.3).

## Test evidence

- `bin/test` (Pint, Larastan 9, Pest), isolated stack `lf-1-4`: **267 passed (750 assertions)**, 0 failed (+75 here). Arch suite alone: 5 passed.
- `bin/ui-test`: **55/55** passed.
- Live through nginx + php-fpm (`curl` to `:18084`, `POST /api/projects/p/brief`): foreign, `null` and **empty** Origin → 403 `INVALID_ORIGIN`; canonical Origin and canonical Referer → 404 (routing, not 419); Referer with `#x` → 403; foreign Origin on `/api/stripe/webhook` → 404 (exempt; no route yet).
- Parity on Laravel (`laravel-stack.mjs`, project `lf-1-4-parity`, port 18094):
  - `"@security&@api"`: **180 passed, 63 failed, 13 did not run** of 256. Every pass is a refused cell of `origin-guard.spec.ts` (30 guarded endpoints × 6 variants). The failures need product endpoints (Epics 4–7: canonical-Referer pass-through, exempt GETs, webhook and checkout, X-02 on `/login`, DV-5) or seeding (`spawnSync php ENOENT`: `parity:seed` doesn't exist yet, Epic 2). The 13 that didn't run are in serial files whose `beforeAll` seeds (incl. the 2 X-01 tests in `auth-session.spec.ts`).
  - `"@security&@api" --only "X-01 .* -> 403 INVALID_ORIGIN before auth "`: **180/180 passed** (what CI now runs).
  - `laravel-stack.mjs` with no gate: exit 0, "no gate yet".
- Parity structure: `npm run check` OK (59 files, 266 tests, 32 expected Next failures); `selftest` A/B/C pass; `coverage` 108/108 rows, 15/15 DV.

**Not run, and why:**
- Parity on Next: `apps/web` and the shared specs are unchanged, so the 0.9 baseline (727 passed) stands. Not re-run, to stay off the shared `lf-parity` stack. The new `parity.yml` `laravel` job hasn't run on GitHub yet (not pushed).
- `@security&@api` fully green on Laravel: impossible until the endpoints and `parity:seed` exist. `converted-tags.txt` stays empty (recorded in the file).
- `bin/browser-test`: no UI change.

## Gotchas
- **Laravel's local disk `serve => true`** registers `GET` and a signed `PUT /storage/{path}` outside the `web` group (no CSRF, no origin guard). Turned off; the arch test catches it if it comes back. → propose for AGENTS.md.
- **Inertia prepends `EnsureDeferredCallbacksRun`** to the global stack, so `prepend()` doesn't mean "first": the arch test allows only that one before SecurityHeaders.
- **`PreventRequestForgery` is skipped under Pest** (`runningUnitTests()`); test it with a subclass that returns false (see `OriginGuardTest.php`). → propose for AGENTS.md.
- Every `/api` mutation in a Pest test now needs a canonical `Origin` (or Referer). Use an explicit host (`http://localhost/api/...`): otherwise the test client uses `APP_URL` (`http://localhost:8080`) as the host. → propose for AGENTS.md.
- Symfony allows a `POST` override to `OPTIONS`, `PUT` and so on (not to GET/HEAD): security decisions must use `getRealMethod()`. → propose for AGENTS.md.
- Laravel routes on `rawurldecode(pathInfo)`: path-based security rules must normalise the same way, or `/%61pi/...` slips past.
- Playwright `--grep` matches `project file title`, so a `^`-anchored title regex finds nothing.
- The portal's `docker compose up --build` can race (`image ... already exists`) because init, app and worker share one tag; the runner builds `app` first.

## Docs updated
Story record, `tests/parity/README.md` and `converted-tags.txt`. The tracking files are the parent's (below).

### Proposed statuses (for the parent)
- `sprint-status.yaml`: `1-4-origin-guard-as-the-csrf-control: review` (or `done` if the owner accepts "every applicable test is green" for this gate).
- Inventory **X-01**: Laravel `Http/Middleware/RequireCanonicalOrigin.php`, `bootstrap/app.php`; Tests `tests/Feature/OriginGuardTest.php`, `tests/Arch/OriginGuardTest.php`, parity `origin-guard.spec.ts` refused cells (180/180 on Laravel); status **In progress** (the canonical-Referer pass-through and exempt-endpoint cells verify with Epics 4–7).
- Test-port ledger rows 51 (origin half) and 105 (X-01 half): resolved as above.
- Handoff: `parity.yml` now has a `laravel` job; watch its first GitHub run.

### Proposed decisions / risks (for DECISIONS.md / RISKS.md)
- DECISION: the X-01 guard is a global, path-based middleware (architecture §4.1), not per-route as in Next; unknown `/api` paths and wrong methods with a bad Origin answer 403 instead of 404/405.
- DECISION: the guard decides on the real HTTP method and the decoded routing path.
- DECISION: the 6 `authMutation` paths run `EnsureAuthAvailable` inside the global guard, before the origin check (Next order); Epic 4 doesn't need route middleware for that order.
- DECISION: 403/503 bodies use the shared `ApiError` key order (`message`, `code`), not Next's (`code`, `message`); they're JSON-equal.
- DECISION: parity CI runs Next and Laravel as two jobs, not a matrix (ADR-028 consequence): the setups share nothing.
- DECISION: `converted-tags.txt` stays gate-only; tests of a not-yet-green gate that already apply run in CI via `laravel-stack.mjs --only`.
- DECISION: local disk `serve` is off (no `/storage/{path}` routes).
- RISK: the `laravel` CI job builds the portal image on every push (a few minutes); revisit caching in 1.9.

### Proposed `apps/portal/AGENTS.md` promotions
- §5 "Also always": the origin guard is global (`RequireCanonicalOrigin`, right after SecurityHeaders), and new `/api` mutations are guarded automatically. An exemption needs an X-01 inventory change, `EXEMPT_PATHS` and the arch test's pinned list.
- §8 gotchas: Pest `/api` mutations need a canonical Origin and an explicit host; use `getRealMethod()` for security decisions; no `serve` on local disks; `PreventRequestForgery` is skipped under Pest.
- §2: the `tests/Arch` suite (`--testsuite=Arch`); parity on Laravel via `tests/parity/scripts/laravel-stack.mjs`.

## Open items
- **Epic 2 (seed):** `php artisan parity:seed`, and seeding through the container from `adapters/seed.ts` (it calls host `php`); then the seeded X-01 cells can run.
- **Epics 4–7:** as endpoints land, the canonical-Referer and exempt cells go green. Then add `@security&@api` to `converted-tags.txt` and drop the `--only` CI step.
- **Epic 4:** attach `EnsureAuthAvailable` as route middleware to `GET /api/auth/session` and `POST /api/auth/logout` (it runs after the guard); not to the 6 proxy-first paths (the guard runs it).
- **Any story adding the parity infra (Mailpit, stripe-fake, SeaweedFS) to Laravel:** extend `infra/laravel.compose.yaml`.
- **1.5 coordination:** `bootstrap/app.php` gained two lines before the SecurityHeaders `prepend`. A global `TrustedClientAddress` must land after the guard (arch §4.1), i.e. be prepended *before* the guard's `prepend` call, and the arch test's order assertion must be extended.
