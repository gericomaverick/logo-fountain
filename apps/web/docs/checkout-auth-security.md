# Checkout authentication security

## Canonical redirect origin

Authentication and checkout-continuation email links must use the server-only
`PUBLIC_SITE_URL`. In production it must be a valid HTTPS origin. Security-sensitive
code must not derive redirects from `Host`, `X-Forwarded-Host`, or
`NEXT_PUBLIC_SITE_URL`.

For explicit local development only, when `PUBLIC_SITE_URL` is absent, a directly
invoked loopback request URL (`localhost`, `127.0.0.1`, or `::1`) may be used.
Server jobs without a request use the fixed `http://localhost:3000` development
fallback. Forwarded and Host headers are ignored. Non-loopback development requests
fail closed and should set `PUBLIC_SITE_URL` explicitly.

## Public checkout email limiting

Both `/api/checkout/magic-link` and `/api/checkout/resend-magic-link` call the same
send implementation and limiter. The current fallback permits at most:

- 3 sends per Checkout Session in 15 minutes.
- 5 sends per normalized destination mailbox in 60 minutes, across sessions.

The fallback stores only SHA-256-derived keys, consumes quota before email I/O,
expires old entries, and caps storage at 10,000 buckets.

### Residual risk

This limiter is process-local because no distributed rate-limit backend is currently
available. Limits reset on process restart and can be multiplied across application
instances. Before horizontal scaling, replace the fallback with an atomic distributed
store while keeping the same per-session and per-destination interface. Provider-side
email limits remain defense in depth, not a replacement for application limiting.

Forgot-password requests have a separate bounded fallback: five valid requests per
15 minutes per normalized email and per request address. Limited requests preserve
the same anti-enumeration success response and skip provider I/O. This limiter is
also process-local, resets on restart, and must be replaced with an atomic distributed
limiter before horizontal scaling.

## First-time recovery

Only trusted paid-checkout webhook provisioning may select the initial password-setup
email flow. Public endpoints that accept a Checkout Session ID always send a sign-in
link and cannot choose setup or password reset. If the initial setup email expires,
the mailbox owner can sign in using the delivered link and use the normal
`/forgot-password` flow, whose redirect is also generated server-side from
`PUBLIC_SITE_URL`.
