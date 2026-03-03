import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const tx = {
    project: { findUnique: vi.fn() },
    projectEntitlement: { findMany: vi.fn(), upsert: vi.fn() },
  };

  return {
    requireUser: vi.fn(),
    requireAdmin: vi.fn(),
    toRouteErrorResponse: vi.fn(),
    logAudit: vi.fn(),
    tx,
    prisma: {
      $transaction: vi.fn(async (fn: (trx: typeof tx) => unknown) => fn(tx)),
    },
  };
});

vi.mock("@/lib/auth/require", () => ({
  requireUser: mocks.requireUser,
  requireAdmin: mocks.requireAdmin,
  toRouteErrorResponse: mocks.toRouteErrorResponse,
}));

vi.mock("@/lib/audit", () => ({ logAudit: mocks.logAudit }));
vi.mock("@/lib/prisma", () => ({ prisma: mocks.prisma }));

import { PATCH } from "./route";

describe("PATCH /api/admin/projects/[id]/entitlements", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireUser.mockResolvedValue({ id: "admin-1", email: "admin@example.com" });
    mocks.requireAdmin.mockResolvedValue(undefined);
    mocks.tx.project.findUnique.mockResolvedValue({ id: "p1" });
    mocks.tx.projectEntitlement.findMany
      .mockResolvedValueOnce([{ key: "concepts", limitInt: 2 }, { key: "revisions", limitInt: 2 }])
      .mockResolvedValueOnce([{ key: "concepts", limitInt: 5, consumedInt: 0 }, { key: "revisions", limitInt: 3, consumedInt: 1 }]);
    mocks.tx.projectEntitlement.upsert.mockResolvedValue(undefined);
    mocks.logAudit.mockResolvedValue(undefined);
    mocks.toRouteErrorResponse.mockImplementation((err: Error) =>
      Response.json({ error: { message: err.message, code: "FORBIDDEN" } }, { status: 403 }),
    );
  });

  it("rejects unauthorised admin override attempts", async () => {
    mocks.requireAdmin.mockRejectedValueOnce(new Error("Forbidden"));

    const res = await PATCH(new Request("http://localhost", { method: "PATCH", body: JSON.stringify({ concepts: 4 }) }), {
      params: Promise.resolve({ id: "p1" }),
    });

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error.code).toBe("FORBIDDEN");
  });

  it("validates integer limits", async () => {
    const res = await PATCH(new Request("http://localhost", { method: "PATCH", body: JSON.stringify({ concepts: "abc" }) }), {
      params: Promise.resolve({ id: "p1" }),
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("INVALID_CONCEPTS_LIMIT");
  });
});
