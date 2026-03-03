import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const tx = {
    fileAsset: { create: vi.fn() },
    project: { update: vi.fn() },
    projectEntitlement: { findFirst: vi.fn() },
    $executeRaw: vi.fn(),
  };

  return {
    requireUser: vi.fn(),
    requireAdmin: vi.fn(),
    toRouteErrorResponse: vi.fn(),
    uploadConceptAsset: vi.fn(),
    logAudit: vi.fn(),
    createProjectSystemMessage: vi.fn(),
    prisma: {
      project: { findUnique: vi.fn() },
      concept: { findUnique: vi.fn(), upsert: vi.fn(), count: vi.fn() },
      $transaction: vi.fn(async (fn: (trx: typeof tx) => Promise<unknown>) => fn(tx)),
    },
    tx,
  };
});

vi.mock("@/lib/auth/require", () => ({
  requireUser: mocks.requireUser,
  requireAdmin: mocks.requireAdmin,
  toRouteErrorResponse: mocks.toRouteErrorResponse,
}));
vi.mock("@/lib/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/supabase/storage", () => ({
  uploadConceptAsset: mocks.uploadConceptAsset,
  inferExtension: () => "png",
  createSignedConceptAssetUrl: vi.fn(),
}));
vi.mock("@/lib/audit", () => ({ logAudit: mocks.logAudit }));
vi.mock("@/lib/system-messages", () => ({ createProjectSystemMessage: mocks.createProjectSystemMessage }));

import { POST } from "./route";

describe("POST /api/admin/projects/[id]/concepts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireUser.mockResolvedValue({ id: "admin-1" });
    mocks.requireAdmin.mockResolvedValue(undefined);
    mocks.toRouteErrorResponse.mockImplementation((err: Error) =>
      Response.json({ error: { message: err.message, code: "ERR" } }, { status: 500 }),
    );

    mocks.prisma.project.findUnique.mockResolvedValue({ id: "p1", status: "BRIEF_SUBMITTED" });
    mocks.prisma.concept.findUnique.mockResolvedValue(null);
    mocks.prisma.concept.upsert.mockResolvedValue({ id: "c1", number: 1, status: "published", notes: null });
    mocks.prisma.concept.count.mockResolvedValue(0);
    mocks.uploadConceptAsset.mockResolvedValue({ bucket: "b", path: "p", mime: "image/png", size: 123 });
    mocks.tx.projectEntitlement.findFirst.mockResolvedValue({ id: "ent1", key: "concepts", limitInt: 2, consumedInt: 0 });
    mocks.tx.$executeRaw.mockResolvedValue(1);
    mocks.tx.fileAsset.create.mockResolvedValue(undefined);
    mocks.tx.project.update.mockResolvedValue({ status: "CONCEPTS_READY" });
    mocks.logAudit.mockResolvedValue(undefined);
    mocks.createProjectSystemMessage.mockResolvedValue(undefined);
  });

  it("accepts first concept upload from BRIEF_SUBMITTED and transitions to CONCEPTS_READY", async () => {
    const formData = new FormData();
    formData.set("file", new File([new Uint8Array([1, 2, 3])], "concept.png", { type: "image/png" }));
    formData.set("conceptNumber", "1");
    formData.set("notes", "Primary concept explainer");

    const res = await POST(new Request("http://localhost", { method: "POST", body: formData }), {
      params: Promise.resolve({ id: "p1" }),
    });

    expect(res.status).toBe(200);
    const payload = await res.json();
    expect(payload.ok).toBe(true);
    expect(payload.projectStatus).toBe("CONCEPTS_READY");
    expect(mocks.tx.project.update).toHaveBeenCalledWith({ where: { id: "p1" }, data: { status: "CONCEPTS_READY" } });
    expect(mocks.tx.fileAsset.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ notes: null }),
      }),
    );
    expect(mocks.createProjectSystemMessage).toHaveBeenCalledWith(
      mocks.tx,
      expect.objectContaining({ projectId: "p1", fallbackUserId: "admin-1", body: "Concept 1 is ready for review." }),
    );
    expect(mocks.logAudit).toHaveBeenCalledWith(
      mocks.tx,
      expect.objectContaining({ type: "state_changed", payload: { previousStatus: "BRIEF_SUBMITTED", nextStatus: "CONCEPTS_READY" } }),
    );
  });
});
