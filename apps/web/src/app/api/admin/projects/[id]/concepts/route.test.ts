import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const tx = {
    fileAsset: { create: vi.fn() },
    project: { update: vi.fn() },
    projectEntitlement: { findFirst: vi.fn() },
    revisionRequest: { updateMany: vi.fn() },
    $executeRaw: vi.fn(),
  };

  return {
    requireUser: vi.fn(),
    requireAdmin: vi.fn(),
    toRouteErrorResponse: vi.fn(),
    uploadConceptAsset: vi.fn(),
    createSignedConceptAssetUrl: vi.fn(),
    logAudit: vi.fn(),
    createProjectSystemMessage: vi.fn(),
    notifyClientConceptReady: vi.fn(),
    prisma: {
      project: { findUnique: vi.fn() },
      concept: { findUnique: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(), upsert: vi.fn(), update: vi.fn(), count: vi.fn() },
      revisionRequest: { groupBy: vi.fn(), findMany: vi.fn() },
      fileAsset: { findMany: vi.fn() },
      projectReadState: { findMany: vi.fn() },
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
  createSignedConceptAssetUrl: mocks.createSignedConceptAssetUrl,
}));
vi.mock("@/lib/audit", () => ({ logAudit: mocks.logAudit }));
vi.mock("@/lib/system-messages", () => ({ createProjectSystemMessage: mocks.createProjectSystemMessage }));
vi.mock("@/lib/project-lifecycle-email", () => ({ notifyClientConceptReady: mocks.notifyClientConceptReady }));

import { GET, POST } from "./route";

describe("/api/admin/projects/[id]/concepts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireUser.mockResolvedValue({ id: "admin-1" });
    mocks.requireAdmin.mockResolvedValue(undefined);
    mocks.toRouteErrorResponse.mockImplementation((err: Error) =>
      Response.json({ error: { message: err.message, code: "ERR" } }, { status: 500 }),
    );

    mocks.prisma.project.findUnique.mockResolvedValue({ id: "p1", status: "BRIEF_SUBMITTED" });
    mocks.prisma.concept.findUnique.mockResolvedValue(null);
    mocks.prisma.concept.findFirst.mockResolvedValue({ id: "c1", number: 1, status: "published", notes: null });
    mocks.prisma.concept.findMany.mockResolvedValue([]);
    mocks.prisma.concept.upsert.mockResolvedValue({ id: "c1", number: 1, status: "published", notes: null });
    mocks.prisma.concept.update.mockResolvedValue({ id: "c1", number: 1, status: "published", notes: null });
    mocks.prisma.concept.count.mockResolvedValue(0);
    mocks.prisma.revisionRequest.groupBy.mockResolvedValue([]);
    mocks.prisma.revisionRequest.findMany.mockResolvedValue([]);
    mocks.prisma.fileAsset.findMany.mockResolvedValue([]);
    mocks.uploadConceptAsset.mockResolvedValue({ bucket: "b", path: "p", mime: "image/png", size: 123 });
    mocks.createSignedConceptAssetUrl.mockResolvedValue("https://example.com/image.png");
    mocks.tx.projectEntitlement.findFirst.mockResolvedValue({ id: "ent1", key: "concepts", limitInt: 2, consumedInt: 0 });
    mocks.tx.$executeRaw.mockResolvedValue(1);
    mocks.tx.fileAsset.create.mockResolvedValue(undefined);
    mocks.tx.project.update.mockResolvedValue({ status: "CONCEPTS_READY" });
    mocks.tx.revisionRequest.updateMany.mockResolvedValue({ count: 0 });
    mocks.logAudit.mockResolvedValue(undefined);
    mocks.createProjectSystemMessage.mockResolvedValue(undefined);
    mocks.notifyClientConceptReady.mockResolvedValue(undefined);
  });

  it("GET keeps unresolved feedback tied to revision-request status and reports unassigned pending revisions", async () => {
    mocks.prisma.project.findUnique.mockResolvedValue({ status: "CONCEPTS_READY" });
    mocks.prisma.concept.findMany.mockResolvedValue([
      { id: "c1", number: 1, status: "published", notes: null, createdAt: new Date("2026-03-01T10:00:00Z") },
      { id: "c2", number: 2, status: "published", notes: null, createdAt: new Date("2026-03-01T11:00:00Z") },
    ]);
    mocks.prisma.revisionRequest.groupBy.mockResolvedValue([
      { conceptId: "c1", _count: { _all: 1 } },
      { conceptId: null, _count: { _all: 1 } },
    ]);
    const res = await GET(new Request("http://localhost", { method: "GET" }), {
      params: Promise.resolve({ id: "p1" }),
    });

    expect(res.status).toBe(200);
    const payload = await res.json();
    expect(payload.concepts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "c1", pendingRevisionCount: 1, unresolvedFeedbackCount: 1 }),
        expect.objectContaining({ id: "c2", pendingRevisionCount: 0, unresolvedFeedbackCount: 0 }),
      ]),
    );
    expect(payload.conceptlessPendingRevisionCount).toBe(1);
    expect(mocks.prisma.projectReadState.findMany).not.toHaveBeenCalled();
  });

  it("POST accepts first concept upload from BRIEF_SUBMITTED and transitions to CONCEPTS_READY", async () => {
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
    expect(mocks.tx.revisionRequest.updateMany).not.toHaveBeenCalled();
    expect(mocks.createProjectSystemMessage).toHaveBeenCalledWith(
      mocks.tx,
      expect.objectContaining({ projectId: "p1", fallbackUserId: "admin-1", body: "Concept 1 is ready for review." }),
    );
    expect(mocks.logAudit).toHaveBeenCalledWith(
      mocks.tx,
      expect.objectContaining({ type: "state_changed", payload: { previousStatus: "BRIEF_SUBMITTED", nextStatus: "CONCEPTS_READY" } }),
    );
    expect(mocks.notifyClientConceptReady).toHaveBeenCalledWith("p1", "c1");
  });

  it("POST revision upload clears pending feedback only via delivery transition", async () => {
    mocks.prisma.project.findUnique.mockResolvedValue({ id: "p1", status: "CONCEPTS_READY" });
    mocks.prisma.fileAsset.findMany.mockResolvedValue([{ path: "p1/c1/v2.png" }]);
    mocks.tx.revisionRequest.updateMany.mockResolvedValue({ count: 2 });

    const formData = new FormData();
    formData.set("file", new File([new Uint8Array([1, 2, 3])], "revision.png", { type: "image/png" }));
    formData.set("uploadMode", "revision");
    formData.set("conceptId", "c1");

    const res = await POST(new Request("http://localhost", { method: "POST", body: formData }), {
      params: Promise.resolve({ id: "p1" }),
    });
    const payload = await res.json().catch(() => null);

    expect(res.status, JSON.stringify(payload)).toBe(200);
    expect(mocks.tx.revisionRequest.updateMany).toHaveBeenCalledWith({
      where: { projectId: "p1", conceptId: "c1", status: { not: "delivered" } },
      data: { status: "delivered" },
    });
    expect(mocks.logAudit).toHaveBeenCalledWith(
      mocks.tx,
      expect.objectContaining({
        type: "concept_revision_uploaded",
        payload: expect.objectContaining({ deliveredRevisionRequests: 2 }),
      }),
    );
    expect(mocks.notifyClientConceptReady).not.toHaveBeenCalled();
  });
});
