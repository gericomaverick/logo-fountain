# Brownfield: authentication, identity and request security (as built in `apps/web`)

Phase 0 capture, 2026-11-18, read from source. Paths are relative to `apps/web/src/`. This is the behaviour Laravel must reproduce for inventory rows **A-01…A-16, X-01…X-06, X-14, N-01…N-03**. Constants are quoted exactly.

## 1. Identity model

- `AuthUser` (id UUID, unique lowercase `email`, `emailVerified`, `credentialVersion` int default 0). `Profile.id` **equals** `AuthUser.id` (`onDelete: Restrict`).
- Password credential = an `AuthAccount` row with `providerId = "credential"` and a non-null `password` (scrypt hash from Better Auth). Laravel uses its own hasher (bcrypt or argon2). There's no data, so no hash compatibility is needed.
- **Sign-up is disabled.** Accounts are created only by checkout fulfilment (`lib/checkout-fulfillment.ts#ensureAccessProvisioning`), never by a public endpoint.
- **A session is valid only if** the session row exists **and** `user.emailVerified` is true **and** `now < session.createdAt + 7 days` (`SESSION_SECONDS = 604800`). The cap is absolute: `disableSessionRefresh: true`, cookie cache disabled, and every request reads the DB (`lib/auth/service.ts#sessionFromHeaders`).
  - Laravel: the database session driver plus middleware that rejects sessions older than 7 days from **creation** (store `created_at` in the session row or payload; Laravel's `lifetime` slides, so it can't do this alone). It must also reject a user whose email isn't verified.
- **Admin** = `emailVerified` **and** `Profile.isAdmin` (`lib/auth/admin.ts`). There is no env-based admin.

## 2. Mailbox-proof links (setup, reset, magic)

| Kind | Issued by | Link format (token in the URL **fragment**, never the query) | Lifetime | Consumed by |
|---|---|---|---|---|
| `setup` | checkout fulfilment (first purchase, no password yet) | `{PUBLIC_SITE_URL}/set-password#token=…&next=…` | 3600 s | `POST /api/auth/reset-password` |
| `reset` | `POST /api/auth/forgot-password` | `{PUBLIC_SITE_URL}/reset-password#token=…&next=…` | 3600 s | `POST /api/auth/reset-password` |
| `magic` | `POST /api/auth/magic-link`, checkout continue/resend, setup when a password already exists | `{PUBLIC_SITE_URL}/auth/callback#token=…&next=…` | 3600 s | `POST /api/auth/magic-link/verify` |

- Every issued token gets an `AuthProof` row: `tokenHash` = sha256 hex of the token, `userId`, `kind`, `credentialVersion` at the moment of issue, `expiresAt` = now + 1 h. **A proof is valid only if** the row exists, the kind matches, it hasn't expired, and `proof.credentialVersion == user.credentialVersion`. So any credential change kills every outstanding link.
- Token shape check before any DB work: `/^[A-Za-z0-9_-]{20,256}$/`.
- The client pages read the fragment and then **remove it from the address bar** (`history.replaceState`) before rendering (`lib/auth/client.ts#takeMailboxProof`). Tokens therefore never reach server logs or Referer headers.
- `/auth/callback` **asks for a button click** ("Confirm sign-in") before posting the token. Email link scanners can't burn single-use links by prefetching. Keep this in Laravel.
- **Setup degrades to magic:** under the per-user fence, if the user already has a password credential, a `setup` request issues a `magic` link instead. Setup can never reset an existing password.
- `next` always passes through `safeAuthNextPath` (§6). The default is `/dashboard`. Checkout links use `next=/project/{projectId}`.

### Issue protocol (`lib/auth/service.ts#requestAuthLink`)
1. Normalise the email (trim, lowercase). If there's no user, return `null` (callers keep their responses uniform).
2. Inside `withCredentialFence(userId)`: write the proof and **queue** exactly one email in memory.
3. If the queue doesn't hold exactly one message, throw. Better Auth swallows callback errors, and a silent "sent" is forbidden.
4. **After commit:** send through Postmark (10 s timeout). On failure, **delete the proof** (so the link is dead) and throw a fixed error with no link and no provider body.
- Laravel: write the proof inside `DB::transaction` with the advisory lock, then send **after commit** (synchronously, or a queued mailable with `afterCommit`). On send failure, delete the proof. **Never** log or echo the link or the provider response body.

## 3. Credential fence

`lib/auth/fence.ts`: one PG transaction that takes `SELECT pg_advisory_xact_lock(hashtextextended('auth:' || userId, 0))` and runs **every** auth operation on that same transaction (timeout 20 s, maxWait 5 s). Login, link issue, reset, magic verify and password change all run inside it. It serialises reset/reset, reset/change and login/change races. Laravel: the same SQL inside `DB::transaction`, with every query on that connection.

## 4. Endpoints

All auth endpoints respond through `authJson`: headers `Cache-Control: no-store` and `Referrer-Policy: no-referrer`, plus any `Set-Cookie` from the native call.

**Common mutation wrapper** (`lib/auth/http.ts#authMutation`), in this order:
1. **Production proxy check:** if `NODE_ENV=production` and no trusted client address can be derived (§7), return `503 {error:{code:"AUTH_UNAVAILABLE"}}`. This fails closed on every request.
2. Origin guard (§5): `403 INVALID_ORIGIN` / `503 PUBLIC_SITE_URL_REQUIRED`.
3. `Content-Type` must match `application/json` → otherwise `400 INVALID_JSON`.
4. Body read in a stream with an **8192-byte cap** → `413 PAYLOAD_TOO_LARGE`. Must be a JSON object.
5. Any thrown error returns `{error:{code, message:"Authentication could not be completed. Check your details or request a new link."}}`, with the `AuthFailure` status and code, or `400 AUTH_FAILED`. Never native diagnostics.

| Endpoint | Behaviour |
|---|---|
| `GET /api/auth/session` | Proxy check. `{authenticated:false}` if there's no valid session. `{authenticated:true,userId,email,isAdmin}`. Any exception → `503 SESSION_VERIFICATION_UNAVAILABLE` "Could not verify session. Please retry." |
| `POST /api/auth/login` `{email,password}` | Email normalised. Empty values or password > **72 bytes** → `400 INVALID_CREDENTIALS` ("Email or password is incorrect, or mailbox verification is required."). Rate limit reserved first (§8). Wrong password, unknown account, unverified mailbox and rate-limited all get the **identical** 400. On success, clear the failure bucket, return `{ok:true}` and set the session cookie. Runs under the fence when the user exists |
| `POST /api/auth/logout` | Origin guard **first**, then the proxy check (the order differs from the wrapper). Sign out → `{ok:true}`. Failure → `503 LOGOUT_FAILED` "Could not sign out. Please retry." |
| `POST /api/auth/password` `{currentPassword,newPassword}` | No session → `401 UNAUTHORIZED`. Per-user limit → `429 RATE_LIMITED`. Rejected if the current password is empty, the new one equals the current one, or the new one is invalid (§9) → `400 INVALID_PASSWORD_CHANGE`. Under the fence: re-read the **same** session ID and re-check validity, verify the current password (wrong → `400 CURRENT_PASSWORD_INVALID`), update it, then **delete all sessions including the current one**, delete all proofs, `credentialVersion++`, audit `auth.password_changed {method:"settings"}`. Response `{ok:true,signedOut:true}` and the cookie is cleared |
| `POST /api/auth/magic-link` `{email,next}` | If the email contains `@` and the limit allows, issue a magic link. Every outcome returns `{ok:true,message:"If that account exists, a sign-in link has been sent."}` |
| `POST /api/auth/magic-link/verify` `{token}` | Limit (keyed by token) → `429`. Under the fence: valid `magic` proof (§2), create the session, **delete only that proof**. Sets the cookie and returns `{ok:true}`. The client then navigates to the safe `next` |
| `POST /api/auth/forgot-password` `{email}` | No `@` → `400 INVALID_EMAIL` "Enter a valid email address.". Otherwise, if the limit allows, issue a `reset` link (`next=/dashboard`). Always returns `{ok:true,message:"If that account exists, a password recovery email has been sent."}` |
| `POST /api/auth/reset-password` `{token,newPassword}` | Limit → `429`. Invalid password → `400 WEAK_PASSWORD`. Under the fence: proof of kind `reset` or `setup`, valid (§2). Set the password, `emailVerified=true`, `credentialVersion++`, **delete all of that user's proofs and sessions**, audit `auth.password_reset {method: proof.kind}`. **No session is created.** The user signs in afterwards. `{ok:true}` |

**There is no native catch-all auth handler mounted** (no `api/auth/native` route exists). Laravel must likewise expose **only** these endpoints: no Fortify, Breeze or Jetstream default routes.

## 5. Mutation Origin guard (`lib/request-origin.ts`)

Applied to **29 route files / 30 endpoints** (verified by `origin-guard.spec.ts`, story 0.7d; includes the 6 `authMutation` auth endpoints and brief/draft PUT and DELETE) (every cookie-authenticated mutation). It runs **before** auth, body parsing and I/O.
- Canonical origin = `getSecuritySensitivePublicOrigin()`:
  - `PUBLIC_SITE_URL` set: it must parse, be http(s) and have no credentials, otherwise 503. In production it **must be https**, otherwise 503.
  - Not set: in non-production, the request's own origin, but only if it's loopback (`localhost`, `127.0.0.1`, `[::1]`). Default `http://localhost:3000` when there's no request. In production, not set → 503 `PUBLIC_SITE_URL_REQUIRED` ("Request validation is temporarily unavailable.").
- If an `Origin` header is present (even empty or `null`), it must equal its own parsed `.origin` **and** the canonical origin. A Referer never rescues a failed Origin.
- If `Origin` is absent, the `Referer` must have no control characters or backslash, start with `canonical + "/"`, have the canonical origin, and have no credentials and **no fragment**.
- Failure → `403 {error:{code:"INVALID_ORIGIN",message:"Request origin is not allowed."}}`.
- **Exempt** (no guard): `POST /api/stripe/webhook`, `POST /api/checkout/magic-link`, `POST /api/checkout/resend-magic-link`, `GET /checkout/start`, all GETs, health.
- Laravel: a dedicated middleware, **not** CSRF tokens alone. Decide in architecture whether to also keep Laravel's CSRF (with Inertia that's XSRF-TOKEN). Keeping both is fine, but the Origin rules and their exact codes must hold.

## 6. Safe `next` (`lib/auth/safe-next.ts`)

Accept only when the path part (before `?`/`#`) starts with `/`, not `//`, has no `\` and no control characters. Then decode repeatedly (bounded by length) while the decoded value still contains `%`. Each decoded layer must keep the safe shape. Stop when no `%2f %5c %0x %1x %7f %25` remains. Any decode error → fallback. On success return the **original** raw value (query and fragment kept). Fallback is `/dashboard`. Port it verbatim, with its test cases (`safe-next.test.ts`).

## 7. Trusted client address (`lib/auth/client-address.ts`, `proxy-config.mjs`)

Exactly one of these may be set:
- `AUTH_CLIENT_IP_HEADER`: lowercase, must match `^[a-z][a-z0-9-]*$`, and must not be `host`, `origin`, `referer`, `cookie` or `authorization`. The value must be a **single** valid IP.
- `AUTH_TRUSTED_PROXY_HOPS`: `^[1-9]\d?$`. Take the n-th entry from the right of `X-Forwarded-For`, which must be a valid IP.
Both set, or neither → `null`, and per-address limits are off. In production, `null` → auth routes return 503 `AUTH_UNAVAILABLE`. `scripts/auth-proxy-preflight.mjs` refuses `npm start` without valid config.
Laravel: **don't** use `TrustProxies` with `*`. Implement this exact rule, or configure TrustProxies to match it exactly, and write a test for each case.

## 8. Rate limits (`lib/auth/rate-limit.ts`, the `AuthRateLimit` table)

The shared, atomic PG store: buckets are keyed by sha256 (no clear-text emails, IPs or tokens), the window is **15 min**, counts are capped at 100000, and rows older than 1 h are pruned on each call.
- General auth (`allowAuthAttempt`): scope = request path. Buckets: address (**20**/15 min, only when the address is known) and identity (**5**/15 min). Identity = the lowercase email, token or user ID.
- Login: an address bucket (20) plus a **failure** bucket keyed `login:failures:{email}:{address|unknown-address}` (**5**). It's reserved before the password check and **deleted on success**.
- Checkout auth emails (`lib/checkout-auth-email-rate-limit.ts`, **process-local**): per session ID **3 / 15 min**, per destination email **5 / 60 min**. The quota is consumed before sending (failed sends count). Blocked → `429 RATE_LIMITED` with a `retry-after` header, "Please wait before requesting another sign-in email.". **Laravel uses the ported PG limiter** (ADR-009, not the cache), which closes the residual risk.
- `lib/forgot-password-rate-limit.ts` is **dead code** (nothing imports it). Forgot password uses the general DB limiter. **Don't port it.**

## 9. Password policy (`lib/auth/validation.ts`)

Minimum **8 characters**, maximum **72 bytes** in UTF-8 ("Use at least 8 characters." / "Use 72 characters or fewer."). Client-side form messages: "Enter your email address.", "Enter your password.", "Confirm your password.", "Passwords do not match.", "Enter your current password.", "Choose a password different from your current one.". Laravel with bcrypt has the same 72-byte limit, which is a reason to keep the rule as it is.

## 10. Checkout auth email endpoints (`lib/checkout-auth-email.ts`)

`POST /api/checkout/magic-link` and `POST /api/checkout/resend-magic-link` share one implementation. **No** Origin guard and **no** proxy check (these are possession-token flows).
1. Bad JSON → `400 INVALID_JSON`. A missing or blank `session_id` → `400 MISSING_SESSION_ID`.
2. Order by `stripeCheckoutSessionId`. Not found or not `FULFILLED` → `409 NOT_FULFILLED`. No `client.billingEmail` → `409 MISSING_EMAIL`.
3. Rate limit (§8) → 429.
4. Postmark not configured → `503 EMAIL_UNAVAILABLE`. Otherwise issue a **magic** link (never setup or reset: "a public Session ID is never authority to set or reset a password"), `next=/project/{projectId}`. Returns `{ok:true,delivery:"email"}`. Send failure → `500 AUTH_EMAIL_SEND_FAILED`, with nothing logged.

## 11. Auth email content (`lib/auth/mail.ts`, N-01…N-03)

Sent through the Postmark HTTP API (`From: POSTMARK_FROM`), with text and branded HTML (`lib/email-branding.ts`).
- Subjects: reset "Reset your Logo Fountain password", setup "Finish setting up your Logo Fountain account", sign-in "Your Logo Fountain sign-in link".
- CTA labels: "Reset password" / "Finish account setup" / "Sign in to Logo Fountain". The intro and footer text are in the source and should be copied verbatim.
- Missing token or from address → throw "Authentication email delivery is not configured". A non-2xx response → throw with the status only, and **never read the response body**.

## 12. Laravel porting notes (input to architecture)

- Build the auth "actions" (`RequestAuthLink`, `VerifyMagicLink`, `ResetCredential`, `ChangeCredential`, `Login`) as plain classes that run inside the fence. They shouldn't depend on HTTP, so Pest can test the races directly (L3).
- Sessions: the database driver, a cookie named per the ADR, `secure` when https, `http_only`, `same_site=lax`. The absolute-cap middleware. Regenerate the session ID on login.
- No "remember me". It doesn't exist today.
- Keep the generic auth messages and codes **byte for byte**. The parity contract tests assert on them.

## Corrections verified by the contract suite (story 0.7a, 2026-11-19)

These are pinned by `tests/parity/journeys/contract/auth-*.spec.ts` and `checkout-contracts.spec.ts`, and Laravel must match:
1. Auth JSON responses actually carry **`Referrer-Policy: strict-origin-when-cross-origin`**. The global header (`next.config.ts:28,44`) overrides `lib/auth/http.ts:7`'s `no-referrer`, so §4's "no-referrer" holds for the auth **pages** only (`/auth/callback`, `/set-password`, `/reset-password`). Laravel reproduces this (an assumption logged 2026-11-19).
2. `403 INVALID_ORIGIN`, `503 PUBLIC_SITE_URL_REQUIRED` and the checkout email endpoints send **no** `Cache-Control: no-store` (`lib/request-origin.ts:96,102`, `lib/checkout-auth-email.ts:46,65`).
3. On an email send failure, `/api/auth/magic-link` and `/api/auth/forgot-password` **swallow** the error and return the normal uniform 200 (`magic-link/route.ts:8`, `forgot-password/route.ts:9`). The proof is still deleted (§2), so the link is dead. Only the checkout endpoints surface `500 AUTH_EMAIL_SEND_FAILED`.
4. `reset-password` validates `WEAK_PASSWORD` **before** the token (`lib/auth/service.ts:75`). `/api/auth/password` returns 401 before reading the body, and **every** attempt, including invalid ones, consumes the per-user limit (`password/route.ts:10-11`).

5. (story 0.8e) `getRequestOrigin` trusts **both** `X-Forwarded-Proto` and `X-Forwarded-Host` (`lib/request-origin.ts:29-32`), which feeds Stripe return URLs (F-5, DV-5). The sign-in screen shows one fixed message for every failure (`lib/auth/client.ts:4`).
