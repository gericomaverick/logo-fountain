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
    project: { findUnique: vi.fn(), updateMany: vi.fn() },
    concept: { findFirst: vi.fn(), updateMany: vi.fn(), count: vi.fn() },
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
    mocks.tx.project.findUnique.mockResolvedValue({status:"CONCEPTS_READY",updatedAt:new Date("2026-03-01")});
    mocks.tx.project.updateMany.mockResolvedValue({count:1});
    mocks.tx.concept.count.mockResolvedValue(1);
    mocks.requireUser.mockResolvedValue({ id: "admin-1", email: "admin@example.com" });
    mocks.requireAdmin.mockResolvedValue(undefined);
    mocks.tx.concept.findFirst.mockResolvedValue({ id: "c1", number: 1, status: "published" });
    mocks.tx.concept.updateMany.mockResolvedValue({ count: 1 });
    mocks.tx.revisionRequest.findMany.mockResolvedValue([]);
    mocks.tx.revisionRequest.deleteMany.mockResolvedValue({ count: 0 });
    mocks.tx.$executeRaw.mockResolvedValue(1);
    mocks.logAudit.mockResolvedValue(undefined);
  });

  it("returns 403 for non-admin users", async () => {
    mocks.requireAdmin.mockRejectedValue(new mocks.RouteAuthError("Forbidden", 403, "FORBIDDEN"));

    const res = await deleteConcept("p1", "c1");

    expect(res.status).toBe(403);
    expect(mocks.tx.concept.findFirst).not.toHaveBeenCalled();
  });

  it("scopes the concept lookup to the project (no cross-project deletes)", async () => {
    mocks.tx.concept.findFirst.mockResolvedValue(null);

    const res = await deleteConcept("p-other", "c1");
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.error.code).toBe("CONCEPT_NOT_FOUND");
    expect(mocks.tx.concept.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "c1", projectId: "p-other" } }),
    );

  });

  it("soft-deletes without rewinding first-publication usage", async () => {
    const res = await deleteConcept("p1", "c1");

    expect(res.status).toBe(200);
    expect(mocks.tx.concept.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: "deleted" } }),
    );
    // One raw update refunding the consumed concept entitlement.
    expect(mocks.tx.$executeRaw).not.toHaveBeenCalled();
    expect(mocks.logAudit).toHaveBeenCalledWith(
      mocks.tx,
      expect.objectContaining({ type: "concept_deleted" }),
    );
  });

  it("does not refund concept entitlement for unpublished concepts", async () => {
    mocks.tx.concept.findFirst.mockResolvedValue({ id: "c1", number: 1, status: "draft" });

    const res = await deleteConcept("p1", "c1");

    expect(res.status).toBe(200);
    expect(mocks.tx.$executeRaw).not.toHaveBeenCalled();
  });

  it("releases pending reservations but never refunds delivered usage", async () => {
    mocks.tx.revisionRequest.findMany.mockResolvedValue([
      { id: "r1", status: "requested" },
      { id: "r2", status: "delivered" },
    ]);
    mocks.tx.revisionRequest.deleteMany.mockResolvedValue({ count: 2 });

    const res = await deleteConcept("p1", "c1");

    expect(res.status).toBe(200);
    // Concept refund + revision refund.
    expect(mocks.tx.$executeRaw).toHaveBeenCalledTimes(1);
    expect(mocks.logAudit).toHaveBeenCalledWith(
      mocks.tx,
      expect.objectContaining({
        payload: expect.objectContaining({ deletedRevisionRequests: 2 }),
      }),
    );
  });
  it("repeated deletion performs no accounting or audit", async () => {
    mocks.tx.concept.findFirst.mockResolvedValue({ id: "c1", number: 1, status: "deleted" });
    expect((await deleteConcept("p1", "c1")).status).toBe(200);
    expect(mocks.tx.$executeRaw).not.toHaveBeenCalled();
    expect(mocks.tx.concept.updateMany).not.toHaveBeenCalled();
    expect(mocks.logAudit).not.toHaveBeenCalled();
  });
  it("losing conditional delete does not release someone else's reservation", async () => {
    mocks.tx.concept.updateMany.mockResolvedValue({ count: 0 });
    expect((await deleteConcept("p1", "c1")).status).toBe(409);
    expect(mocks.tx.$executeRaw).not.toHaveBeenCalled();
  });

  it("protects the last visible concept, approvals and held/final phases", async () => {
    mocks.tx.concept.count.mockResolvedValue(0);
    expect((await deleteConcept("p1", "c1")).status).toBe(409);
    mocks.tx.concept.findFirst.mockResolvedValue({id:"c1",number:1,status:"approved"});
    expect((await deleteConcept("p1", "c1")).status).toBe(409);
    mocks.tx.concept.findFirst.mockResolvedValue({id:"c1",number:1,status:"published"});
    mocks.tx.project.findUnique.mockResolvedValue({status:"ON_HOLD",updatedAt:new Date()});
    expect((await deleteConcept("p1", "c1")).status).toBe(409);
    expect(mocks.tx.concept.updateMany).not.toHaveBeenCalled();
  });

});
