import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const SUPABASE_STORAGE_BUCKET_CONCEPTS = "concepts";
export const SUPABASE_STORAGE_BUCKET_FINAL_DELIVERABLES = "final-deliverables";

type UploadConceptAssetInput = {
  bucketPath: string;
  file: File;
  upsert?: boolean;
};

type UploadFinalDeliverableInput = {
  projectId: string;
  file: File;
};

export function inferExtension(file: File): string {
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
    case "application/zip":
    case "application/x-zip-compressed":
      return "zip";
    default:
      return "bin";
  }
}

export async function uploadConceptAsset({ bucketPath, file, upsert = true }: UploadConceptAssetInput) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const admin = createSupabaseAdminClient();

  const { error } = await admin.storage
    .from(SUPABASE_STORAGE_BUCKET_CONCEPTS)
    .upload(bucketPath, bytes, {
      contentType: file.type || "application/octet-stream",
      upsert,
    });

  if (error) {
    throw new Error(`Failed to upload concept asset: ${error.message}`);
  }

  return {
    bucket: SUPABASE_STORAGE_BUCKET_CONCEPTS,
    path: bucketPath,
    mime: file.type || "application/octet-stream",
    size: file.size,
  };
}

export async function uploadFinalDeliverable({ projectId, file }: UploadFinalDeliverableInput) {
  const ext = inferExtension(file);
  const path = `${projectId}/final-deliverable.${ext}`;
  const bytes = new Uint8Array(await file.arrayBuffer());
  const admin = createSupabaseAdminClient();

  const { error } = await admin.storage
    .from(SUPABASE_STORAGE_BUCKET_FINAL_DELIVERABLES)
    .upload(path, bytes, {
      contentType: file.type || "application/octet-stream",
      upsert: true,
    });

  if (error) {
    throw new Error(`Failed to upload final deliverable: ${error.message}`);
  }

  return {
    bucket: SUPABASE_STORAGE_BUCKET_FINAL_DELIVERABLES,
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

export async function createSignedFinalDeliverableUrl(path: string, expiresInSeconds = 60 * 60, downloadFileName?: string) {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.storage
    .from(SUPABASE_STORAGE_BUCKET_FINAL_DELIVERABLES)
    .createSignedUrl(path, expiresInSeconds, downloadFileName ? { download: downloadFileName } : undefined);

  if (error || !data?.signedUrl) {
    throw new Error(error?.message ?? "Failed to create final deliverable signed URL");
  }

  return data.signedUrl;
}

export async function deleteStoredFiles(files: Array<{ bucket: string; path: string }>) {
  const admin = createSupabaseAdminClient();
  const grouped = new Map<string, string[]>();

  for (const file of files) {
    if (!file?.bucket || !file?.path) continue;
    const next = grouped.get(file.bucket) ?? [];
    next.push(file.path);
    grouped.set(file.bucket, next);
  }

  let deleted = 0;
  const failures: Array<{ bucket: string; message: string }> = [];

  for (const [bucket, paths] of grouped.entries()) {
    if (paths.length === 0) continue;
    const { data, error } = await admin.storage.from(bucket).remove(paths);
    if (error) {
      failures.push({ bucket, message: error.message });
      continue;
    }
    deleted += data?.length ?? paths.length;
  }

  return { attempted: files.length, deleted, failures };
}
