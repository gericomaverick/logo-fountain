# ADR-023: Polling kept

- **Status:** Proposed (2026-11-18), pending owner review of `architecture.md`
- **Satisfies:** C-03, D-02, D-16

## Decision

Polling kept (10 s hub, 2 s admin project, 2.5 s audit) through one `usePolling` hook (pauses when the tab is hidden, backs off after errors, `aria-live` announcements). Realtime is post-launch

## Context and rationale

See `../architecture.md` §3–§5 and `../research-technical.md` (the sources and verified versions). The behaviour being preserved is in `../brownfield/`.

## Consequences

Record any consequences discovered during implementation here, in the story that hits them.
