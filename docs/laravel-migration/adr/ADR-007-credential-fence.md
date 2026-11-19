# ADR-007: Credential fence

- **Status:** Accepted (owner, 2026-11-19)
- **Satisfies:** A-10, FR10

## Decision

**Credential fence:** one PG transaction holding `pg_advisory_xact_lock(hashtextextended('auth:'‖id,0))`, with `SET LOCAL lock_timeout '5s'` and `statement_timeout '20s'`. Every auth read and write runs inside it

## Context and rationale

See `../architecture.md` §3–§5 and `../research-technical.md` (the sources and verified versions). The behaviour being preserved is in `../brownfield/`.

## Consequences

Record any consequences discovered during implementation here, in the story that hits them.
