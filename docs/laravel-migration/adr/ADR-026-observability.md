# ADR-026: Observability

- **Status:** Proposed (2026-11-18), pending owner review of `architecture.md`
- **Satisfies:** ops

## Decision

Observability: Laravel log (JSON, daily rotation, secrets scrubbed by a log processor), Forge server monitoring, a scheduled health job, backup freshness checks and failed-job alerts, all **emailed to the owner**. A PHP security-release check runs weekly

## Context and rationale

See `../architecture.md` §3–§5 and `../research-technical.md` (the sources and verified versions). The behaviour being preserved is in `../brownfield/`.

## Consequences

Record any consequences discovered during implementation here, in the story that hits them.
