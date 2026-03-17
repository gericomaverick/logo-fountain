# Hardening notes

## Supabase/database security

- See `docs/supabase-security-runbook.md` for pre-deploy checks and SQL verification steps.
- RLS/grant hardening migration: `prisma/migrations/20260317130500_harden_public_schema_rls/migration.sql`.


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
