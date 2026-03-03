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
    fileAsset: { deleteMany: vi.fn() },
    message: { deleteMany: vi.fn() },
    projectEntitlement: { updateMany: vi.fn() },
    project: { update: vi.fn() },
  },
  prisma: {
    project: { findUnique: vi.fn() },
    fileAsset: { findMany: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock("@/lib/auth/require", () => ({
  requireUser: mocks.requireUser,
  requireAdmin: mocks.requireAdmin,
  toRouteErrorResponse: mocks.toRouteErrorResponse,
}));

vi.mock("@/lib/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/supabase/storage", () => ({ deleteStoredFiles: mocks.deleteStoredFiles }));
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

    mocks.prisma.project.findUnique.mockResolvedValue({ id: "p1", status: "CONCEPTS_READY", briefs: [{ id: "b1" }] });
    mocks.prisma.fileAsset.findMany.mockResolvedValue([{ id: "f1", bucket: "concepts", path: "p1/c1.png" }]);
    mocks.prisma.$transaction.mockImplementation(async (fn: (tx: typeof mocks.tx) => Promise<unknown>) => fn(mocks.tx));

    mocks.tx.revisionRequest.deleteMany.mockResolvedValue({ count: 2 });
    mocks.tx.conceptComment.deleteMany.mockResolvedValue({ count: 3 });
    mocks.tx.concept.deleteMany.mockResolvedValue({ count: 1 });
    mocks.tx.fileAsset.deleteMany.mockResolvedValue({ count: 1 });
    mocks.tx.message.deleteMany.mockResolvedValue({ count: 4 });
    mocks.tx.projectEntitlement.updateMany.mockResolvedValue({ count: 2 });
    mocks.tx.project.update.mockResolvedValue({ status: "BRIEF_SUBMITTED" });

    mocks.logAudit.mockResolvedValue(undefined);
    mocks.deleteStoredFiles.mockResolvedValue({ attempted: 1, deleted: 1, failures: [] });
  });

  it("returns forbidden for non-admin users", async () => {
    mocks.requireAdmin.mockRejectedValueOnce({ message: "Forbidden", status: 403, code: "FORBIDDEN" });

    const res = await POST(
      new Request("http://localhost/api/admin/projects/p1/reset", {
        method: "POST",
        headers: { "content-type": "application/json" },
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
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ confirm: true }),
      }),
      { params: Promise.resolve({ id: "p1" }) },
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("CONFIRM_REQUIRED");
  });

  it("performs clean-slate reset for confirmed admins", async () => {
    const res = await POST(
      new Request("http://localhost/api/admin/projects/p1/reset", {
        method: "POST",
        headers: { "content-type": "application/json" },
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
      revisionRequests: 2,
      conceptComments: 3,
      messages: 4,
    });
    expect(mocks.tx.projectEntitlement.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { projectId: "p1", key: { in: ["concepts", "revisions"] } },
        data: { consumedInt: 0 },
      }),
    );
  });
});
