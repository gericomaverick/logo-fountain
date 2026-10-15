# Application security boundaries

## Browser mutation Origin checks

Cookie-authenticated mutation handlers call the shared `rejectUntrustedMutationOrigin` guard before authentication, parsing JSON or multipart data, or performing I/O. The guard requires the exact canonical `Origin` derived from the server-only `PUBLIC_SITE_URL` in production. Missing, `null`, malformed, credential-bearing, path-bearing, and non-canonical origins fail closed with `403 INVALID_ORIGIN`.

Exemptions are intentional:

- `POST /api/stripe/webhook` is a server-to-server public endpoint. It authenticates the raw body with Stripe's webhook signature and does not use browser cookies.
- Checkout authentication-email endpoints are public possession-token flows, not cookie-authenticated mutations. They validate the Checkout Session/order relationship and use shared throttling.
- `/checkout/start` is a public marketing handoff that creates an unfulfilled Stripe Checkout Session without reading browser authentication cookies. Payment fulfillment remains signature-verified and webhook-only.
- Health checks and read-only (`GET`) API routes do not mutate cookie-authenticated application state.

The password-recovery POST is not cookie authenticated, but it is Origin-guarded too, in addition to returning enumeration-safe responses.

## Browser response headers

Next applies frame denial, MIME sniffing protection, a strict cross-origin referrer policy, and a restrictive Permissions Policy to every app response. CSP is deliberately staged as `Content-Security-Policy-Report-Only`: it covers the app plus required Supabase connections, Stripe scripts/frames, and HTTPS image assets. Review production CSP violation telemetry and enumerate any real deployment asset hosts before promoting it to enforcement; do not weaken it ad hoc.

`Strict-Transport-Security` must be set at the production TLS edge (including the intended subdomain policy) after HTTPS coverage and preload implications are verified. It is intentionally not emitted by the app, because local HTTP and preview hosts share this build and an application response cannot guarantee the connection was terminated by the canonical production edge.

## Rate limiting

Forgot-password and public checkout authentication-email endpoints currently have process-local abuse controls. These are useful only as a single-process backstop; they are **not distributed rate limiting**. Before horizontal scaling or broad public launch, enforce rate limits at the edge or use a shared atomic store, keyed by trusted client address and normalized account/session identifiers. Proxy address headers must only be trusted after the edge overwrites them.
