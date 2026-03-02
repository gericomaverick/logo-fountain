# Revisions Smoke Test

## Preconditions
- User belongs to project client membership.
- Project has `ProjectEntitlement` rows for `concepts` and `revisions`.
- At least one concept is published (optional but recommended for concept-link validation).

## Client flow
1. Open `/project/[id]`.
2. Confirm **Revisions remaining** is shown.
3. Submit a revision request message.
4. Verify request succeeds and revisions remaining decrements by 1 immediately.
5. Submit again until no revisions remain.
6. Verify API returns `400` with `No revisions remaining` and UI blocks submit.

## API checks
- `GET /api/projects/[id]/entitlements` returns:
  ```json
  { "entitlements": { "concepts": <number>, "revisions": <number> } }
  ```
- `POST /api/projects/[id]/revision-requests`:
  - Requires auth + membership.
  - Consumes one revision entitlement on submit.
  - Creates a `RevisionRequest` linked to latest published concept when present.

## Admin flow
1. Open `/admin/projects/[id]`.
2. Confirm revision requests list renders request body, requester, status, linked concept.
3. Click **Mark delivered** for a request.
4. Verify status changes to `delivered`.
5. Verify project status transitions to `CONCEPTS_READY` when delivered endpoint default is used.

## Race safety spot check
- Fire 2+ parallel `POST /api/projects/[id]/revision-requests` when exactly 1 revision remains.
- Expect exactly one success and others `400 No revisions remaining`.
