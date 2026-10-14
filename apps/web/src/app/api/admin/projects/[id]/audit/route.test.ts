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
      auditEvent: { findMany: vi.fn() },
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

describe("GET /api/admin/projects/[id]/audit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireUser.mockResolvedValue({ id: "admin-1", email: "admin@example.com" });
    mocks.requireAdmin.mockResolvedValue(undefined);
    mocks.prisma.auditEvent.findMany.mockResolvedValue([]);
  });

  it("returns 401 for unauthenticated callers", async () => {
    mocks.requireUser.mockRejectedValue(new mocks.RouteAuthError("Unauthorized", 401, "UNAUTHORIZED"));

    const res = await getFor("p1");

    expect(res.status).toBe(401);
    expect(mocks.prisma.auditEvent.findMany).not.toHaveBeenCalled();
  });

  it("returns 403 for non-admin users", async () => {
    mocks.requireAdmin.mockRejectedValue(new mocks.RouteAuthError("Forbidden", 403, "FORBIDDEN"));

    const res = await getFor("p1");

    expect(res.status).toBe(403);
    expect(mocks.prisma.auditEvent.findMany).not.toHaveBeenCalled();
  });

  it("returns events scoped to the project, newest first, capped at 100", async () => {
    mocks.prisma.auditEvent.findMany.mockResolvedValue([
      { id: "e1", type: "state_changed", payload: {}, createdAt: new Date().toISOString(), actor: { email: "a@example.com", fullName: "A" } },
    ]);

    const res = await getFor("p1");
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.events).toHaveLength(1);
    expect(mocks.prisma.auditEvent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { projectId: "p1" },
        take: 100,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      }),
    );
  });
});
