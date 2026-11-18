# ADR-013: Two DB roles

- **Status:** Proposed (2026-11-18), pending owner review of `architecture.md`
- **Satisfies:** O-06, A-12, FR9

## Decision

Two DB roles: `pgsql` (runtime DML) and `pgsql_migrate` (owner). Deploy migrates with `--database=pgsql_migrate`, then the grants script runs. `admin:bootstrap` uses `pgsql_migrate` only

## Context and rationale

See `../architecture.md` §3–§5 and `../research-technical.md` (the sources and verified versions). The behaviour being preserved is in `../brownfield/`.

## Consequences

Record any consequences discovered during implementation here, in the story that hits them.
