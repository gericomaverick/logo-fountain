# ADR-010: Trusted client IP

- **Status:** Accepted (owner, 2026-11-19)
- **Satisfies:** X-05, A-17, FR57

## Decision

Trusted client IP: `AUTH_CLIENT_IP_HEADER=cf-connecting-ip` behind the Cloudflare proxy. The Hetzner Cloud Firewall allows 80/443 only from Cloudflare ranges. Production auth fails closed (503) without a valid IP

## Context and rationale

See `../architecture.md` §3–§5 and `../research-technical.md` (the sources and verified versions). The behaviour being preserved is in `../brownfield/`.

## Consequences

Record any consequences discovered during implementation here, in the story that hits them.
