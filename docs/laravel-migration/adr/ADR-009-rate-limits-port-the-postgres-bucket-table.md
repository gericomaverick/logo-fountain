# ADR-009: Rate limits port the Postgres bucket table

- **Status:** Accepted (owner, 2026-11-19)
- **Satisfies:** X-06, NFR-S4

## Decision

Rate limits port the Postgres bucket table (single-statement upsert, sha256 keys) on a **dedicated `pgsql_limits` connection**, never inside a business transaction. They cover auth **and** checkout email limits

## Context and rationale

See `../architecture.md` §3–§5 and `../research-technical.md` (the sources and verified versions). The behaviour being preserved is in `../brownfield/`.

## Consequences

- 2026-11-18 (readiness m3): the `pgsql_limits` connection uses the **runtime** DB role (two roles in total, ADR-013 unchanged). Its purpose is a separate connection that isn't inside the business transaction, not a separate privilege.

Record any consequences discovered during implementation here, in the story that hits them.
