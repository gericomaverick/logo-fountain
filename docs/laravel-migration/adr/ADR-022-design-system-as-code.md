# ADR-022: Design system as code

- **Status:** Proposed (2026-11-18), pending owner review of `architecture.md`
- **Satisfies:** DV-UX, NFR-A1…A4

## Decision

Design system as code: Tailwind 4 `@theme` tokens from `ux-design.md` §8 (direction A), Radix UI primitives for dialog, menu, tabs, popover, tooltip and select (a phone sheet is a dialog variant), components in `resources/js/Components/ui`, a `/dev/ui` catalogue (local only), and the design-system lint

## Context and rationale

See `../architecture.md` §3–§5 and `../research-technical.md` (the sources and verified versions). The behaviour being preserved is in `../brownfield/`.

## Consequences

Record any consequences discovered during implementation here, in the story that hits them.
