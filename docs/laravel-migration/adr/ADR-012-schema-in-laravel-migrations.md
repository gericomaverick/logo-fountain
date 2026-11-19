# ADR-012: Schema in Laravel migrations

- **Status:** Accepted (owner, 2026-11-19)
- **Satisfies:** data model, A-19, X-15

## Decision

Schema in Laravel migrations, snake_case, UUID primary keys (`HasUuids` → v7), jsonb payloads, a raw-SQL trigger protecting `is_admin`, email check constraints, a jsonb expression index on `audit_events(payload->>'requestKey')`

## Context and rationale

See `../architecture.md` §3–§5 and `../research-technical.md` (the sources and verified versions). The behaviour being preserved is in `../brownfield/`.

## Consequences

Record any consequences discovered during implementation here, in the story that hits them.
