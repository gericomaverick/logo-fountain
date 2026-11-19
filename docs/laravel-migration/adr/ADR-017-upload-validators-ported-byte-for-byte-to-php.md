# ADR-017: Upload validators ported byte for byte to PHP

- **Status:** Accepted (owner, 2026-11-19)
- **Satisfies:** X-12, FR53

## Decision

Upload validators ported byte for byte to PHP (`ImageValidator`, `ZipValidator`, streaming `inflate_add`). **No `ZipArchive`.** They're proven against the shared golden corpus. Final ZIP cap 95 MB (DV-13)

## Context and rationale

See `../architecture.md` §3–§5 and `../research-technical.md` (the sources and verified versions). The behaviour being preserved is in `../brownfield/`.

## Consequences

Record any consequences discovered during implementation here, in the story that hits them.
