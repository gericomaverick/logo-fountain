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
    requireProjectMembership: vi.fn(),
    getProjectSnapshot: vi.fn(),
  };
});

vi.mock("@/lib/auth/require", () => ({
  RouteAuthError: mocks.RouteAuthError,
  requireUser: mocks.requireUser,
  requireAdmin: mocks.requireAdmin,
  requireProjectMembership: mocks.requireProjectMembership,
  toRouteErrorResponse: (error: unknown) => {
    if (error instanceof mocks.RouteAuthError) {
      return Response.json({ error: { message: error.message, code: error.code } }, { status: error.status });
    }
    throw error;
  },
}));

vi.mock("@/lib/project-snapshot", () => ({ getProjectSnapshot: mocks.getProjectSnapshot }));

import { GET } from "./route";

function getFor(id: string) {
  return GET(new Request("http://localhost"), { params: Promise.resolve({ id }) });
}

describe("GET /api/projects/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireUser.mockResolvedValue({ id: "u1", email: "client@example.com" });
    mocks.requireAdmin.mockRejectedValue(new mocks.RouteAuthError("Forbidden", 403, "FORBIDDEN"));
    mocks.requireProjectMembership.mockResolvedValue({ id: "p1", clientId: "c1" });
    mocks.getProjectSnapshot.mockResolvedValue({ id: "p1", status: "IN_DESIGN" });
  });

  it("returns 401 for unauthenticated callers", async () => {
    mocks.requireUser.mockRejectedValue(new mocks.RouteAuthError("Unauthorized", 401, "UNAUTHORIZED"));

    const res = await getFor("p1");

    expect(res.status).toBe(401);
    expect(mocks.getProjectSnapshot).not.toHaveBeenCalled();
  });

  it("returns 404 for signed-in users without membership of the project (cross-tenant)", async () => {
    mocks.requireProjectMembership.mockRejectedValue(
      new mocks.RouteAuthError("Project not found", 404, "PROJECT_NOT_FOUND"),
    );

    const res = await getFor("someone-elses-project");
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.error.code).toBe("PROJECT_NOT_FOUND");
    expect(mocks.getProjectSnapshot).not.toHaveBeenCalled();
  });

  it("enforces membership for non-admin users before returning the snapshot", async () => {
    const res = await getFor("p1");

    expect(res.status).toBe(200);
    expect(mocks.requireProjectMembership).toHaveBeenCalledWith("u1", "p1");
    expect(mocks.getProjectSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: "p1", userId: "u1" }),
    );
  });

  it("skips the membership check for admins", async () => {
    mocks.requireAdmin.mockResolvedValue(undefined);

    const res = await getFor("p1");

    expect(res.status).toBe(200);
    expect(mocks.requireProjectMembership).not.toHaveBeenCalled();
  });

  it("propagates non-403 admin-check failures instead of falling back to membership", async () => {
    mocks.requireAdmin.mockRejectedValue(new mocks.RouteAuthError("Unauthorized", 401, "UNAUTHORIZED"));

    const res = await getFor("p1");

    expect(res.status).toBe(401);
    expect(mocks.requireProjectMembership).not.toHaveBeenCalled();
  });
});
