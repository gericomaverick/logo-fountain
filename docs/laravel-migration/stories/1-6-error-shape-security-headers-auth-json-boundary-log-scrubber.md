# Story 1.6: Error shape, security headers, auth JSON boundary, log scrubber

- **Status:** in-progress
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

(filled in below as built)

## Deviations from Next.js

(filled in below)

## Tests

(filled in below)

## Test evidence

(filled in below)

## Gotchas

(filled in below)

## Docs updated

(filled in below)

## Open items

(filled in below)
