import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  class RouteAuthError extends Error {
    status: number;
    code: string;

    constructor(message: string, status: number, code: string) {
      super(message);
      this.status = status;
      this.code = code;
    }
  }

  return {
    RouteAuthError,
    requireUser: vi.fn(),
    requireAdmin: vi.fn(),
    logAudit: vi.fn(),
    prisma: {
      projectEntitlement: { findFirst: vi.fn(), updateMany: vi.fn() },
    },
  };
});

vi.mock("@/lib/auth/require", () => ({
  RouteAuthError: mocks.RouteAuthError,
  requireUser: mocks.requireUser,
  requireAdmin: mocks.requireAdmin,
  toRouteErrorResponse: (error: unknown) => {
    if (error instanceof mocks.RouteAuthError) {
      return Response.json({ error: { message: error.message, code: error.code } }, { status: error.status });
    }
    throw error;
  },
}));

vi.mock("@/lib/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/audit", () => ({ logAudit: mocks.logAudit }));

import { POST } from "./route";

function postReset(id: string, body: unknown) {
  return POST(
    new Request("http://localhost", { headers: { origin: "http://localhost" }, method: "POST", body: JSON.stringify(body) }),
    { params: Promise.resolve({ id }) },
  );
}

describe("POST /api/admin/projects/[id]/entitlements/reset", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireUser.mockResolvedValue({ id: "admin-1", email: "admin@example.com" });
    mocks.requireAdmin.mockResolvedValue(undefined);
    mocks.prisma.projectEntitlement.findFirst
      .mockResolvedValueOnce({ id: "e1", limitInt: 3, consumedInt: 2 })
      .mockResolvedValueOnce({ id: "e1", limitInt: 3, consumedInt: 0 });
    mocks.prisma.projectEntitlement.updateMany.mockResolvedValue({ count: 1 });
    mocks.logAudit.mockResolvedValue(undefined);
  });

  it("returns 403 for non-admin users", async () => {
    mocks.requireAdmin.mockRejectedValue(new mocks.RouteAuthError("Forbidden", 403, "FORBIDDEN"));

    const res = await postReset("p1", { key: "concepts" });

    expect(res.status).toBe(403);
    expect(mocks.prisma.projectEntitlement.updateMany).not.toHaveBeenCalled();
  });

  it("rejects unsupported keys", async () => {
    const res = await postReset("p1", { key: "downloads" });
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error.code).toBe("INVALID_KEY");
  });

  it("requires explicit confirmation to reset revisions", async () => {
    const res = await postReset("p1", { key: "revisions" });
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error.code).toBe("CONFIRM_REQUIRED");
    expect(mocks.prisma.projectEntitlement.updateMany).not.toHaveBeenCalled();
  });

  it("resets consumed usage and records before/after in the audit log", async () => {
    const res = await postReset("p1", { key: "concepts" });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toMatchObject({
      ok: true,
      key: "concepts",
      before: { consumedInt: 2 },
      after: { consumedInt: 0 },
    });
    expect(mocks.prisma.projectEntitlement.updateMany).toHaveBeenCalledWith({
      where: { projectId: "p1", key: "concepts" },
      data: { consumedInt: 0 },
    });
    expect(mocks.logAudit).toHaveBeenCalledWith(
      mocks.prisma,
      expect.objectContaining({ type: "entitlement_usage_reset" }),
    );
  });
});
