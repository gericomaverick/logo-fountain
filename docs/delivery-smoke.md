# Final Delivery Smoke Test

## Preconditions
- Project has at least one published concept.
- Admin user can access `/admin/projects/[id]`.
- Client user is a member of the same project.

## Client approval flow
1. Open `/project/[id]` with project in `CONCEPTS_READY`.
2. Confirm published concepts are visible.
3. Click **Approve concept** on one concept.
4. Verify API `POST /api/projects/[id]/approve` succeeds.
5. Verify selected concept is now `approved` and previously published concepts are no longer published (archived).
6. Verify project status is `AWAITING_APPROVAL`.

## Admin final ZIP upload flow
1. Open `/admin/projects/[id]`.
2. In **Final ZIP delivery**, upload a `.zip` file.
3. Verify API `POST /api/admin/projects/[id]/finals` succeeds and creates/updates `FileAsset` with `kind=final_zip`.
4. If approved concept exists, verify project status becomes `FINAL_FILES_READY`.
5. If no approved concept exists, verify status remains `AWAITING_APPROVAL`.

## Client final download flow
1. When project reaches `FINAL_FILES_READY`, open `/project/[id]`.
2. In **Final files**, click **Get download link**.
3. Verify `GET /api/projects/[id]/finals` returns a signed URL.
4. Open the returned URL and confirm ZIP downloads.

## Authorization checks
- Non-members calling `POST /api/projects/[id]/approve` or `GET /api/projects/[id]/finals` should get `404`/`401`.
- Non-admins calling `POST /api/admin/projects/[id]/finals` should get `403`.
