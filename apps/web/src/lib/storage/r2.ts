import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { DeleteObjectCommand, GetObjectCommand, HeadBucketCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import type { PreparedUpload } from "@/lib/upload-validation";

// Persist logical namespaces, not operator-selected infrastructure bucket names.
export const STORAGE_BUCKET_CONCEPTS = "concepts";
export const STORAGE_BUCKET_FINAL_DELIVERABLES = "final-deliverables";
type Namespace = typeof STORAGE_BUCKET_CONCEPTS | typeof STORAGE_BUCKET_FINAL_DELIVERABLES;

function namespace(value: string): Namespace {
  if (value !== STORAGE_BUCKET_CONCEPTS && value !== STORAGE_BUCKET_FINAL_DELIVERABLES) throw new Error("Unknown private storage namespace");
  return value;
}

function objectKey(value: string): string {
  if (!value || value.length > 1024 || value.startsWith("/") || /[\x00-\x1f\x7f\\]/.test(value) || value.split("/").some((part) => !part || part === "." || part === "..")) {
    throw new Error("Invalid private object key");
  }
  return value;
}

export function signedUrlExpiry(value: number): number {
  if (!Number.isInteger(value) || value < 1 || value > 3600) throw new Error("Signed URL expiry must be an integer between 1 and 3600 seconds");
  return value;
}

export function safeDownloadDisposition(input = "final-deliverables.zip"): string {
  // Both parameters are signed. Never allow header injection or path components.
  const cleaned = Array.from(input.normalize("NFC").replace(/[\x00-\x1f\x7f-\x9f/\\";\u2028\u2029]/g, "_")).slice(0, 160).join("").trim() || "final-deliverables.zip";
  const ascii = cleaned.replace(/[^\x20-\x7e]/g, "_");
  // encodeURIComponent throws on lone UTF-16 surrogates; replace them fail-safely.
  const unicode = cleaned.toWellFormed();
  const encoded = encodeURIComponent(unicode).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}

export class PrivateR2Storage {
  constructor(private readonly client: S3Client, private readonly buckets: Record<Namespace, string>) {
    for (const bucket of Object.values(buckets)) {
      if (!/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(bucket)) throw new Error("Invalid private bucket configuration");
    }
    if (buckets.concepts === buckets["final-deliverables"]) throw new Error("Private storage namespaces require distinct buckets");
  }

  async upload(bucket: Namespace, path: string, upload: PreparedUpload) {
    const key = objectKey(path);
    await this.client.send(new PutObjectCommand({
      Bucket: this.buckets[bucket], Key: key, Body: upload.bytes,
      ContentType: upload.contentType, ContentLength: upload.size,
      CacheControl: "private, max-age=3600", IfNoneMatch: "*",
      ContentMD5: createHash("md5").update(upload.bytes).digest("base64"),
      Metadata: { sha256: createHash("sha256").update(upload.bytes).digest("hex") },
    }));
    return { bucket, path: key, mime: upload.contentType, size: upload.size };
  }

  async sign(bucket: Namespace, path: string, expiresIn = 3600, downloadFileName?: string) {
    const ttl = signedUrlExpiry(expiresIn);
    return getSignedUrl(this.client, new GetObjectCommand({
      Bucket: this.buckets[bucket], Key: objectKey(path),
      ...(downloadFileName !== undefined ? { ResponseContentDisposition: safeDownloadDisposition(downloadFileName) } : {}),
    }), { expiresIn: ttl });
  }

  async health() {
    const results = [];
    for (const bucket of [STORAGE_BUCKET_CONCEPTS, STORAGE_BUCKET_FINAL_DELIVERABLES] as const) {
      try {
        await this.client.send(new HeadBucketCommand({ Bucket: this.buckets[bucket] }));
        results.push({ bucket, passed: true });
      } catch {
        results.push({ bucket, passed: false });
      }
    }
    return results;
  }

  async remove(files: Array<{ bucket: string; path: string }>) {
    // Explicit caller-only cleanup; never invoked automatically for publication ambiguity.
    let deleted = 0;
    const failures: Array<{ bucket: string; message: string }> = [];
    for (const file of files) {
      try {
        const bucket = namespace(file.bucket);
        await this.client.send(new DeleteObjectCommand({ Bucket: this.buckets[bucket], Key: objectKey(file.path) }));
        deleted += 1; // S3 delete is idempotent: count acknowledged requests, not existence.
      } catch {
        failures.push({ bucket: file.bucket, message: "Private object deletion was not confirmed" });
      }
    }
    return { attempted: files.length, deleted, failures };
  }
}

let storage: PrivateR2Storage | undefined;
function getStorage(): PrivateR2Storage {
  if (storage) return storage;
  const required = (key: string) => {
    const value = process.env[key]?.trim();
    if (!value) throw new Error(`Missing private storage configuration: ${key}`);
    return value;
  };
  const account = required("R2_ACCOUNT_ID");
  if (!/^[a-f0-9]{32}$/.test(account)) throw new Error("Invalid R2 account ID");
  const jurisdiction = process.env.R2_JURISDICTION?.trim();
  if (jurisdiction && jurisdiction !== "eu" && jurisdiction !== "fedramp") throw new Error("Invalid R2 jurisdiction");
  const endpoint = `https://${account}${jurisdiction ? `.${jurisdiction}` : ""}.r2.cloudflarestorage.com`;
  storage = new PrivateR2Storage(new S3Client({
    region: "auto", endpoint,
    credentials: { accessKeyId: required("R2_ACCESS_KEY_ID"), secretAccessKey: required("R2_SECRET_ACCESS_KEY") },
    requestChecksumCalculation: "WHEN_REQUIRED", responseChecksumValidation: "WHEN_REQUIRED",
    maxAttempts: 3,
  }), { concepts: required("R2_CONCEPTS_BUCKET"), "final-deliverables": required("R2_FINAL_DELIVERABLES_BUCKET") });
  return storage;
}

export async function uploadConceptAsset({ bucketPath, upload, upsert = false }: { bucketPath: string; upload: PreparedUpload; upsert?: false }) {
  if (upsert !== false) throw new Error("Private objects cannot be overwritten");
  return getStorage().upload(STORAGE_BUCKET_CONCEPTS, bucketPath, upload);
}
export async function uploadFinalDeliverable({ projectId, upload }: { projectId: string; upload: PreparedUpload }) {
  const path = `${objectKey(projectId)}/finals/${randomUUID()}.${upload.extension}`;
  return getStorage().upload(STORAGE_BUCKET_FINAL_DELIVERABLES, path, upload);
}
export async function createSignedConceptAssetUrl(path: string, expiresInSeconds = 3600) {
  return getStorage().sign(STORAGE_BUCKET_CONCEPTS, path, expiresInSeconds);
}
export async function createSignedFinalDeliverableUrl(path: string, expiresInSeconds = 3600, downloadFileName = "final-deliverables.zip") {
  return getStorage().sign(STORAGE_BUCKET_FINAL_DELIVERABLES, path, expiresInSeconds, downloadFileName);
}
export async function deleteStoredFiles(files: Array<{ bucket: string; path: string }>) { return getStorage().remove(files); }
export async function checkPrivateStorageHealth() { return getStorage().health(); }
