# Story 1.6: Error shape, security headers, auth JSON boundary, log scrubber

- **Status:** review (gate partly blocked: see Test evidence)
- **Covers:** X-02, X-03, X-14, A-17, ADR-027, NFR-S3 · **Gate:** `@contract&@api` (headers and shape) · **After:** 1.1a · **DoD:** Conversion
- **Branch:** `worktree-agent-a451f8f62d93a9b7d` (from `8586e63`)

## Story

As the portal, I return the legacy error envelope, send the legacy security headers on every response, wrap the auth endpoints in the legacy JSON boundary, and never write a secret, token or signed URL to a log.

**Acceptance (epics.md, Story 1.6):** domain exceptions render `{error:{message,code,details?}}`. Headers per X-02. The auth endpoints enforce JSON-only, the streamed 8 KiB cap and generic errors. The log processor redacts tokens, signed URLs and secrets (Pest).

## Inventory scope

IDs: **X-02, X-03, X-14, A-17** (plus ADR-027, NFR-S3).
- X-02: complete here (middleware). The token pages themselves arrive in Epic 4.
- X-03: the envelope and renderer are complete here. Per-endpoint codes and statuses are verified by each endpoint's story.
- X-14: the log half is complete here. The audit half reuses `App\Support\Scrubber` in the `Audit::record` story (2.x). Responses are each endpoint's story.
- A-17: the JSON wrapper half (content type, 8192-byte cap, JSON-object check, generic errors, `no-store`) is here. The production fail-closed `503 AUTH_UNAVAILABLE` half is story 1.3 (config) / 1.5 (trusted client address). The auth endpoints are Epic 4.

## Next.js source read

- `apps/web/next.config.ts` (CSP and the global and token-page headers).
- `apps/web/src/lib/api-error.ts` (`jsonError`).
- `apps/web/src/lib/auth/http.ts` (`authJson`, `authProxyUnavailable`, `authMutation`), `lib/auth/errors.ts` (`AuthFailure`), `lib/auth/require.ts` (`RouteAuthError`, `toRouteErrorResponse`).
- `apps/web/src/app/api/auth/*/route.ts` (all 7 endpoints: which use `authMutation`).
- Logging: every `console.*` call under `src` (`lib/client-invoices.ts:163`, `lib/stripe.ts:23`, `app/api/stripe/webhook/route.ts:74,244,250`, `lib/project-lifecycle-email.ts:114`). **Next has no log scrubber**: it relies on not logging secrets. better-auth's logger is disabled (`lib/auth/server.ts:38`).
- Docs: `brownfield/auth-and-security.md` §2, §4; `brownfield/api-client.md` (bad-JSON rule); `stories/0-7a-*.md` gotcha 1; `research-technical.md` §6.5; `architecture.md` §4.1, §4.2, §5, §6; ADR-027; `prd.md` NFR-S3.
- Parity: `journeys/smoke.spec.ts:8`, `journeys/contract/auth-session.spec.ts:140-182`, `_client-helpers.ts:54` (`expectError`), `_admin-helpers.ts:67`.

## Behaviour notes (written before converting)

### X-02 headers (`next.config.ts`)
On **every** path (`source: "/:path*"`, so pages, `/api/*` and 404s), set by the framework *after* the route, so they **override** a route's own header:
```
Content-Security-Policy-Report-Only: default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; script-src 'self' 'unsafe-inline'[ 'unsafe-eval' in development] https://js.stripe.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; font-src 'self' data:; connect-src 'self' https://api.stripe.com; frame-src https://js.stripe.com https://hooks.stripe.com https://checkout.stripe.com; worker-src 'self' blob:; manifest-src 'self'
X-Frame-Options: DENY
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(self "https://js.stripe.com" "https://checkout.stripe.com"), usb=()
```
On `/auth/callback`, `/set-password`, `/reset-password` (a later entry, so it wins): `Referrer-Policy: no-referrer`, `Cache-Control: no-store`.
No report collector (report-only = browser-console diagnostics). HSTS is not set by the app (edge, research §6.4).

### A-17 auth wrapper (`lib/auth/http.ts`)
- `authJson(body, status)`: headers `Cache-Control: no-store` and `Referrer-Policy: no-referrer`, plus any native `Set-Cookie`. **But** the global next.config `Referrer-Policy` overrides it, so `/api/auth/*` really sends `strict-origin-when-cross-origin` (0.7a gotcha 1; `auth-session.spec.ts:172-182` asserts it). Cache-Control is exactly `no-store`.
- `authMutation` order: (1) production proxy check → `503 {error:{code:"AUTH_UNAVAILABLE",message:"Authentication is temporarily unavailable."}}`; (2) Origin guard; (3) `Content-Type` must match `/^application\/json(?:\s*;|$)/i`, else `400 {error:{code:"INVALID_JSON"}}` (**no message**); (4) stream the body, cancel when the running byte count passes **8192** → `413 {error:{code:"PAYLOAD_TOO_LARGE"}}` (no message; exactly 8192 bytes is accepted); decoded with `TextDecoder` (strips a UTF-8 BOM, invalid bytes become U+FFFD); `JSON.parse`; a non-object (`null`, array, string, number) or a parse error → generic; (5) any throw → `{error:{code, message:"Authentication could not be completed. Check your details or request a new link."}}` with the `AuthFailure` status/code, or `400 AUTH_FAILED`. Never native diagnostics.
- Uses `authMutation`: login, magic-link, magic-link/verify, forgot-password, reset-password, password. Not: `GET session` (proxy check, own `503 SESSION_VERIFICATION_UNAVAILABLE`), `POST logout` (origin then proxy, no body parse, own `503 LOGOUT_FAILED`). Both still respond via `authJson`.
- `RATE_LIMITED` (429) responses also have no message.

### X-03 error envelope (`lib/api-error.ts`)
`jsonError(message, status, details?, code?)` → `{error:{message, ...(code ? {code}) , ...(details !== undefined ? {details})}}`, `Response.json` (no slash escaping). Key order message, code, details. `details` is always an object in practice (`{nextStep: "..."}`). `RouteAuthError(message,status,code,details)` + `toRouteErrorResponse` is the "domain exception → envelope" pattern (e.g. `Unauthorized` 401 `UNAUTHORIZED` `{nextStep:"Sign in and retry."}`). The parity helper `expectError` requires `message` (string) and `code`, and no keys other than message/code/details.

### X-14 / NFR-S3 logs
Next logs objects with ids, emails (`purchaserEmail`), Stripe session/payment-intent ids, error messages. No scrubbing. Laravel adds a Monolog processor (architecture §5, NFR-S3). Things that are secrets in this system: passwords; auth link tokens (in the URL **fragment** `#token=…&next=…`, shape `/^[A-Za-z0-9_-]{20,256}$/`); Stripe secret/restricted keys and webhook secrets; Stripe checkout session ids (`session_id` is a possession token for `/api/checkout/magic-link`, brownfield §6); presigned R2 URLs (`X-Amz-*`); Laravel signed URLs (`signature=`); cookies, `Authorization`, CSRF tokens.

## Laravel implementation

All under `apps/portal/`.
- **X-02** `app/Http/Middleware/SecurityHeaders.php`: the five next.config headers on every response; token pages (`auth/callback`, `set-password`, `reset-password`, case-insensitive) get `Referrer-Policy: no-referrer` + exactly `Cache-Control: no-store`. `APP_ENV=local` adds `'unsafe-eval'` (as `next dev`) and, when Vite is hot, its origin (+ `ws:`) to script/style/img/font/connect-src (ADR-027). Registered with `$middleware->prepend()` in `bootstrap/app.php:18-19` (outermost, so it overrides route values, like next.config). Custom middleware, **not** `spatie/laravel-csp` (research §6.5 recommendation: exact parity, no nonces needed). No new dependency.
- **Exact `no-store`:** `app/Http/RawCacheControlHeaderBag.php`. Symfony turns `no-store` into `no-store, private`; the parity suite asserts `no-store`. `noStore()` swaps in a header bag that keeps a no-store value verbatim (headers and cookies copied).
- **X-03** `app/Support/ApiError.php` (`body()`, `response()`: `{error:{message, code?, details?}}`, empty code omitted, empty details stays `{}`, unescaped slashes/unicode) and `app/Exceptions/ApiException.php` (`message, status, errorCode, details`; `render()` → the envelope; `ShouldntReport`). `app/Support/ErrorCodes.php`: sorted constant list (only the codes this story uses).
- **A-17** `app/Http/Middleware/AuthJsonBoundary.php`, alias `auth.json` (`bootstrap/app.php:21`). Mode `body` (the 6 `authMutation` endpoints): Content-Type regex → `400 {error:{code:INVALID_JSON}}`; declared `Content-Length` > 8192 refused before reading, else reads at most 8193 bytes from the input stream → `413 {error:{code:PAYLOAD_TOO_LARGE}}`; BOM stripped, `JSON_INVALID_UTF8_SUBSTITUTE` (TextDecoder parity), must decode to an object; parsed body via `AuthJsonBoundary::body($request)`. After the route: the routing pipeline has already rendered any exception, so `$response->exception` that isn't an `AuthFailure` → generic `400 AUTH_FAILED`. Mode `headers` (`auth.json:headers`, for GET session and logout): `no-store` only. `AuthJsonBoundary::json()` = `authJson`, `::failure()` = the generic body. `app/Exceptions/AuthFailure.php` = `lib/auth/errors.ts`.
- **X-14** `app/Support/Scrubber.php` (pure, idempotent; reusable by `Audit::record`), `app/Logging/ScrubSensitiveData.php` (Monolog processor: message, context, extra), `app/Logging/ScrubLogs.php` (the `tap`, attaches once). `config/logging.php`: `'tap' => [ScrubLogs::class]` on all 10 channels (the emergency logger ignores taps). Logger-level processors run before handler-level ones, so `{placeholders}` are filled from scrubbed context.

## Deviations from Next.js

| Behaviour | Next.js | Laravel | Why | Decision ref |
|---|---|---|---|---|
| Log scrubbing | none (relies on not logging secrets) | Monolog processor redacts sensitive keys, tokens, signed-URL queries, masks emails | NFR-S3 / architecture §5 | NFR-S3 (no DV: logs are not observable by the parity suite) |
| Exceptions in logs | `console.error(error.message)` ad hoc | reported exceptions are logged as a scrubbed `{class,message,code,file,trace(no args),previous}` array | the Throwable message can carry URLs/emails | proposed decision (below) |
| Local CSP | `'unsafe-eval'` in `next dev` | `'unsafe-eval'` + the Vite dev origin when `APP_ENV=local` | ADR-027 | ADR-027 |
| `Content-Length` over 8192 | stream cancelled after 8192 bytes | refused before reading | same status and body; less work | none needed |

## Tests

| Layer | Test file / title | Inventory IDs |
|---|---|---|
| L1 Pest unit | `tests/Unit/ScrubberTest.php` (11: presigned R2 URL, Laravel signed URL, `#token=` auth links, `session_id`, Bearer/Basic, `sk_`/`rk_`/`whsec_`/`cs_`, JWT, kept ids, email masking, sensitive keys at depth, exceptions, idempotence) | X-14 |
| L2 Pest feature | `tests/Feature/SecurityHeadersTest.php` (8 cases: exact CSP, local `unsafe-eval`, pages/`/up`/404/API, overriding a route's Referrer-Policy, 3 token pages incl. cookie kept, default caching elsewhere) | X-02 |
| L2 Pest feature | `tests/Feature/ApiErrorTest.php` (5: exact bytes, omitted code/details, `{}` details + unescaped, non-API route, not logged) | X-03 |
| L2 Pest feature | `tests/Feature/AuthJsonBoundaryTest.php` (26 cases incl. datasets: mirrors `auth-session.spec.ts:140-182` on test routes: CT, 8192/8193, Content-Length, 8 malformed bodies, BOM/UTF-8, AuthFailure, native exception hidden, own 429 kept, headers mode, Set-Cookie kept) | A-17 |
| L2 Pest feature | `tests/Feature/LogScrubberTest.php` (4: every channel tapped, stack, file output with placeholders, a reported exception) | X-14 |
| Parity | `journeys/smoke.spec.ts:8` X-02 (see evidence) | X-02 |

Test-port ledger rows resolved: none (no Vitest suite exists for these Next modules).

## Test evidence

- `COMPOSE_PROJECT_NAME=lf-1-6 … bin/test` (2026-11-20): Pint pass, Larastan level 9 `[OK] No errors`, **Pest 59 passed (317 assertions)**, 0 failed.
- Parity against Laravel (`PARITY_TARGET=laravel PARITY_BASE_URL=http://127.0.0.1:18086 npx playwright test journeys/smoke.spec.ts`): **0 passed, 2 failed.**
  - `X-02 pages carry the security headers`: fails at its first line, `expect(response.ok())`, because `GET /login` is 404 (the login page is Epic 4). The header assertions themselves hold: `curl -D - /login` (404) and `/` (200) both send `X-Frame-Options: DENY`, `nosniff`, `strict-origin-when-cross-origin`, the Permissions-Policy and a report-only CSP with `frame-ancestors 'none'`.
  - `A-15 root sends an anonymous visitor to sign-in` (`@ui`): out of scope (Epic 4/6 routing).
- **Not run, and why:** `contract/auth-session.spec.ts` A-17 tests (lines 140-182) and `auth-links.spec.ts` no-store checks need `/api/auth/*` (Epic 4) plus seeding; `client-*.spec.ts` / `admin-*.spec.ts` `expectError` (X-03) need their endpoints (Epics 5-7). Their behaviour is mirrored in Pest on test routes. Parity against Next not re-run (no Next or suite change).

## Gotchas

1. **Symfony appends `, private` to `Cache-Control: no-store`**, and `ResponseHeaderBag::hasCacheControlDirective()` reads the *previous computed* value, so an override must check `$this->cacheControl`. Use `RawCacheControlHeaderBag::noStore()` (or `AuthJsonBoundary::json()`) wherever Next sends `no-store`. *(Promote to AGENTS.md.)*
2. **A middleware can't try/catch the route's exceptions:** `Illuminate\Routing\Pipeline` renders and reports them inside `$next()`. Inspect `$response->exception` instead. *(Promote.)*
3. On `/api/auth/*` the wire `Referrer-Policy` is `strict-origin-when-cross-origin`, not `no-referrer` (next.config overrides `authJson`; 0.7a gotcha 1). The boundary therefore doesn't set it. Inventory A-17's "no-referrer" wording is inaccurate.
4. Laravel's emergency logger ignores `tap`.
5. `Bearer` is matched only with an 8+ character credential, and `Basic` only with base64 that has a digit, `+`, `/` or `=`, to keep prose such as "Basic information".

## Docs updated

The story record only (shared tracking files are the parent's job; see Proposed items).

## Proposed items for the parent to log

- **Inventory:** X-02 → `Pest ✓ (SecurityHeadersTest); parity smoke:8 blocked on /login (Epic 4)`, status *In progress*. X-03 → envelope done (`ApiErrorTest`), per-endpoint verification in Epics 4-7. X-14 → logs done (`ScrubberTest`, `LogScrubberTest`), audit half in the `Audit::record` story. A-17 → wrapper done (`AuthJsonBoundaryTest`); `AUTH_UNAVAILABLE` is 1.3/1.5; fix the wording "no-store and no-referrer" → "no-store (the Referrer-Policy on the wire is the site policy)".
- **DECISIONS:** (1) CSP via custom middleware, not spatie/laravel-csp (exact parity, no nonce needed; revisit if CSP becomes enforcing). (2) Logs mask emails to first char + domain. (3) Reported exceptions are logged as scrubbed arrays without frame arguments.
- **RISKS:** PHP-FPM buffers the whole request body before Laravel runs, so the 8 KiB cap protects the app, not FPM memory. Mitigate with nginx `client_max_body_size` on `/api/auth/` (story 9.x / 1.1b). Also `X-Powered-By: PHP/8.5.13` and `Server: nginx/1.28.3` are exposed (set `expose_php=Off`, `server_tokens off`).
- **AGENTS.md promotions:** gotchas 1 and 2; "throw `ApiException` (never build error JSON by hand); auth routes use `auth.json` after the proxy check and origin guard".
- **converted-tags.txt:** nothing yet (no gate fully green on Laravel).

## Open items

- Route wiring order for auth endpoints: proxy check (1.3/1.5) → origin guard (1.4) → `auth.json`: Epic 4 (4.x auth endpoints).
- Framework-rendered errors on `api/*` (unknown route 404, 405, 500) still use Laravel's `{"message": ...}`; Next sends its own HTML 404/500 there. Decide in 1.3/Epic 4 whether to map them to the envelope.
- Re-run `smoke.spec.ts:8` on Laravel once `/login` exists (Epic 4); then add `@smoke&@security` to `converted-tags.txt`.
- `Audit::record` must call `Scrubber::scrub()` on payloads (2.x).
