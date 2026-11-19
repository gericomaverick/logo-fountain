# ADR-028: CI

- **Status:** Accepted (owner, 2026-11-19)
- **Satisfies:** test strategy

## Decision

CI: GitHub Actions running `docker compose` (postgres, mailpit, seaweedfs, app, worker). Jobs: `laravel-ci` (Pint, Larastan, Pest including L3), `parity` (matrix next/laravel), `ui` (Vitest, tsc, ESLint plus the design lint, L7/L7a), `audit` (composer and npm)

## Context and rationale

See `../architecture.md` §3–§5 and `../research-technical.md` (the sources and verified versions). The behaviour being preserved is in `../brownfield/`.

## Consequences

Record any consequences discovered during implementation here, in the story that hits them.
