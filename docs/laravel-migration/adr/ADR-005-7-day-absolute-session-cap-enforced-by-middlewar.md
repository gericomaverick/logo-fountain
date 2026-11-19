# ADR-005: 7-day absolute session cap enforced by middleware

- **Status:** Accepted (owner, 2026-11-19)
- **Satisfies:** A-03, A-04, FR7

## Decision

7-day **absolute** session cap enforced by middleware (`auth.issued_at` plus a `credential_version` check). Session regenerated on login. Cookie `__Host-lf_session` in production

## Context and rationale

See `../architecture.md` §3–§5 and `../research-technical.md` (the sources and verified versions). The behaviour being preserved is in `../brownfield/`.

## Consequences

Record any consequences discovered during implementation here, in the story that hits them.
