# ADR-010: Trusted client IP

- **Status:** Accepted (owner, 2026-11-19)
- **Satisfies:** X-05, A-17, FR57

## Decision

Trusted client IP: `AUTH_CLIENT_IP_HEADER=cf-connecting-ip` behind the Cloudflare proxy. The Hetzner Cloud Firewall allows 80/443 only from Cloudflare ranges. Production auth fails closed (503) without a valid IP

## Context and rationale

See `../architecture.md` §3–§5 and `../research-technical.md` (the sources and verified versions). The behaviour being preserved is in `../brownfield/`.

## Consequences

Record any consequences discovered during implementation here, in the story that hits them.

- **Story 1.5:** Laravel's `TrustProxies` is removed from the global stack (`apps/portal/bootstrap/app.php`): it trusts every proxy on `*.on-forge.com` hosts and Laravel Cloud, which would let forged `X-Forwarded-*` reach `ip()`, `isSecure()` and the host. `$request->ip()` is only the socket peer; the client address is `ClientAddress::for()` (a Pest scan forbids `->ip()` in `app/`). `net.isIP` is matched exactly, so IPv6 zone IDs are accepted, as in Next. nginx must overwrite `CF-Connecting-IP` (dev: `docker/nginx/default.conf`; production snippet for Epic 9 in `stories/1-5-trusted-client-address.md`).
