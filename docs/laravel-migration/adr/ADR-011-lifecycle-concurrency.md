# ADR-011: Lifecycle concurrency

- **Status:** Accepted (owner, 2026-11-19)
- **Satisfies:** X-17, NFR-R3

## Decision

Lifecycle concurrency: an explicit `projects.version` integer (an optimistic guard bumped in every state change) plus a `Db::serializable()` helper that retries on SQLSTATE 40001/40P01 (no nesting allowed) and maps exhaustion to the existing 409 codes

## Context and rationale

See `../architecture.md` §3–§5 and `../research-technical.md` (the sources and verified versions). The behaviour being preserved is in `../brownfield/`.

## Consequences

Record any consequences discovered during implementation here, in the story that hits them.
