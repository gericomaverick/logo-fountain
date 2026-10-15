import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  requireAdmin: vi.fn(),
  toRouteErrorResponse: vi.fn(),
  deleteStoredFiles: vi.fn(),
  logAudit: vi.fn(),
  tx: {
    revisionRequest: { deleteMany: vi.fn() },
    conceptComment: { deleteMany: vi.fn() },
    concept: { deleteMany: vi.fn() },
    fileAsset: { findMany: vi.fn(), deleteMany: vi.fn() },
    message: { deleteMany: vi.fn() },
    projectEntitlement: { updateMany: vi.fn() },
    project: { updateMany: vi.fn() },
  },
  prisma: {
    project: { findUnique: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock("@/lib/auth/require", () => ({
  requireUser: mocks.requireUser,
  requireAdmin: mocks.requireAdmin,
  toRouteErrorResponse: mocks.toRouteErrorResponse,
}));

vi.mock("@/lib/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/storage/r2", () => ({ deleteStoredFiles: mocks.deleteStoredFiles }));
vi.mock("@/lib/audit", () => ({ logAudit: mocks.logAudit }));

import { POST } from "./route";

describe("POST /api/admin/projects/[id]/reset", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.requireUser.mockResolvedValue({ id: "admin-1", email: "admin@example.com" });
    mocks.requireAdmin.mockResolvedValue(undefined);
    mocks.toRouteErrorResponse.mockImplementation((error: unknown) => {
      const routeError = error as { message?: string; code?: string; status?: number };
      if (typeof routeError?.status === "number") {
        return Response.json(
          { error: { message: routeError.message ?? "Route error", code: routeError.code ?? "UNKNOWN" } },
          { status: routeError.status },
        );
      }
      return Response.json({ error: { message: "Unexpected", code: "UNKNOWN" } }, { status: 500 });
    });

    mocks.prisma.project.findUnique.mockResolvedValue({ id: "p1", status: "CONCEPTS_READY", updatedAt: new Date("2026-03-01"), briefs: [{ id: "b1" }] });
    mocks.tx.project.updateMany.mockResolvedValue({ count: 1 });
    mocks.tx.fileAsset.findMany.mockResolvedValue([
      { id: "f1", kind: "concept", bucket: "concepts", path: "p1/c1.png" },
      { id: "z1", kind: "final_zip", bucket: "finals", path: "p1/finals/old.zip" },
    ]);
    mocks.prisma.$transaction.mockImplementation(async (fn: (tx: typeof mocks.tx) => Promise<unknown>) => fn(mocks.tx));

    mocks.tx.revisionRequest.deleteMany.mockResolvedValue({ count: 2 });
    mocks.tx.conceptComment.deleteMany.mockResolvedValue({ count: 3 });
    mocks.tx.concept.deleteMany.mockResolvedValue({ count: 1 });
    mocks.tx.fileAsset.deleteMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 1 });
    mocks.tx.message.deleteMany.mockResolvedValue({ count: 4 });
    mocks.tx.projectEntitlement.updateMany.mockResolvedValue({ count: 2 });
    mocks.logAudit.mockResolvedValue(undefined);
    mocks.deleteStoredFiles.mockResolvedValue({ attempted: 1, deleted: 1, failures: [] });
  });

  it("returns forbidden for non-admin users", async () => {
    mocks.requireAdmin.mockRejectedValueOnce({ message: "Forbidden", status: 403, code: "FORBIDDEN" });

    const res = await POST(
      new Request("http://localhost/api/admin/projects/p1/reset", {
        method: "POST",
        headers: { origin: "http://localhost", "content-type": "application/json" },
        body: JSON.stringify({ confirm: true, mode: "clean-slate" }),
      }),
      { params: Promise.resolve({ id: "p1" }) },
    );

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error.code).toBe("FORBIDDEN");
  });

  it("requires explicit confirm and mode", async () => {
    const res = await POST(
      new Request("http://localhost/api/admin/projects/p1/reset", {
        method: "POST",
        headers: { origin: "http://localhost", "content-type": "application/json" },
        body: JSON.stringify({ confirm: true }),
      }),
      { params: Promise.resolve({ id: "p1" }) },
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("CONFIRM_REQUIRED");
  });

  it("returns a conflict without deleting anything when project/final publication changed concurrently", async () => {
    mocks.tx.project.updateMany.mockResolvedValueOnce({ count: 0 });
    const res = await POST(
      new Request("http://localhost/api/admin/projects/p1/reset", {
        method: "POST",
        headers: { origin: "http://localhost", "content-type": "application/json" },
        body: JSON.stringify({ confirm: true, mode: "clean-slate" }),
      }),
      { params: Promise.resolve({ id: "p1" }) },
    );
    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toMatchObject({ error: { code: "PROJECT_RESET_CONFLICT" } });
    expect(mocks.tx.fileAsset.deleteMany).not.toHaveBeenCalled();
  });

  it("performs clean-slate reset for confirmed admins", async () => {
    const res = await POST(
      new Request("http://localhost/api/admin/projects/p1/reset", {
        method: "POST",
        headers: { origin: "http://localhost", "content-type": "application/json" },
        body: JSON.stringify({ confirm: true, mode: "clean-slate" }),
      }),
      { params: Promise.resolve({ id: "p1" }) },
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.deleted).toMatchObject({
      concepts: 1,
      conceptAssets: 1,
      finalPublications: 1,
      revisionRequests: 2,
      conceptComments: 3,
      messages: 4,
    });
    expect(mocks.tx.projectEntitlement.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { projectId: "p1", key: { in: ["concepts", "revisions"] } },
        data: { consumedInt: 0, reservedInt: 0 },
      }),
    );
    expect(body.retainedFinalStorageObjects).toEqual([{ bucket: "finals", path: "p1/finals/old.zip" }]);
    expect(mocks.deleteStoredFiles).not.toHaveBeenCalled();
    expect(body.retainedConceptStorageObjects).toEqual([{ bucket: "concepts", path: "p1/c1.png" }]);
    expect(body.storageCleanup).toEqual({ attempted: 0, deleted: 0, failures: [] });
    expect(mocks.logAudit).toHaveBeenCalledWith(mocks.tx, expect.objectContaining({
      payload: expect.objectContaining({ retainedFinalStorageObjects: [{ bucket: "finals", path: "p1/finals/old.zip" }] }),
    }));
  });
});
