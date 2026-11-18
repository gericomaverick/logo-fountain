# ADR-024: Hosting

- **Status:** Proposed (2026-11-18), pending owner review of `architecture.md`
- **Satisfies:** FR56, NFR-S2

## Decision

Hosting: **Forge** provisions **one Hetzner Cloud server** (Ubuntu LTS, nginx, PHP 8.5-FPM over a unix socket, PG 18 local), the **Cloudflare proxy** (Full strict), the Hetzner Cloud Firewall, and HSTS at Cloudflare

## Context and rationale

See `../architecture.md` §3–§5 and `../research-technical.md` (the sources and verified versions). The behaviour being preserved is in `../brownfield/`.

## Consequences

Record any consequences discovered during implementation here, in the story that hits them.
