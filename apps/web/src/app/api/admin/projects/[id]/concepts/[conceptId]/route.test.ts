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
    concept: { update: vi.fn() },
    revisionRequest: { findMany: vi.fn(), deleteMany: vi.fn() },
    $executeRaw: vi.fn(),
  };

  return {
    RouteAuthError,
    requireUser: vi.fn(),
    requireAdmin: vi.fn(),
    logAudit: vi.fn(),
    tx,
    prisma: {
      concept: { findFirst: vi.fn() },
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

import { DELETE } from "./route";

function deleteConcept(id: string, conceptId: string) {
  return DELETE(new Request("http://localhost", { method: "DELETE" }), {
    params: Promise.resolve({ id, conceptId }),
  });
}

describe("DELETE /api/admin/projects/[id]/concepts/[conceptId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireUser.mockResolvedValue({ id: "admin-1", email: "admin@example.com" });
    mocks.requireAdmin.mockResolvedValue(undefined);
    mocks.prisma.concept.findFirst.mockResolvedValue({ id: "c1", number: 1, status: "published" });
    mocks.tx.concept.update.mockResolvedValue(undefined);
    mocks.tx.revisionRequest.findMany.mockResolvedValue([]);
    mocks.tx.revisionRequest.deleteMany.mockResolvedValue({ count: 0 });
    mocks.tx.$executeRaw.mockResolvedValue(1);
    mocks.logAudit.mockResolvedValue(undefined);
  });

  it("returns 403 for non-admin users", async () => {
    mocks.requireAdmin.mockRejectedValue(new mocks.RouteAuthError("Forbidden", 403, "FORBIDDEN"));

    const res = await deleteConcept("p1", "c1");

    expect(res.status).toBe(403);
    expect(mocks.prisma.concept.findFirst).not.toHaveBeenCalled();
  });

  it("scopes the concept lookup to the project (no cross-project deletes)", async () => {
    mocks.prisma.concept.findFirst.mockResolvedValue(null);

    const res = await deleteConcept("p-other", "c1");
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.error.code).toBe("CONCEPT_NOT_FOUND");
    expect(mocks.prisma.concept.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "c1", projectId: "p-other" } }),
    );
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
  });

  it("soft-deletes a published concept and refunds the concept entitlement", async () => {
    const res = await deleteConcept("p1", "c1");

    expect(res.status).toBe(200);
    expect(mocks.tx.concept.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: "deleted" } }),
    );
    // One raw update refunding the consumed concept entitlement.
    expect(mocks.tx.$executeRaw).toHaveBeenCalledTimes(1);
    expect(mocks.logAudit).toHaveBeenCalledWith(
      mocks.tx,
      expect.objectContaining({ type: "concept_deleted" }),
    );
  });

  it("does not refund concept entitlement for unpublished concepts", async () => {
    mocks.prisma.concept.findFirst.mockResolvedValue({ id: "c1", number: 1, status: "draft" });

    const res = await deleteConcept("p1", "c1");

    expect(res.status).toBe(200);
    expect(mocks.tx.$executeRaw).not.toHaveBeenCalled();
  });

  it("refunds reserved and consumed revisions tied to the concept", async () => {
    mocks.tx.revisionRequest.findMany.mockResolvedValue([
      { id: "r1", status: "requested" },
      { id: "r2", status: "delivered" },
    ]);
    mocks.tx.revisionRequest.deleteMany.mockResolvedValue({ count: 2 });

    const res = await deleteConcept("p1", "c1");

    expect(res.status).toBe(200);
    // Concept refund + revision refund.
    expect(mocks.tx.$executeRaw).toHaveBeenCalledTimes(2);
    expect(mocks.logAudit).toHaveBeenCalledWith(
      mocks.tx,
      expect.objectContaining({
        payload: expect.objectContaining({ deletedRevisionRequests: 2 }),
      }),
    );
  });
});
