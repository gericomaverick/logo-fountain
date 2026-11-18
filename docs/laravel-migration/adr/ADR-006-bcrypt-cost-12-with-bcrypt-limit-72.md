# ADR-006: bcrypt cost 12 with BCRYPT_LIMIT=72

- **Status:** Proposed (2026-11-18), pending owner review of `architecture.md`
- **Satisfies:** A-01, FR1

## Decision

bcrypt cost 12 with `BCRYPT_LIMIT=72`. Validation: 8 characters minimum, 72 bytes maximum

## Context and rationale

See `../architecture.md` §3–§5 and `../research-technical.md` (the sources and verified versions). The behaviour being preserved is in `../brownfield/`.

## Consequences

Record any consequences discovered during implementation here, in the story that hits them.
