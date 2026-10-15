import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { createHash } from "node:crypto";
import { DeleteObjectCommand, HeadBucketCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
import { PrivateR2Storage, safeDownloadDisposition, signedUrlExpiry, uploadFinalDeliverable } from "./r2";

const bytes = new Uint8Array([1, 2, 3]);
const upload = { bytes, extension: "zip" as const, contentType: "application/zip" as const, size: 3 };
const buckets = { concepts: "test-concepts", "final-deliverables": "test-finals" };
function fixture() {
  const client = new S3Client({ region: "auto", endpoint: "https://00000000000000000000000000000000.r2.cloudflarestorage.com", credentials: { accessKeyId: "test-access-key", secretAccessKey: "test-secret-key" } });
  const send = vi.spyOn(client, "send").mockResolvedValue({} as never);
  return { client, send, storage: new PrivateR2Storage(client, buckets) };
}
afterEach(() => vi.unstubAllEnvs());

describe("private R2 adapter", () => {
  it("uses conditional immutable uploads, canonical MIME and byte integrity metadata", async () => {
    const { send, storage } = fixture();
    expect(await storage.upload("concepts", "p/c/v1.unique.zip", upload)).toEqual({ bucket: "concepts", path: "p/c/v1.unique.zip", mime: "application/zip", size: 3 });
    expect(send.mock.calls[0][0]).toBeInstanceOf(PutObjectCommand);
    expect(send.mock.calls[0][0].input).toMatchObject({ Bucket: "test-concepts", Key: "p/c/v1.unique.zip", Body: bytes, ContentType: "application/zip", ContentLength: 3, IfNoneMatch: "*", CacheControl: "private, max-age=3600", ContentMD5: createHash("md5").update(bytes).digest("base64"), Metadata: { sha256: createHash("sha256").update(bytes).digest("hex") } });
  });
  it("fails closed on collision and never retries with overwrite enabled", async () => {
    const { send, storage } = fixture();
    send.mockRejectedValueOnce(Object.assign(new Error("conditional collision"), { name: "PreconditionFailed" }));
    await expect(storage.upload("concepts", "p/c/file.zip", upload)).rejects.toThrow("conditional collision");
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0].input).toHaveProperty("IfNoneMatch", "*");
  });
  it("uses fresh immutable final object paths", async () => {
    for (const [key, value] of Object.entries({ R2_ACCOUNT_ID: "0".repeat(32), R2_ACCESS_KEY_ID: "test", R2_SECRET_ACCESS_KEY: "test", R2_CONCEPTS_BUCKET: "test-concepts", R2_FINAL_DELIVERABLES_BUCKET: "test-finals" })) vi.stubEnv(key, value);
    const send = vi.spyOn(S3Client.prototype, "send").mockResolvedValue({} as never);
    try {
      const a = await uploadFinalDeliverable({ projectId: "p", upload });
      const b = await uploadFinalDeliverable({ projectId: "p", upload });
      expect(a.path).toMatch(/^p\/finals\/[0-9a-f-]+\.zip$/);
      expect(b.path).not.toBe(a.path);
      expect(send.mock.calls[0][0].input).toHaveProperty("IfNoneMatch", "*");
    } finally { send.mockRestore(); }
  });
  it.each([0, -1, 3601, 1.5, NaN, Infinity])("rejects invalid expiry %s before signing", async (ttl) => {
    const { storage } = fixture();
    expect(() => signedUrlExpiry(ttl)).toThrow();
    await expect(storage.sign("concepts", "p/file.png", ttl)).rejects.toThrow();
  });
  it.each(["../private", "/absolute", "p/../file", "p//file", "p\\file", "p/file\r\n"]) ("rejects invalid key %s", async (key) => {
    const { storage, send } = fixture();
    await expect(storage.upload("concepts", key, upload)).rejects.toThrow();
    await expect(storage.sign("concepts", key)).rejects.toThrow();
    expect(send).not.toHaveBeenCalled();
  });
  it("generates actual AWS SigV4 URLs with signed expiry and safe response disposition", async () => {
    const { storage } = fixture();
    const url = new URL(await storage.sign("final-deliverables", "p/final.zip", 3600, 'Lógó/"\r\nInjected: yes.zip'));
    expect(url.protocol).toBe("https:");
    expect(url.searchParams.get("X-Amz-Expires")).toBe("3600");
    expect(url.searchParams.get("X-Amz-Algorithm")).toBe("AWS4-HMAC-SHA256");
    expect(url.searchParams.get("X-Amz-Signature")).toMatch(/^[a-f0-9]{64}$/);
    const disposition = url.searchParams.get("response-content-disposition")!;
    expect(disposition).toBe(safeDownloadDisposition('Lógó/"\r\nInjected: yes.zip'));
    expect(disposition).not.toMatch(/[\r\n]/);
    expect(disposition).toContain("filename*=UTF-8''L%C3%B3g%C3%B3");
    expect(new URL(await storage.sign("concepts", "p/image.png", 1)).searchParams.has("response-content-disposition")).toBe(false);
  });
  it("bounds and sanitizes unusual filenames including malformed unicode", () => {
    expect(safeDownloadDisposition(" ")).toContain('filename="final-deliverables.zip"');
    expect(safeDownloadDisposition("x".repeat(10000)).length).toBeLessThan(400);
    expect(() => safeDownloadDisposition("\ud800.zip")).not.toThrow();
    expect(safeDownloadDisposition('a\\b;".zip')).toContain('filename="a_b__.zip"');
  });
  it("health checks only configured bucket HEADs and hides errors", async () => {
    const { storage, send } = fixture();
    send.mockRejectedValueOnce(new Error("secret-diagnostic"));
    expect(await storage.health()).toEqual([{ bucket: "concepts", passed: false }, { bucket: "final-deliverables", passed: true }]);
    expect(send.mock.calls.every(([command]) => command instanceof HeadBucketCommand)).toBe(true);
  });
  it("cleanup is namespace-confined and reports only confirmed acknowledgements", async () => {
    const { storage, send } = fixture();
    send.mockRejectedValueOnce(new Error("secret-diagnostic"));
    const result = await storage.remove([{ bucket: "concepts", path: "p/a" }, { bucket: "final-deliverables", path: "p/b" }, { bucket: "unknown", path: "p/c" }]);
    expect(result).toMatchObject({ attempted: 3, deleted: 1 });
    expect(result.failures).toHaveLength(2);
    expect(JSON.stringify(result)).not.toContain("secret-diagnostic");
    expect(send.mock.calls.every(([command]) => command instanceof DeleteObjectCommand)).toBe(true);
  });
  it("serializes If-None-Match and preserves existing bytes against a local HTTP S3 protocol harness", async () => {
    const objects = new Map<string, Buffer>();
    const observed: Array<{ condition?: string; authorization?: string }> = [];
    const server = createServer(async (req, res) => {
      const chunks = [];
      for await (const chunk of req) chunks.push(Buffer.from(chunk));
      observed.push({ condition: req.headers["if-none-match"], authorization: req.headers.authorization });
      const key = req.url!.split("?")[0];
      if (req.method === "PUT" && req.headers["if-none-match"] === "*" && objects.has(key)) {
        res.writeHead(412, { "Content-Type": "application/xml" }); res.end("<Error><Code>PreconditionFailed</Code></Error>"); return;
      }
      objects.set(key, Buffer.concat(chunks)); res.writeHead(200, { ETag: '"test"' }); res.end();
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const client = new S3Client({ region: "auto", endpoint: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, forcePathStyle: true, credentials: { accessKeyId: "test", secretAccessKey: "test" }, requestChecksumCalculation: "WHEN_REQUIRED", maxAttempts: 1 });
    try {
      const storage = new PrivateR2Storage(client, buckets);
      await storage.upload("concepts", "p/file.zip", upload);
      await expect(storage.upload("concepts", "p/file.zip", { ...upload, bytes: new Uint8Array([9, 9, 9]) })).rejects.toMatchObject({ name: "PreconditionFailed" });
      expect(objects.get("/test-concepts/p/file.zip")).toEqual(Buffer.from(bytes));
      expect(observed).toHaveLength(2);
      expect(observed.every((item) => item.condition === "*" && item.authorization?.startsWith("AWS4-HMAC-SHA256"))).toBe(true);
    } finally { client.destroy(); await new Promise<void>((resolve, reject) => server.close((err) => err ? reject(err) : resolve())); }
  });
});
