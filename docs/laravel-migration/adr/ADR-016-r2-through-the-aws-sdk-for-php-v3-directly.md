# ADR-016: R2 through the AWS SDK for PHP v3 directly

- **Status:** Proposed (2026-11-18), pending owner review of `architecture.md`
- **Satisfies:** X-10…X-13, FR51–FR52

## Decision

R2 through the AWS SDK for PHP v3 directly: `IfNoneMatch '*'` (412 → collision), checksum options `when_required`, our own ContentMD5 plus sha256 metadata, presigned GET ≤ 3600 s with a sanitised disposition. Flysystem isn't used for private objects. **SeaweedFS** in local and CI

## Context and rationale

See `../architecture.md` §3–§5 and `../research-technical.md` (the sources and verified versions). The behaviour being preserved is in `../brownfield/`.

## Consequences

Record any consequences discovered during implementation here, in the story that hits them.
