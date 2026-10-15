# Application security boundaries

## Browser mutation Origin checks

Cookie-authenticated mutation handlers call the shared `rejectUntrustedMutationOrigin` guard before authentication, parsing JSON or multipart data, or performing I/O. The guard resolves the canonical origin from server-only `PUBLIC_SITE_URL` (HTTPS required in production). An explicit `Origin` must match its exact serialization; `null`, empty, malformed, credential-bearing, path-bearing, and non-canonical values fail with `403 INVALID_ORIGIN`, even with a canonical Referer.

Only when `Origin` is absent, a narrowly verified absolute `Referer` may establish browser provenance: its serialized prefix and parsed origin must match the canonical origin, with no credentials, backslashes, literal controls, or fragment. With neither acceptable header the request fails closed. Cookies, `Sec-Fetch-Site`, Host, and forwarded headers do not independently establish provenance. Scripts must supply canonical `Origin`; this is not a new server authentication mechanism and does not replace cookie authentication. Aliases and preview hosts are not implicitly trusted: navigate through the configured canonical host, or configure an isolated preview's own canonical origin. Development without configuration permits only the directly invoked loopback origin, not arbitrary LAN hosts.

Missing/invalid/insecure canonical production configuration returns `503 PUBLIC_SITE_URL_REQUIRED`; invalid request provenance with valid configuration returns `403 INVALID_ORIGIN`. These checks run before authentication, so a 403 does not imply the caller is authenticated or role-authorized. Logout retains the signed-in UI and shows a retryable error on failed sign-out or failed session confirmation; navigation to login occurs only after a successful response and a fresh unauthenticated session result. The session endpoint reports `authenticated:false` only for the documented Supabase `AuthSessionMissingError` returned without a user. Other returned verification errors, unexpected thrown failures, and unexplained missing-user results return sanitized `503 SESSION_VERIFICATION_UNAVAILABLE`, never provider diagnostics or a verified-logout result. Session responses are not cacheable.

Exemptions are intentional:

- `POST /api/stripe/webhook` is a server-to-server public endpoint. It authenticates the raw body with Stripe's webhook signature and does not use browser cookies.
- Checkout authentication-email endpoints are public possession-token flows, not cookie-authenticated mutations. They validate the Checkout Session/order relationship and use shared throttling.
- `/checkout/start` is a public marketing handoff that creates an unfulfilled Stripe Checkout Session without reading browser authentication cookies. Payment fulfillment remains signature-verified and webhook-only.
- Health checks and read-only (`GET`) API routes do not mutate cookie-authenticated application state.

The password-recovery POST is not cookie authenticated, but it is Origin-guarded too, in addition to returning enumeration-safe responses.

## Browser response headers

Next applies frame denial, MIME sniffing protection, a strict cross-origin referrer policy, and a restrictive Permissions Policy to every app response. CSP is deliberately staged as `Content-Security-Policy-Report-Only`: it covers the app plus required Supabase connections, Stripe scripts/frames, and HTTPS image assets. There is **no report collector**, `report-uri`, or `report-to` destination configured: this phase provides manual browser-console observation only, not collected production telemetry. No violation reports are stored or forwarded. Observe representative flows in browser developer tools (including Stripe, Supabase/custom-domain, asset, and development connections), enumerate actual deployment hosts, and verify headers through the TLS edge before considering enforcement. Header presence alone is not compatibility proof; inline scripts remain allowed. Any future collector needs an explicit privacy/retention and bounded-input design, since report URLs may contain secrets. Do not promote the policy based on nonexistent telemetry or weaken it ad hoc.

`Strict-Transport-Security` must be set at the production TLS edge (including the intended subdomain policy) after HTTPS coverage and preload implications are verified. It is intentionally not emitted by the app, because local HTTP and preview hosts share this build and an application response cannot guarantee the connection was terminated by the canonical production edge.

## Rate limiting

Forgot-password and public checkout authentication-email endpoints currently have process-local abuse controls. These are useful only as a single-process backstop; they are **not distributed rate limiting**. Before horizontal scaling or broad public launch, enforce rate limits at the edge or use a shared atomic store, keyed by trusted client address and normalized account/session identifiers. Proxy address headers must only be trusted after the edge overwrites them.

## Redirect and email compatibility

Auth `next` accepts application-relative paths only. Encoded pathname layers are checked for external-navigation shapes; query and fragment values remain intact rather than being interpreted as pathname syntax. Accepted redirects retain their original local URL.

Transactional CTA URLs require HTTPS. Non-production HTTP is supported only for loopback, not LAN hosts; production HTTP (including loopback) is unsupported. Use HTTPS for LAN/self-hosted email testing. Verify delivered provider links and nested redirect parameters in a non-live environment without logging bearer URLs.

## Validation limits before release

Unit guard-shape checks inspect each mutation handler's first statements; they supplement, not replace, behavioral tests and review (particularly for routes outside `app/api`). Before release, exercise real browser JSON, multipart, DELETE/PATCH, password recovery/change, logout failures, and final-download flows; verify canonical-host/alias behavior and edge headers. Verify public Stripe/checkout exemptions and delivered emails in a non-live integration environment. No live checks are implied by unit coverage.
