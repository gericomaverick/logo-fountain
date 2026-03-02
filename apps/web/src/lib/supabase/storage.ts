import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const SUPABASE_STORAGE_BUCKET_CONCEPTS = "concepts";

type UploadConceptAssetInput = {
  projectId: string;
  conceptId: string;
  file: File;
};

function inferExtension(file: File): string {
  const namePart = file.name.split(".").pop()?.trim().toLowerCase();
  if (namePart && /^[a-z0-9]+$/.test(namePart)) return namePart;

  switch (file.type) {
    case "image/jpeg":
      return "jpg";
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    case "image/gif":
      return "gif";
    default:
      return "bin";
  }
}

export async function uploadConceptAsset({ projectId, conceptId, file }: UploadConceptAssetInput) {
  const ext = inferExtension(file);
  const path = `${projectId}/${conceptId}.${ext}`;
  const bytes = new Uint8Array(await file.arrayBuffer());
  const admin = createSupabaseAdminClient();

  const { error } = await admin.storage
    .from(SUPABASE_STORAGE_BUCKET_CONCEPTS)
    .upload(path, bytes, {
      contentType: file.type || "application/octet-stream",
      upsert: true,
    });

  if (error) {
    throw new Error(`Failed to upload concept asset: ${error.message}`);
  }

  return {
    bucket: SUPABASE_STORAGE_BUCKET_CONCEPTS,
    path,
    mime: file.type || "application/octet-stream",
    size: file.size,
  };
}

export async function createSignedConceptAssetUrl(path: string, expiresInSeconds = 60 * 60) {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.storage
    .from(SUPABASE_STORAGE_BUCKET_CONCEPTS)
    .createSignedUrl(path, expiresInSeconds);

  if (error || !data?.signedUrl) {
    throw new Error(error?.message ?? "Failed to create signed URL");
  }

  return data.signedUrl;
}
