# ADR-027: Security headers middleware

- **Status:** Accepted (owner, 2026-11-19)
- **Satisfies:** X-02, NFR-S2

## Decision

Security headers middleware: report-only CSP (the same directives as `next.config.ts`, plus Vite's dev origin in local only), X-Frame-Options DENY, nosniff, Referrer-Policy, Permissions-Policy, and no-store/no-referrer on the auth pages. HSTS is set at Cloudflare

## Context and rationale

See `../architecture.md` §3–§5 and `../research-technical.md` (the sources and verified versions). The behaviour being preserved is in `../brownfield/`.

## Consequences

Record any consequences discovered during implementation here, in the story that hits them.
