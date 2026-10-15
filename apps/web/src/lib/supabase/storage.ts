import "server-only";

import { randomUUID } from "node:crypto";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { PreparedUpload } from "@/lib/upload-validation";

export const SUPABASE_STORAGE_BUCKET_CONCEPTS = "concepts";
export const SUPABASE_STORAGE_BUCKET_FINAL_DELIVERABLES = "final-deliverables";

type UploadConceptAssetInput = {
  bucketPath: string;
  upload: PreparedUpload;
  upsert?: false;
};

type UploadFinalDeliverableInput = {
  projectId: string;
  upload: PreparedUpload;
};

export async function uploadConceptAsset({ bucketPath, upload, upsert = false }: UploadConceptAssetInput) {
  const admin = createSupabaseAdminClient();

  const { error } = await admin.storage
    .from(SUPABASE_STORAGE_BUCKET_CONCEPTS)
    .upload(bucketPath, upload.bytes, {
      contentType: upload.contentType,
      cacheControl: "3600",
      upsert,
    });

  if (error) {
    throw new Error(`Failed to upload concept asset: ${error.message}`);
  }

  return {
    bucket: SUPABASE_STORAGE_BUCKET_CONCEPTS,
    path: bucketPath,
    mime: upload.contentType,
    size: upload.size,
  };
}

export async function uploadFinalDeliverable({ projectId, upload }: UploadFinalDeliverableInput) {
  // Final objects are immutable. Replacements publish a fresh database record
  // pointing at a fresh object; an authorization race can never expose changed
  // bytes through an already-authorized path.
  const path = `${projectId}/finals/${randomUUID()}.${upload.extension}`;
  const admin = createSupabaseAdminClient();

  const { error } = await admin.storage
    .from(SUPABASE_STORAGE_BUCKET_FINAL_DELIVERABLES)
    .upload(path, upload.bytes, {
      contentType: upload.contentType,
      cacheControl: "3600",
      upsert: false,
    });

  if (error) {
    throw new Error(`Failed to upload final deliverable: ${error.message}`);
  }

  return {
    bucket: SUPABASE_STORAGE_BUCKET_FINAL_DELIVERABLES,
    path,
    mime: upload.contentType,
    size: upload.size,
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
    .createSignedUrl(path, expiresInSeconds, { download: downloadFileName ?? "final-deliverables.zip" });

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
