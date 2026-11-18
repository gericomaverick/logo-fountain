# ADR-003: /api/* lives in the web middleware group

- **Status:** Proposed (2026-11-18), pending owner review of `architecture.md`
- **Satisfies:** FR all, X-03

## Decision

`/api/*` lives in the **`web` middleware group** (session-backed), with the same paths, methods, codes and error shape

## Context and rationale

See `../architecture.md` §3–§5 and `../research-technical.md` (the sources and verified versions). The behaviour being preserved is in `../brownfield/`.

## Consequences

Record any consequences discovered during implementation here, in the story that hits them.
