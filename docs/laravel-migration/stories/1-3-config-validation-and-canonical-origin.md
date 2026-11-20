# Story 1.3: Config validation and canonical origin

**Status:** in-progress · **DoD variant:** Laravel-only in practice (gate is Pest; see *Test evidence*) · **Epic:** 1 · **Covers:** X-04, O-05, O-07, A-17 (config part), FR57 · **Gate:** Pest · **After:** 1.1a

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
_(filled in below as the code lands)_

## Deviations from Next.js
_(filled in below)_

## Tests
_(filled in below)_

## Test evidence
_(filled in below)_

## Gotchas
_(filled in below)_

## Docs updated
_(filled in below)_

## Open items
_(filled in below)_
