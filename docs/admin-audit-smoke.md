# Admin audit visibility smoke test

## Goal
Verify admin users can inspect project audit logs in API + UI.

## Preconditions
- App running (`apps/web`)
- Seeded project with at least one audit event (or perform actions like concept upload/status change)
- Logged in as admin

## API checks
1. `GET /api/admin/projects/{projectId}/audit`
2. Expect `200 OK` for admin.
3. Response body includes:
   - `events` array
   - max 100 entries
   - sorted newest first (`createdAt desc`)
   - each entry has `type`, `createdAt`, optional `actor`, and `payload`
4. Non-admin should receive `403`.

## UI checks
1. Open `/admin/projects/{projectId}`.
2. Confirm header shows **Recent audit events** count.
3. Confirm **Audit log** section renders list rows with:
   - event type
   - timestamp
   - actor email (or System fallback)
   - payload summary
4. Generate a new auditable action (e.g. upload concept, publish concept).
5. Confirm list updates and newest event appears first.

## Pass criteria
- API and UI both expose audit events correctly for admins.
- Non-admin access is blocked.
