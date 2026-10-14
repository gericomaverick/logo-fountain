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
    getProjectSnapshot: vi.fn(),
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

vi.mock("@/lib/project-snapshot", () => ({ getProjectSnapshot: mocks.getProjectSnapshot }));

import { GET } from "./route";

function getFor(id: string) {
  return GET(new Request("http://localhost"), { params: Promise.resolve({ id }) });
}

describe("GET /api/admin/projects/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireUser.mockResolvedValue({ id: "admin-1", email: "admin@example.com" });
    mocks.requireAdmin.mockResolvedValue(undefined);
    mocks.getProjectSnapshot.mockResolvedValue({ id: "p1", status: "IN_PROGRESS" });
  });

  it("returns 401 for unauthenticated callers", async () => {
    mocks.requireUser.mockRejectedValue(new mocks.RouteAuthError("Unauthorized", 401, "UNAUTHORIZED"));

    const res = await getFor("p1");

    expect(res.status).toBe(401);
    expect(mocks.getProjectSnapshot).not.toHaveBeenCalled();
  });

  it("returns 403 for non-admin users", async () => {
    mocks.requireAdmin.mockRejectedValue(new mocks.RouteAuthError("Forbidden", 403, "FORBIDDEN"));

    const res = await getFor("p1");

    expect(res.status).toBe(403);
    expect(mocks.getProjectSnapshot).not.toHaveBeenCalled();
  });

  it("returns 404 when snapshot is missing", async () => {
    mocks.getProjectSnapshot.mockResolvedValue(null);

    const res = await getFor("missing");
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.error.code).toBe("PROJECT_NOT_FOUND");
  });

  it("returns the snapshot for admins", async () => {
    const res = await getFor("p1");
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.snapshot).toEqual({ id: "p1", status: "IN_PROGRESS" });
  });
});
