# Concepts P0 smoke test

## Preconditions
- App running with valid Supabase + DB env vars.
- Storage bucket exists in Supabase: `concepts`.
- Test project exists and is in `IN_DESIGN` status.
- Test user is admin (allowlist or `profiles.is_admin=true`).

## 1) Admin upload concept
1. Open `/admin`.
2. Click **Open project** on a queue item.
3. On `/admin/projects/:id`, upload an image with:
   - `conceptNumber=1`
   - optional notes
4. Confirm the concept appears in list with status `draft`.

Expected:
- New `Concept` row created with `status=draft`.
- New `FileAsset` row created with `kind=concept` and bucket/path set.
- Storage object exists at `concepts/<projectId>/<conceptId>.<ext>`.

## 2) Publish concept
1. Click **Publish** for the draft concept.

Expected:
- Concept status becomes `published`.
- If this is first published concept for the project and project was `IN_DESIGN`, project status updates to `CONCEPTS_READY`.

## 3) Client sees published concepts
1. Sign in as project member.
2. Open `/project/:id`.

Expected:
- Page lists published concepts only.
- Each concept includes notes and loads image via signed URL.
- Direct API check: `GET /api/projects/:id/concepts` returns published concepts with `imageUrl`.

## 4) Access control checks
- Non-admin calling admin upload/publish endpoints gets `403`.
- Non-member calling `GET /api/projects/:id/concepts` gets `404` (not found for that user scope).
