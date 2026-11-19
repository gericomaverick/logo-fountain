# ADR-019: Queue

- **Status:** Accepted (owner, 2026-11-19)
- **Satisfies:** NFR-R5

## Decision

Queue: the `database` driver (SKIP LOCKED) with `after_commit=true`. One supervised worker (Forge daemon). Scheduler for pruning and checks. No Redis, no Horizon

## Context and rationale

See `../architecture.md` §3–§5 and `../research-technical.md` (the sources and verified versions). The behaviour being preserved is in `../brownfield/`.

## Consequences

Record any consequences discovered during implementation here, in the story that hits them.
