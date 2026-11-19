# ADR-021: Snapshot and concept payloads add a stable imageKey

- **Status:** Accepted (owner, 2026-11-19)
- **Satisfies:** DV-12, FR54

## Decision

Snapshot and concept payloads add a stable `imageKey`. The React `<PrivateImage>` keeps its `src` until the key changes or the URL is ≤ 5 min from expiry

## Context and rationale

See `../architecture.md` §3–§5 and `../research-technical.md` (the sources and verified versions). The behaviour being preserved is in `../brownfield/`.

## Consequences

Record any consequences discovered during implementation here, in the story that hits them.
