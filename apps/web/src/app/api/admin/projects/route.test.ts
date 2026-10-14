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
      project: { findMany: vi.fn() },
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

describe("GET /api/admin/projects", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireUser.mockResolvedValue({ id: "admin-1", email: "admin@example.com" });
    mocks.requireAdmin.mockResolvedValue(undefined);
    mocks.prisma.project.findMany.mockResolvedValue([]);
  });

  it("returns 401 for unauthenticated callers", async () => {
    mocks.requireUser.mockRejectedValue(new mocks.RouteAuthError("Unauthorized", 401, "UNAUTHORIZED"));

    const res = await GET(new Request("http://localhost/api/admin/projects"));

    expect(res.status).toBe(401);
    expect(mocks.prisma.project.findMany).not.toHaveBeenCalled();
  });

  it("returns 403 for non-admin users", async () => {
    mocks.requireAdmin.mockRejectedValue(new mocks.RouteAuthError("Forbidden", 403, "FORBIDDEN"));

    const res = await GET(new Request("http://localhost/api/admin/projects"));

    expect(res.status).toBe(403);
    expect(mocks.prisma.project.findMany).not.toHaveBeenCalled();
  });

  it("filters by status when provided", async () => {
    const res = await GET(new Request("http://localhost/api/admin/projects?status=IN_PROGRESS"));

    expect(res.status).toBe(200);
    expect(mocks.prisma.project.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: "IN_PROGRESS" } }),
    );
  });

  it("flags projects whose latest order never fulfilled", async () => {
    mocks.prisma.project.findMany.mockResolvedValue([
      {
        id: "p1",
        status: "IN_PROGRESS",
        packageCode: "essential",
        createdAt: new Date("2026-03-01T00:00:00.000Z"),
        client: { name: "Acme" },
        orders: [{ id: "o1", status: "PENDING", stripeCheckoutSessionId: "cs_1", createdAt: new Date() }],
      },
      {
        id: "p2",
        status: "IN_PROGRESS",
        packageCode: "essential",
        createdAt: new Date("2026-03-01T00:00:00.000Z"),
        client: { name: "Beta" },
        orders: [],
      },
      {
        id: "p3",
        status: "IN_PROGRESS",
        packageCode: "essential",
        createdAt: new Date("2026-03-01T00:00:00.000Z"),
        client: { name: "Gamma" },
        orders: [{ id: "o3", status: "FULFILLED", stripeCheckoutSessionId: "cs_3", createdAt: new Date() }],
      },
    ]);

    const res = await GET(new Request("http://localhost/api/admin/projects"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.projects.map((p: { id: string; stuck: boolean }) => [p.id, p.stuck])).toEqual([
      ["p1", true],
      ["p2", true],
      ["p3", false],
    ]);
    expect(body.projects[0].stuckReason).toBe("Order status is PENDING.");
    expect(body.projects[1].stuckReason).toBe("Missing order record (webhook likely never fulfilled).");
  });
});
