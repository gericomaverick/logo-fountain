-- Allow per-asset notes (e.g. revision explainer) for concept uploads.
ALTER TABLE "FileAsset" ADD COLUMN IF NOT EXISTS "notes" TEXT;
