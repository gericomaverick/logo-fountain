import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  upload: vi.fn(),
  from: vi.fn(),
  createSupabaseAdminClient: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: mocks.createSupabaseAdminClient }));

import { uploadFinalDeliverable } from "./storage";

describe("uploadFinalDeliverable", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.upload.mockResolvedValue({ error: null });
    mocks.from.mockReturnValue({ upload: mocks.upload });
    mocks.createSupabaseAdminClient.mockReturnValue({ storage: { from: mocks.from } });
  });

  it("uses a fresh immutable path with canonical safe metadata and disables upsert", async () => {
    const upload = {
      bytes: new Uint8Array([1, 2, 3]),
      extension: "zip" as const,
      contentType: "application/zip" as const,
      contentDisposition: 'attachment; filename="final-deliverables.zip"',
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
      metadata: { contentDisposition: 'attachment; filename="final-deliverables.zip"' },
      upsert: false,
    };
    expect(mocks.upload).toHaveBeenNthCalledWith(1, first.path, upload.bytes, safeOptions);
    expect(mocks.upload).toHaveBeenNthCalledWith(2, second.path, upload.bytes, safeOptions);
  });
});
