# ADR-009: Rate limits port the Postgres bucket table

- **Status:** Proposed (2026-11-18), pending owner review of `architecture.md`
- **Satisfies:** X-06, NFR-S4

## Decision

Rate limits port the Postgres bucket table (single-statement upsert, sha256 keys) on a **dedicated `pgsql_limits` connection**, never inside a business transaction. They cover auth **and** checkout email limits

## Context and rationale

See `../architecture.md` §3–§5 and `../research-technical.md` (the sources and verified versions). The behaviour being preserved is in `../brownfield/`.

## Consequences

Record any consequences discovered during implementation here, in the story that hits them.
