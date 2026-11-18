# ADR-008: Strict Origin/Referer middleware is the CSRF control for /api/*

- **Status:** Proposed (2026-11-18), pending owner review of `architecture.md`
- **Satisfies:** X-01, NFR-S1

## Decision

**Strict Origin/Referer middleware is the CSRF control for `/api/*`**, at top priority (before session and auth). `/api/*` is excluded from `PreventRequestForgery`. Exemptions as X-01

## Context and rationale

See `../architecture.md` §3–§5 and `../research-technical.md` (the sources and verified versions). The behaviour being preserved is in `../brownfield/`.

## Consequences

Record any consequences discovered during implementation here, in the story that hits them.
