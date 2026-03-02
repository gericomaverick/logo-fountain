# Admin Queue Smoke Test

## Preconditions

- App running locally (`npm run dev` in `apps/web`).
- Test user is signed in.
- Admin access is enabled via either:
  - `profiles.isAdmin = true` for that user id, or
  - `ADMIN_EMAILS` env var contains the user email (comma-separated).

## 1) Verify admin queue read endpoint

1. Open `/api/admin/projects` in a signed-in browser session.
2. Expected:
   - Admin user gets `200` with `{ projects: [...] }`.
   - Non-admin signed-in user gets `403`.
   - Signed-out user gets `401`.

Optional status filter:

- Open `/api/admin/projects?status=BRIEF_SUBMITTED`.
- Expected: only projects with matching status, newest first.

## 2) Verify admin UI

1. Open `/admin`.
2. Expected:
   - Queue renders with `Project ID`, `Client`, `Package`, `Status`.
   - Filter dropdown refreshes queue by status.

## 3) Verify status transitions endpoint

### Allowed transition

1. Pick a project in `BRIEF_SUBMITTED`.
2. POST to `/api/admin/projects/{id}/status` with body:

```json
{ "status": "IN_DESIGN" }
```

3. Expected: `200`, `ok: true`, project status updated.

### Disallowed transition

1. POST with invalid transition, e.g. `BRIEF_SUBMITTED -> CONCEPTS_READY`.
2. Expected: `400` with allowed transitions in response.

## Allowed transitions currently implemented

- `BRIEF_SUBMITTED -> IN_DESIGN`
- `IN_DESIGN -> CONCEPTS_READY`
