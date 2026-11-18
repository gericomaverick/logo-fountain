# ADR-020: Client concept visibility

- **Status:** Proposed (2026-11-18), pending owner review of `architecture.md`
- **Satisfies:** DV-7, FR26–FR28, FR34

## Decision

Client concept visibility: every client-path concept or asset lookup goes through `Concept::visibleToClient()` (published and approved) plus a policy. An architecture test forbids other queries from client controllers. 404 is indistinguishable

## Context and rationale

See `../architecture.md` §3–§5 and `../research-technical.md` (the sources and verified versions). The behaviour being preserved is in `../brownfield/`.

## Consequences

Record any consequences discovered during implementation here, in the story that hits them.
