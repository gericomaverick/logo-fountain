# Story 1.3: Config validation and canonical origin

**Status:** done (2026-11-20; merged `8cb8719`; parent marked O-07 In progress: `POSTMARK_*` mapping pending) · **DoD variant:** Laravel-only in practice (gate is Pest; see *Test evidence*) · **Epic:** 1 · **Covers:** X-04, O-05, O-07, A-17 (config part), FR57 · **Gate:** Pest · **After:** 1.1a

## Acceptance criteria (epics.md §1.3)
1. **Given** production with an http `PUBLIC_SITE_URL`, **then** mutations return `503 PUBLIC_SITE_URL_REQUIRED` and auth returns `503 AUTH_UNAVAILABLE`.
2. **Given** the runtime and migrate DB users are equal, **then** boot fails in production.
3. (architecture §5, Config) Every env var is read only in `config/*.php`.

## Inventory scope
X-04 (canonical origin), O-05 (proxy preflight), O-07 (env vars), A-17 (the production fail-closed `AUTH_UNAVAILABLE` part only; the JSON-only / 8 KiB / generic-error wrapper is story 1.6), FR57.

## Next.js source read
- `apps/web/src/lib/request-origin.ts` (whole file)
- `apps/web/src/lib/auth/proxy-config.mjs`, `src/lib/auth/client-address.ts`, `src/lib/auth/http.ts`
- `apps/web/scripts/auth-proxy-preflight.mjs`
- `apps/web/src/lib/database-target.ts` + `database-target.test.ts`, `src/lib/prisma.ts`, `prisma.config.ts`, `scripts/bootstrap-admin.mjs` (callers)
- `apps/web/src/lib/stripe-price-allowlist.ts` (price IDs: hard-coded constants, not env)
- `grep process.env` over `apps/web/src`, `scripts`, `prisma.config.ts` (O-07 list)
- Docs: `brownfield/auth-and-security.md` §4, §5, §7 and the 0.7a corrections; `brownfield/data-model-and-ops.md` §2, §4, §5; `brownfield/business-rules-and-notifications.md` (CTA/branding origin); `architecture.md` §4.1, §4.2, §5, §6; ADR-008, ADR-010, ADR-013; `reports/readiness-report.md` row "Run mode"; `prd.md` FR57.
- Parity tests: `grep -rn "X-04\|O-05\|O-07\|A-17" tests/parity/journeys` → only `contract/auth-session.spec.ts` (A-17 wrapper cases: INVALID_JSON, PAYLOAD_TOO_LARGE, AUTH_FAILED, headers). None exercise `PUBLIC_SITE_URL_REQUIRED` or `AUTH_UNAVAILABLE` (production-only; the readiness report says these are Pest/L9 only).

## Behaviour notes (written before converting)

### X-04 canonical origin (`request-origin.ts:115-141`, `getSecuritySensitivePublicOrigin`)
- Reads **only** `PUBLIC_SITE_URL` (the `NEXT_PUBLIC_SITE_URL` fallback at `:21` applies only to the non-security `getConfiguredPublicSiteOrigin`/`getPublicSiteOrigin`).
- Set (non-empty): must parse as a URL, protocol `http:`/`https:`, no username, no password; otherwise throw `PublicSiteConfigurationError` (`code = "PUBLIC_SITE_URL_REQUIRED"`, message "A valid canonical PUBLIC_SITE_URL is required for security-sensitive redirects.", `:1-8`). The result is the URL's **origin** (path, query, fragment dropped; host lowercased; default port dropped).
- Valid: returned when `NODE_ENV !== "production"` **or** the protocol is `https:` (`:130`); an http URL in production throws.
- Not set: non-production only: no request → `"http://localhost:3000"` (`:135`); with a request → the request URL's origin if the protocol is http(s) and the hostname is exactly `localhost`, `127.0.0.1` or `[::1]` (`isSafeLocalOrigin`, `:52-57`). Anything else (including production) throws.
- Production never looks at the request, `Host` or forwarded headers.

### Mutation response (`request-origin.ts:91-106`, `rejectUntrustedMutationOrigin`)
- Canonical origin throws → `503 {"error":{"code":"PUBLIC_SITE_URL_REQUIRED","message":"Request validation is temporarily unavailable."}}` via plain `Response.json` (**no** `Cache-Control: no-store`; 0.7a correction 2).
- Otherwise the provenance check (Origin/Referer) → `403 INVALID_ORIGIN` "Request origin is not allowed." — **story 1.4**, not this story.

### A-17 production fail-closed (`auth/http.ts:14-17`, `proxy-config.mjs`, `client-address.ts`)
- `authProxyUnavailable`: `NODE_ENV !== "production"` → pass. Else if `trustedClientAddress(req.headers)` is null → `503 {"error":{"code":"AUTH_UNAVAILABLE","message":"Authentication is temporarily unavailable."}}` through `authJson` (`Cache-Control: no-store`; the `Referrer-Policy: no-referrer` it sets is overridden on the wire by the global header to `strict-origin-when-cross-origin`, 0.7a correction 1).
- Order in `authMutation` (`:18-22`): proxy check **first**, then the origin guard, then content type / body. So in production with an http `PUBLIC_SITE_URL` **and** no usable proxy config, an auth mutation answers `AUTH_UNAVAILABLE` while every other guarded mutation answers `PUBLIC_SITE_URL_REQUIRED`. With a valid proxy and address, an auth mutation falls through to `PUBLIC_SITE_URL_REQUIRED`. (Logout reverses the order: origin first, then proxy; story 4.x wires that.)
- `configuredAuthProxy(env)` (`proxy-config.mjs:4-14`): `header = AUTH_CLIENT_IP_HEADER?.trim().toLowerCase()`, `hops = AUTH_TRUSTED_PROXY_HOPS?.trim()`. Both truthy or both falsy → `null`. Header must match `/^[a-z][a-z0-9-]*$/` and not be one of `host, origin, referer, cookie, authorization` → `{header}`, else `null`. Hops must match `/^[1-9]\d?$/` (1–99) → `{hops: Number}`, else `null`.
- `trustedClientAddress` (`client-address.ts:15-29`): no config → null. Header mode: `headers.get(header).trim()` must be a single IP (`isIP`). Hops mode: split `x-forwarded-for` on `,`, trim each, take `chain[len - hops]` when `len >= hops`, must be an IP. (`Headers.get` joins repeated headers with `", "`.) The full case table is story 1.5.

### O-05 preflight (`scripts/auth-proxy-preflight.mjs`)
- When `--production` is passed or `NODE_ENV=production`, and `configuredAuthProxy(process.env)` is null: print `Auth proxy preflight failed: set exactly one valid AUTH_CLIENT_IP_HEADER or AUTH_TRUSTED_PROXY_HOPS` to stderr, exit code 1. Otherwise exit 0 silently. It runs before `next start` (`npm start`); direct starts bypass it, which is why the per-request check exists.

### DB role pair (`database-target.ts`)
- `validatePostgresTarget(value, label)`: fails with `"<label>: expected an explicit non-Supabase PostgreSQL target with user, password, host and database; connection routing overrides are forbidden"` (never includes credentials) unless: protocol `postgresql:`/`postgres:`; host non-empty after lowercasing and stripping one trailing dot, not containing `supabase`, no whitespace `/ , \ %`, no fragment; user and password non-empty; database matches `^[A-Za-z0-9_][A-Za-z0-9_-]*$`; at most one `schema` param and only `public`; no query key in `host, hostaddr, port, user, password, dbname, database, service, servicefile, options, sslpassword` (case-insensitive). Port defaults to `5432`.
- `validateDatabaseTargets`: runtime (`DATABASE_URL`) vs migration (`DIRECT_URL`) must have the same host, port and database (`"DATABASE_URL and DIRECT_URL must target the same explicit host, port and database; hostname aliases are not inferred"`) and **different users** (`"DATABASE_URL and DIRECT_URL require distinct runtime and migration roles"`).
- Callers: `prisma.config.ts` (migrations), `bootstrap-admin.mjs`; `prisma.ts` validates the runtime target alone at client creation. There is no NODE_ENV gate in Next; Laravel's AC gates the boot failure on production.

### O-07 env vars (from `grep process.env`)
Runtime: `DATABASE_URL`, `DIRECT_URL`, `BETTER_AUTH_SECRET`, `PUBLIC_SITE_URL` (+ `NEXT_PUBLIC_SITE_URL`), `PUBLIC_MARKETING_SITE_URL` (+ `NEXT_PUBLIC_MARKETING_SITE_URL`), `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `POSTMARK_SERVER_TOKEN`, `POSTMARK_FROM`, `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_CONCEPTS_BUCKET`, `R2_FINAL_DELIVERABLES_BUCKET`, `R2_JURISDICTION`, `R2_ENDPOINT` (test seam), `ADMIN_NOTIFICATION_EMAILS`, `EMAIL_LOGO_URL`, `AUTH_CLIENT_IP_HEADER`, `AUTH_TRUSTED_PROXY_HOPS`, `NODE_ENV`. Dev/test only (replaced by Docker + `parity:seed`): `LOCAL_DEV_*`, `PG_*`, `POSTGRES_TEST_*`, `RUN_PG_INTEGRATION`, `AUTH_BROWSER_FIXTURE`, `PARITY_RUNTIME_DATABASE_URL`, `CAPTURE`, `PORT`, `HOME`, `PATH`.

### Price IDs
`stripe-price-allowlist.ts` hard-codes the three package and three upsell price IDs (no env var); `isPlaceholderPriceId` (empty or containing `REPLACE`) feeds the admin status check. Nothing to validate until the allowlist is ported (story 5.1, K-01).

## Laravel implementation
All under `apps/portal/`. No product routes; `bootstrap/app.php` is untouched (1.6 coordination).

| Behaviour | Where |
|---|---|
| O-07 env vars, read only in config | `config/portal.php` (`PUBLIC_SITE_URL`, `PUBLIC_MARKETING_SITE_URL`, `AUTH_CLIENT_IP_HEADER`, `AUTH_TRUSTED_PROXY_HOPS`, `ADMIN_NOTIFICATION_EMAILS`, `EMAIL_LOGO_URL`, `R2_*`); `config/services.php:21-25` (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`); `.env.example` (documented, empty). Existing mappings kept: `DB_*`/`DB_MIGRATE_*`, `APP_KEY`, `POSTMARK_API_KEY` + `MAIL_FROM_ADDRESS`, `APP_ENV`. Enforced by Larastan's `noEnvCallsOutsideOfConfig` (on by default) plus a Pest scan |
| X-04 canonical origin | `app/Domain/CanonicalOrigin.php` (`resolve()`, `parse()`), exception `app/Domain/PublicSiteUrlRequired.php` |
| 503 `PUBLIC_SITE_URL_REQUIRED` on mutations | `app/Http/Middleware/RequireCanonicalOrigin.php` (skips safe methods; stores the origin in request attribute `canonical_origin` for 1.4's provenance check) |
| A-17 proxy config | `app/Support/AuthProxyConfig.php` (`from()`, `fromConfig()`, `PREFLIGHT_FAILURE`) |
| Trusted address (minimal, for fail-closed) | `app/Support/ClientAddress.php` (`trusted()`; 1.5 ports the full case table) |
| 503 `AUTH_UNAVAILABLE` on auth in production | `app/Http/Middleware/EnsureAuthAvailable.php` (to sit before `RequireCanonicalOrigin` on auth routes) |
| O-05 preflight | `app/Console/Commands/ProxyPreflight.php`: `php artisan proxy:preflight [--production]`, exit 1 with the Next message |
| DB role pair, production boot failure | `app/Support/DatabaseRoles.php` (port of `database-target.ts` onto resolved connection arrays), `app/Support/InvalidConfiguration.php`, `app/Providers/ConfigValidationServiceProvider.php`, registered in `bootstrap/providers.php` |
| Error codes | `app/Support/ErrorCodes.php` (`PUBLIC_SITE_URL_REQUIRED`, `AUTH_UNAVAILABLE`) |

Error bodies use the legacy shape `{"error":{"code","message"}}` built inline in the two middleware (no renderer yet; 1.6 owns it).

## Deviations from Next.js
| Behaviour | Next.js | Laravel | Why | Decision ref |
|---|---|---|---|---|
| Production gate | `NODE_ENV=production` | `APP_ENV=production` (`app()->isProduction()`) | Planned env mapping | `brownfield/data-model-and-ops.md` §4 |
| Dev default origin with no request | `http://localhost:3000` | APP_URL origin when loopback, else `http://localhost:3000` | Laravel dev runs on :8080; dev-only, not parity-observable | proposed (below) |
| URL parsing | WHATWG `new URL` | `parse_url` plus a stricter check: whitespace/control/backslash anywhere, non-`scheme://` forms (`https:host`) and odd hosts are rejected | Fail closed on operator config; never affects a sane URL | proposed (below) |
| Preflight scope | Proxy config only | Proxy config **and** an https `PUBLIC_SITE_URL` | FR57 names both | proposed (below) |
| Preflight wiring | `npm start` runs it | An artisan command for the Forge deploy script (before activation); PHP-FPM has no "start" | Platform | O-05 / architecture §6 `ProxyPreflight` |
| DB role check timing | Migrations/admin bootstrap (no env gate) | Every production boot (HTTP and artisan, so also `migrate`, `config:cache`) | Story AC 2 | epics.md §1.3 |
| DB role check inputs | `DATABASE_URL`/`DIRECT_URL` | Resolved `pgsql`/`pgsql_migrate` arrays (`DB_*` keys or `DB_URL`/`DB_MIGRATE_URL`); also forbids Laravel routing keys (`username`, `search_path`, `driver`, `url`) in the URL query, and a non-`public` `search_path` | Laravel config shape | ADR-013 |
| `NEXT_PUBLIC_SITE_URL` fallback | Used by non-security origin helpers only | Not ported | No `NEXT_PUBLIC_*` in Laravel; the security path never read it | none needed |

None of these is visible to the parity suite.

## Tests
| Layer | Test file / title | Inventory IDs |
|---|---|---|
| L1 Pest unit | `tests/Unit/CanonicalOriginTest.php`: 8 tests, 25 cases (origin normalisation, http only outside production, malformed/credentialed refused, loopback request fallback, no Host/forwarded headers in production, dev default) | X-04 |
| L1 Pest unit | `tests/Unit/AuthProxyConfigTest.php`: exactly-one rule, header regex and denylist, hops 1–99; minimal address derivation | A-17, O-05 |
| L1 Pest unit | `tests/Unit/DatabaseRolesTest.php`: every `database-target.test.ts` case ported (19 bad targets, 5 mismatches, no secret leak, alias normalisation) plus Laravel keys | ADR-013, FR57 |
| L2 Pest feature | `tests/Feature/ConfigFailClosedTest.php`: test-only routes; AC 1 for POST/PUT/PATCH/DELETE; unset/malformed URL in production; safe methods pass; https passes; AUTH_UNAVAILABLE for missing proxy (with http URL; the same request to a non-auth mutation gets PUBLIC_SITE_URL_REQUIRED), bad/missing address, both/invalid settings; order proxy → origin; hops mode; never outside production | X-04, A-17, FR57 |
| L2 Pest feature | `tests/Feature/ConfigBootValidationTest.php`: AC 2 via the provider and via a **real `php artisan` production process** (fails, message present, password absent; the valid pair boots); preflight pass/fail matrix; env-only-in-config scan | O-05, O-07, ADR-013 |

Test-port ledger rows resolved: `database-target.test.ts` (all cases), `proxy-config` behaviour via `AuthProxyConfigTest`. `client-address.test.ts` stays with 1.5.

## Test evidence
- `COMPOSE_PROJECT_NAME=lf-1-3 … docker compose up -d --build` then `bin/test`: Pint ✓ (46 files), Larastan level 9 **No errors**, Pest **126 passed (230 assertions)**, 0 failed, 0 skipped (5 of them from 1.1a).
- Spot check: Symfony renders `Cache-Control: no-store` as `no-store, private` (see Gotchas).

**Not run, and why:**
- Parity against Laravel: no parity test selects `PUBLIC_SITE_URL_REQUIRED` or `AUTH_UNAVAILABLE` (production-only, so Pest/L9 per the readiness report), and the A-17 wrapper tests in `contract/auth-session.spec.ts` need the real auth endpoints (Epic 4) and the 1.6 wrapper.
- Parity against Next: not needed; `apps/web` is unchanged.

## Gotchas
- **Symfony appends `, private` to any `Cache-Control` without `public`/`private`** (`ResponseHeaderBag::computeCacheControlValue`). `AUTH_UNAVAILABLE` therefore goes out as `no-store, private`, while `contract/auth-session.spec.ts` expects exactly `no-store` on auth responses. Story 1.6 (headers) must set the raw value (e.g. in `SecurityHeaders`/`AuthJsonBoundary` after the bag is computed). → propose for `apps/portal/AGENTS.md`.
- `env()` turns `"null"`, `"empty"`, `"true"`/`"false"` into PHP values. `AuthProxyConfig` treats a non-string as unset, so `AUTH_CLIENT_IP_HEADER=true` means "no config" (fail closed).
- PHP's `$` matches before a trailing newline; the ported regexes use `/D`.
- `app()->detectEnvironment(fn () => 'production')` inside a test flips `isProduction()` for that test only; the boot provider then has to be called by hand. The real boot failure is proven with a child `php artisan about` (process env beats `.env`, Dotenv is immutable).
- Symfony `Request::getHost()` keeps IPv6 brackets (`[::1]`) and throws `SuspiciousOperationException` on a bad Host; `CanonicalOrigin` catches it (→ refused).

## Docs updated
Story record only (this file). Tracking files are the parent's (see below).

### Proposed inventory status (for the parent)
- **X-04:** Laravel `Domain/CanonicalOrigin.php`, `Middleware/RequireCanonicalOrigin.php`; Tests `Unit/CanonicalOriginTest.php`, `Feature/ConfigFailClosedTest.php`; status **Verified** (Pest; production-only, no parity test).
- **O-05:** Laravel `Console/Commands/ProxyPreflight.php`; Tests `Feature/ConfigBootValidationTest.php`; **Verified**. Deploy-script wiring → Epic 9 (Forge).
- **O-07:** Laravel `config/portal.php`, `config/services.php`, `.env.example`; Tests env scan + Larastan; **Verified** for the env→config mapping (consumers land with their stories).
- **A-17:** Laravel (config part) `Support/AuthProxyConfig.php`, `Middleware/EnsureAuthAvailable.php`; Tests `Unit/AuthProxyConfigTest.php`, `Feature/ConfigFailClosedTest.php`; status **In progress** (the JSON wrapper is 1.6; auth routes Epic 4).

### Proposed decisions / assumptions (for DECISIONS.md / ASSUMPTIONS.md)
- DECISION: production DB role-pair validation runs on every boot (fails HTTP and artisan); PUBLIC_SITE_URL and proxy config fail closed per request plus `proxy:preflight` in deploy, not at boot (so mutations can still answer 503 as in Next).
- DECISION: `proxy:preflight` also requires an https `PUBLIC_SITE_URL` (FR57).
- DECISION: price-ID validation deferred to story 5.1 (K-01): in Next they are hard-coded constants, not env, and the allowlist isn't ported yet.
- ASSUMPTION: AC 1's "auth returns 503 AUTH_UNAVAILABLE" is read as Next's order (proxy check first): auth answers AUTH_UNAVAILABLE when no trusted address can be derived; with a valid proxy, an auth mutation with an http URL answers PUBLIC_SITE_URL_REQUIRED like any mutation. Both are tested.

### Proposed `apps/portal/AGENTS.md` promotions
- Env vars only in `config/*.php` (Larastan rule + `ConfigBootValidationTest` scan); new vars also go in `.env.example`.
- Production-only behaviour: test with `app()->detectEnvironment(fn () => 'production')`; prove boot failures with a child `php artisan` process.
- The `Cache-Control` `, private` gotcha above.

## Open items
- **1.4:** add the Origin/Referer provenance check, exemptions and arch test to `RequireCanonicalOrigin` (it already resolves and stores the origin).
- **1.5:** port every `client-address.test.ts` case onto `ClientAddress` (check `filter_var` vs Node `isIP` on IPv6 zone IDs and IPv4 leading zeros) and add the `TrustedClientAddress` middleware.
- **1.6 overlap:** `ErrorCodes.php` is created here (two constants; merge by union). Error JSON is built inline in the two middleware; 1.6 may move it onto its renderer. Exact `Cache-Control: no-store` (Gotchas). This story touches `bootstrap/providers.php` only, not `bootstrap/app.php`.
- **Epic 4:** attach `EnsureAuthAvailable` → `RequireCanonicalOrigin` to the auth mutations and `/api/auth/session` (proxy only); logout reverses the order.
- **Epic 9 (deploy):** run `php artisan proxy:preflight` in the Forge script before activation.
- **5.1:** price-ID allowlist validation (placeholder check).
- Possible follow-up: also check that `pgsql_limits` uses the runtime role (not in Next).
