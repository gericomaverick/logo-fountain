# Story 1.4: Origin guard as the CSRF control

- **Status:** in-progress
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

(filled in below as built)

## Deviations from Next.js

(filled in below)

## Tests

## Test evidence

## Gotchas

## Docs updated

## Open items
