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

  const tx = {
    project: { update: vi.fn() },
  };

  return {
    RouteAuthError,
    requireUser: vi.fn(),
    requireAdmin: vi.fn(),
    logAudit: vi.fn(),
    tx,
    prisma: {
      project: { findUnique: vi.fn() },
      $transaction: vi.fn(async (fn: (trx: typeof tx) => unknown) => fn(tx)),
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

function postStatus(id: string, body: unknown) {
  return POST(
    new Request("http://localhost", { headers: { origin: "http://localhost" }, method: "POST", body: JSON.stringify(body) }),
    { params: Promise.resolve({ id }) },
  );
}

describe("POST /api/admin/projects/[id]/status", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireUser.mockResolvedValue({ id: "admin-1", email: "admin@example.com" });
    mocks.requireAdmin.mockResolvedValue(undefined);
    mocks.prisma.project.findUnique.mockResolvedValue({ id: "p1", status: "IN_DESIGN" });
    mocks.tx.project.update.mockResolvedValue({ id: "p1", status: "CONCEPTS_READY" });
    mocks.logAudit.mockResolvedValue(undefined);
  });

  it("returns 403 for non-admin users", async () => {
    mocks.requireAdmin.mockRejectedValue(new mocks.RouteAuthError("Forbidden", 403, "FORBIDDEN"));

    const res = await postStatus("p1", { status: "CONCEPTS_READY" });

    expect(res.status).toBe(403);
    expect(mocks.prisma.project.findUnique).not.toHaveBeenCalled();
  });

  it("rejects a missing status body", async () => {
    const res = await postStatus("p1", {});
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error.code).toBe("MISSING_STATUS");
  });

  it("returns 404 for unknown projects", async () => {
    mocks.prisma.project.findUnique.mockResolvedValue(null);

    const res = await postStatus("missing", { status: "CONCEPTS_READY" });

    expect(res.status).toBe(404);
  });

  it("rejects invalid state-machine transitions", async () => {
    mocks.prisma.project.findUnique.mockResolvedValue({ id: "p1", status: "DELIVERED" });

    const res = await postStatus("p1", { status: "AWAITING_BRIEF" });
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error.code).toBe("INVALID_PROJECT_STATUS_TRANSITION");
    expect(mocks.tx.project.update).not.toHaveBeenCalled();
  });

  it("applies a valid transition and writes an audit event", async () => {
    const res = await postStatus("p1", { status: "CONCEPTS_READY" });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.project.status).toBe("CONCEPTS_READY");
    expect(mocks.tx.project.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: "CONCEPTS_READY" } }),
    );
    expect(mocks.logAudit).toHaveBeenCalledWith(
      mocks.tx,
      expect.objectContaining({
        type: "state_changed",
        payload: { previousStatus: "IN_DESIGN", nextStatus: "CONCEPTS_READY" },
      }),
    );
  });
});
