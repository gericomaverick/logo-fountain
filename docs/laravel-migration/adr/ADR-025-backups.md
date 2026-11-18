# ADR-025: Backups

- **Status:** Proposed (2026-11-18), pending owner review of `architecture.md`
- **Satisfies:** NFR-R4

## Decision

Backups: pgBackRest (weekly full, daily diff, continuous WAL, encrypted) to two repos, a dedicated R2 bucket and a Hetzner Storage Box. 30 days PITR plus 12 monthly fulls. Nightly copy-only sync of both R2 buckets to the Storage Box. Hetzner server backups as an extra. Restore drill before launch and quarterly

## Context and rationale

See `../architecture.md` §3–§5 and `../research-technical.md` (the sources and verified versions). The behaviour being preserved is in `../brownfield/`.

## Consequences

Record any consequences discovered during implementation here, in the story that hits them.
