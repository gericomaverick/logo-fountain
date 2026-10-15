import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  upload: vi.fn(),
  from: vi.fn(),
  createSupabaseAdminClient: vi.fn(),
  createSignedUrl: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: mocks.createSupabaseAdminClient }));

import { uploadFinalDeliverable, createSignedFinalDeliverableUrl, createSignedConceptAssetUrl, uploadConceptAsset } from "./storage";

describe("uploadFinalDeliverable", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.upload.mockResolvedValue({ error: null });
    mocks.createSignedUrl.mockResolvedValue({ data: { signedUrl: "https://example.test/signed" }, error:null });
    mocks.from.mockReturnValue({ upload: mocks.upload, createSignedUrl: mocks.createSignedUrl });
    mocks.createSupabaseAdminClient.mockReturnValue({ storage: { from: mocks.from } });
  });

  it("uses a fresh immutable path with canonical safe metadata and disables upsert", async () => {
    const upload = {
      bytes: new Uint8Array([1, 2, 3]),
      extension: "zip" as const,
      contentType: "application/zip" as const,
      size: 3,
    };
    const first = await uploadFinalDeliverable({ projectId: "project-1", upload });
    const second = await uploadFinalDeliverable({ projectId: "project-1", upload });

    expect(first.path).toMatch(/^project-1\/finals\/[0-9a-f-]+\.zip$/);
    expect(second.path).toMatch(/^project-1\/finals\/[0-9a-f-]+\.zip$/);
    expect(second.path).not.toBe(first.path);
    const safeOptions = {
      contentType: "application/zip",
      cacheControl: "3600",
      upsert: false,
    };
    expect(mocks.upload).toHaveBeenNthCalledWith(1, first.path, upload.bytes, safeOptions);
    expect(mocks.upload).toHaveBeenNthCalledWith(2, second.path, upload.bytes, safeOptions);
  });
  it("uses SDK download options for signed finals, not arbitrary custom metadata", async () => {
    await createSignedFinalDeliverableUrl("p/final.zip");
    expect(mocks.createSignedUrl).toHaveBeenLastCalledWith("p/final.zip",3600,{download:"final-deliverables.zip"});
    await createSignedFinalDeliverableUrl("p/final.zip", 3600, "logo.zip");
    expect(mocks.createSignedUrl).toHaveBeenLastCalledWith("p/final.zip",3600,{download:"logo.zip"});
    await createSignedConceptAssetUrl("p/image.png");
    expect(mocks.createSignedUrl).toHaveBeenLastCalledWith("p/image.png",3600);
  });
  it("concept uploads default to immutable canonical MIME options", async () => {
    const upload = {bytes:new Uint8Array([1]),extension:"png" as const,contentType:"image/png" as const,size:1};
    await uploadConceptAsset({bucketPath:"p/c/v1.unique.png",upload});
    expect(mocks.upload).toHaveBeenCalledWith("p/c/v1.unique.png",upload.bytes,{contentType:"image/png",cacheControl:"3600",upsert:false});
  });

});
