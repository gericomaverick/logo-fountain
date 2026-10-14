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
    prisma: {
      revisionRequest: { findMany: vi.fn() },
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

import { GET } from "./route";

function getFor(id: string) {
  return GET(new Request("http://localhost"), { params: Promise.resolve({ id }) });
}

describe("GET /api/admin/projects/[id]/revision-requests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireUser.mockResolvedValue({ id: "admin-1", email: "admin@example.com" });
    mocks.requireAdmin.mockResolvedValue(undefined);
    mocks.prisma.revisionRequest.findMany.mockResolvedValue([]);
  });

  it("returns 401 for unauthenticated callers", async () => {
    mocks.requireUser.mockRejectedValue(new mocks.RouteAuthError("Unauthorized", 401, "UNAUTHORIZED"));

    const res = await getFor("p1");

    expect(res.status).toBe(401);
    expect(mocks.prisma.revisionRequest.findMany).not.toHaveBeenCalled();
  });

  it("returns 403 for non-admin users", async () => {
    mocks.requireAdmin.mockRejectedValue(new mocks.RouteAuthError("Forbidden", 403, "FORBIDDEN"));

    const res = await getFor("p1");

    expect(res.status).toBe(403);
    expect(mocks.prisma.revisionRequest.findMany).not.toHaveBeenCalled();
  });

  it("lists revision requests scoped to the project", async () => {
    mocks.prisma.revisionRequest.findMany.mockResolvedValue([
      {
        id: "r1",
        status: "requested",
        body: "Please tweak the kerning",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        concept: { id: "c1", number: 1 },
        user: { id: "u1", email: "client@example.com", fullName: "Client" },
      },
    ]);

    const res = await getFor("p1");
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.revisionRequests).toHaveLength(1);
    expect(mocks.prisma.revisionRequest.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { projectId: "p1" } }),
    );
  });
});
