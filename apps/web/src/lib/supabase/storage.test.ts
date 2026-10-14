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

  it("uses a fresh immutable object path and disables upsert for every upload", async () => {
    const file = new File(["zip"], "final.zip", { type: "application/zip" });
    const first = await uploadFinalDeliverable({ projectId: "project-1", file });
    const second = await uploadFinalDeliverable({ projectId: "project-1", file });

    expect(first.path).toMatch(/^project-1\/finals\/[0-9a-f-]+\.zip$/);
    expect(second.path).toMatch(/^project-1\/finals\/[0-9a-f-]+\.zip$/);
    expect(second.path).not.toBe(first.path);
    expect(mocks.upload).toHaveBeenNthCalledWith(1, first.path, expect.any(Uint8Array), {
      contentType: "application/zip",
      upsert: false,
    });
    expect(mocks.upload).toHaveBeenNthCalledWith(2, second.path, expect.any(Uint8Array), {
      contentType: "application/zip",
      upsert: false,
    });
  });
});
