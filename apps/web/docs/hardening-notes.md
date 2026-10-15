# Hardening notes

## Database and auth security

- Portable PostgreSQL roles, grants and preflight: `ops/postgres/README.md`. Tenancy is enforced in app code, not RLS.
- Auth lifecycle, sessions and one-time admin bootstrap: `docs/auth-runbook.md`.
- The retired Supabase runbook and RLS migration are archived (`docs/archive/`, `prisma/archive/supabase-migrations/`).


## Refresh strategy (current)

- Added canonical snapshot endpoints:
  - `GET /api/projects/[id]`
  - `GET /api/admin/projects/[id]`
- Both project pages now poll snapshot every 2s (`cache: no-store`) as the single source of truth.
- Post actions (publish concept, request revision, approve, upload finals, mark delivered, send message) trigger immediate `refresh()` after successful response.

## Why this is safer now

- Removes scattered fetch races between concepts/messages/entitlements/revisions.
- UI now converges quickly after any status-changing action.
- Error contract is standardized around:

```json
{
  "error": {
    "message": "...",
    "code": "...",
    "details": { "nextStep": "..." }
  }
}
```

This allows UI to show actionable failures (for example, no revisions remaining => suggest add-on).

## Next step (later)

- Replace polling with realtime transport (SSE/WebSocket) while keeping snapshot payload as canonical server state.
- Keep polling as fallback for resilience.
