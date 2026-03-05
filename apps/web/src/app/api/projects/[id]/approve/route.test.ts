import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const tx = {
    concept: { updateMany: vi.fn(), update: vi.fn() },
    project: { update: vi.fn() },
  };

  return {
    requireUser: vi.fn(),
    requireProjectMembership: vi.fn(),
    toRouteErrorResponse: vi.fn(),
    applyTransition: vi.fn(),
    logAudit: vi.fn(),
    notifyClientConceptApproved: vi.fn(),
    notifyAdminConceptApproved: vi.fn(),
    prisma: {
      project: { findUnique: vi.fn() },
      concept: { findFirst: vi.fn() },
      $transaction: vi.fn(async (fn: (trx: typeof tx) => Promise<unknown>) => fn(tx)),
    },
    tx,
  };
});

vi.mock("@/lib/auth/require", () => ({
  requireUser: mocks.requireUser,
  requireProjectMembership: mocks.requireProjectMembership,
  toRouteErrorResponse: mocks.toRouteErrorResponse,
}));
vi.mock("@/lib/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/project-state-machine", () => ({ applyTransition: mocks.applyTransition }));
vi.mock("@/lib/audit", () => ({ logAudit: mocks.logAudit }));
vi.mock("@/lib/project-lifecycle-email", () => ({
  notifyClientConceptApproved: mocks.notifyClientConceptApproved,
  notifyAdminConceptApproved: mocks.notifyAdminConceptApproved,
}));

import { POST } from "./route";

describe("POST /api/projects/[id]/approve", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.requireUser.mockResolvedValue({ id: "u1" });
    mocks.requireProjectMembership.mockResolvedValue({ id: "p1" });
    mocks.toRouteErrorResponse.mockImplementation((err: Error) =>
      Response.json({ error: { message: err.message, code: "ERR" } }, { status: 500 }),
    );
    mocks.prisma.project.findUnique.mockResolvedValue({ id: "p1", status: "CONCEPTS_READY" });
    mocks.prisma.concept.findFirst.mockResolvedValue({ id: "c1", number: 1 });
    mocks.applyTransition.mockReturnValue({ ok: true });

    mocks.tx.concept.updateMany.mockResolvedValue({ count: 0 });
    mocks.tx.concept.update.mockResolvedValue({ id: "c1", number: 1, status: "approved" });
    mocks.tx.project.update.mockResolvedValue({ id: "p1", status: "AWAITING_APPROVAL" });

    mocks.logAudit.mockResolvedValue(undefined);
    mocks.notifyClientConceptApproved.mockResolvedValue(undefined);
    mocks.notifyAdminConceptApproved.mockResolvedValue(undefined);
  });

  it("sends both client and admin concept-approved emails", async () => {
    const req = new Request("http://localhost", {
      method: "POST",
      body: JSON.stringify({ conceptId: "c1" }),
      headers: { "Content-Type": "application/json" },
    });

    const res = await POST(req, { params: Promise.resolve({ id: "p1" }) });

    expect(res.status).toBe(200);
    expect(mocks.notifyClientConceptApproved).toHaveBeenCalledWith("p1", "c1");
    expect(mocks.notifyAdminConceptApproved).toHaveBeenCalledWith("p1", "c1");
  });
});
