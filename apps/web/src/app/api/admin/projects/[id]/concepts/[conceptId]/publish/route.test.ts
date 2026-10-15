import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const concept = { findFirst: vi.fn(), count: vi.fn(), updateMany: vi.fn() };
  const project = { findUnique: vi.fn(), update: vi.fn() };
  const projectEntitlement = { findFirst: vi.fn() };
  const tx = { concept, project, projectEntitlement, $executeRaw: vi.fn() };
  return {
    requireUser: vi.fn(), requireAdmin: vi.fn(), logAudit: vi.fn(), createProjectSystemMessage: vi.fn(), notifyClientConceptReady: vi.fn(),
    tx,
    prisma: { $transaction: vi.fn(async (fn: (value: typeof tx) => Promise<unknown>) => fn(tx)) },
  };
});

vi.mock("@/lib/auth/require", () => ({
  requireUser: mocks.requireUser,
  requireAdmin: mocks.requireAdmin,
  toRouteErrorResponse: (error: unknown) => Response.json({ error: { message: error instanceof Error ? error.message : "Unknown" } }, { status: 500 }),
}));
vi.mock("@/lib/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/audit", () => ({ logAudit: mocks.logAudit }));
vi.mock("@/lib/system-messages", () => ({ createProjectSystemMessage: mocks.createProjectSystemMessage }));
vi.mock("@/lib/project-lifecycle-email", () => ({ notifyClientConceptReady: mocks.notifyClientConceptReady }));

import { POST } from "./route";

function publish() {
  return POST(new Request("http://localhost", { method: "POST" }), { params: Promise.resolve({ id: "p1", conceptId: "c1" }) });
}

describe("POST concept publish entitlement integrity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireUser.mockResolvedValue({ id: "admin-1" });
    mocks.requireAdmin.mockResolvedValue(undefined);
    mocks.tx.concept.findFirst.mockResolvedValue({ id: "c1", number: 1, status: "draft" });
    mocks.tx.concept.count.mockResolvedValue(0);
    mocks.tx.concept.updateMany.mockResolvedValue({ count: 1 });
    mocks.tx.project.findUnique.mockResolvedValue({ status: "BRIEF_SUBMITTED" });
    mocks.tx.project.update.mockResolvedValue({ status: "CONCEPTS_READY" });
    mocks.tx.$executeRaw.mockResolvedValue(1);
    mocks.tx.projectEntitlement.findFirst.mockResolvedValue({ id: "e1", limitInt: 2, consumedInt: 1, reservedInt: 0 });
  });

  it("consumes and publishes a draft in one serializable transaction", async () => {
    const res = await publish();
    expect(res.status).toBe(200);
    expect(mocks.tx.$executeRaw).toHaveBeenCalledTimes(1);
    expect(mocks.tx.concept.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ status: "draft" }) }));
    expect(mocks.notifyClientConceptReady).toHaveBeenCalledWith("p1", "c1");
    expect(mocks.prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), expect.objectContaining({ isolationLevel: "Serializable" }));
  });

  it("is first-publish-only and does not consume or notify on retry", async () => {
    mocks.tx.concept.findFirst.mockResolvedValue({ id: "c1", number: 1, status: "published" });
    const res = await publish();
    expect(res.status).toBe(200);
    expect(mocks.tx.$executeRaw).not.toHaveBeenCalled();
    expect(mocks.notifyClientConceptReady).not.toHaveBeenCalled();
  });

  it.each([
    [null, "CONCEPTS_ENTITLEMENT_MISSING"],
    [{ id: "e1", limitInt: 1, consumedInt: 1, reservedInt: 0 }, "CONCEPT_ENTITLEMENT_EXHAUSTED"],
  ])("rejects missing or exhausted entitlement without publishing", async (entitlement, code) => {
    mocks.tx.$executeRaw.mockResolvedValue(0);
    mocks.tx.projectEntitlement.findFirst.mockResolvedValue(entitlement);
    const res = await publish();
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({ error: { code } });
    expect(mocks.tx.concept.updateMany).not.toHaveBeenCalled();
    expect(mocks.notifyClientConceptReady).not.toHaveBeenCalled();
  });

  it("rejects publication after the concept-review phase without consuming", async () => {
    mocks.tx.project.findUnique.mockResolvedValue({ status: "DELIVERED" });
    const res = await publish();
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({ error: { code: "INVALID_PROJECT_STATUS_TRANSITION" } });
    expect(mocks.tx.$executeRaw).not.toHaveBeenCalled();
  });

  it("rejects an approved concept instead of downgrading it", async () => {
    mocks.tx.concept.findFirst.mockResolvedValue({ id: "c1", number: 1, status: "approved" });
    const res = await publish();
    expect(res.status).toBe(409);
    expect(mocks.tx.$executeRaw).not.toHaveBeenCalled();
  });
});
