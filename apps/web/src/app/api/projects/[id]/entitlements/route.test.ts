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
    requireProjectMembership: vi.fn(),
    prisma: {
      projectEntitlement: { findMany: vi.fn() },
    },
  };
});

vi.mock("@/lib/auth/require", () => ({
  RouteAuthError: mocks.RouteAuthError,
  requireUser: mocks.requireUser,
  requireProjectMembership: mocks.requireProjectMembership,
  toRouteErrorResponse: (error: unknown) => {
    if (error instanceof mocks.RouteAuthError) {
      return Response.json({ error: { message: error.message, code: error.code } }, { status: error.status });
    }
    throw error;
  },
}));

vi.mock("@/lib/prisma", () => ({ prisma: mocks.prisma }));

import { GET } from "./route";

function getFor(id: string) {
  return GET(new Request("http://localhost"), { params: Promise.resolve({ id }) });
}

describe("GET /api/projects/[id]/entitlements", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireUser.mockResolvedValue({ id: "u1", email: "client@example.com" });
    mocks.requireProjectMembership.mockResolvedValue({ id: "p1", clientId: "c1" });
    mocks.prisma.projectEntitlement.findMany.mockResolvedValue([]);
  });

  it("returns 401 for unauthenticated callers", async () => {
    mocks.requireUser.mockRejectedValue(new mocks.RouteAuthError("Unauthorized", 401, "UNAUTHORIZED"));

    const res = await getFor("p1");

    expect(res.status).toBe(401);
    expect(mocks.prisma.projectEntitlement.findMany).not.toHaveBeenCalled();
  });

  it("returns 404 for non-members (cross-tenant)", async () => {
    mocks.requireProjectMembership.mockRejectedValue(
      new mocks.RouteAuthError("Project not found", 404, "PROJECT_NOT_FOUND"),
    );

    const res = await getFor("someone-elses-project");

    expect(res.status).toBe(404);
    expect(mocks.prisma.projectEntitlement.findMany).not.toHaveBeenCalled();
  });

  it("computes remaining allowance net of consumed and reserved", async () => {
    mocks.prisma.projectEntitlement.findMany.mockResolvedValue([
      { key: "concepts", limitInt: 3, consumedInt: 1, reservedInt: null },
      { key: "revisions", limitInt: 2, consumedInt: 1, reservedInt: 1 },
    ]);

    const res = await getFor("p1");
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.entitlements).toEqual({ concepts: 2, revisions: 0 });
  });

  it("never returns negative remaining counts", async () => {
    mocks.prisma.projectEntitlement.findMany.mockResolvedValue([
      { key: "revisions", limitInt: 1, consumedInt: 2, reservedInt: 1 },
    ]);

    const res = await getFor("p1");
    const body = await res.json();

    expect(body.entitlements.revisions).toBe(0);
  });
});
