import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  class RouteAuthError extends Error { constructor(message: string, public status: number, public code: string) { super(message); } }
  const tx = { auditEvent: { findFirst: vi.fn() }, projectBrief: { count: vi.fn() }, concept: { count: vi.fn() }, revisionRequest: { count: vi.fn() }, fileAsset: { count: vi.fn() }, project: { updateMany: vi.fn() } };
  return {
    RouteAuthError, requireUser: vi.fn(), requireAdmin: vi.fn(), logAudit: vi.fn(), tx,
    prisma: { project: { findUnique: vi.fn() }, $transaction: vi.fn(async (fn: (trx: typeof tx) => unknown) => fn(tx)) },
  };
});
vi.mock("@/lib/auth/require", () => ({
  RouteAuthError: mocks.RouteAuthError, requireUser: mocks.requireUser, requireAdmin: mocks.requireAdmin,
  toRouteErrorResponse: (error: unknown) => error instanceof mocks.RouteAuthError
    ? Response.json({ error: { message: error.message, code: error.code } }, { status: error.status })
    : Response.json({ error: { code: "UNKNOWN" } }, { status: 500 }),
}));
vi.mock("@/lib/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/audit", () => ({ logAudit: mocks.logAudit }));
import { POST } from "./route";

function postStatus(body: unknown) {
  return POST(new Request("http://localhost", { method: "POST", body: JSON.stringify(body) }), { params: Promise.resolve({ id: "p1" }) });
}

describe("constrained admin status mutation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireUser.mockResolvedValue({ id: "admin-1" });
    mocks.requireAdmin.mockResolvedValue(undefined);
    mocks.prisma.project.findUnique.mockResolvedValue({ id: "p1", status: "IN_DESIGN", updatedAt: new Date("2026-03-01") });
    mocks.tx.project.updateMany.mockResolvedValue({ count: 1 });
  });

  it("returns 403 for non-admin users", async () => {
    mocks.requireAdmin.mockRejectedValue(new mocks.RouteAuthError("Forbidden", 403, "FORBIDDEN"));
    expect((await postStatus({ status: "ON_HOLD", reason: "Client requested pause" })).status).toBe(403);
  });

  it("rejects lifecycle progression that would bypass domain preconditions", async () => {
    const res = await postStatus({ status: "CONCEPTS_READY", reason: "skip" });
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({ error: { code: "DOMAIN_ACTION_REQUIRED" } });
    expect(mocks.prisma.project.findUnique).not.toHaveBeenCalled();
  });

  it("requires a reason for permitted exceptional mutations", async () => {
    const res = await postStatus({ status: "ON_HOLD" });
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({ error: { code: "REASON_REQUIRED" } });
  });

  it("allows and audits a reasoned hold under an optimistic guard", async () => {
    const res = await postStatus({ status: "ON_HOLD", reason: "Waiting for client legal review" });
    expect(res.status).toBe(200);
    expect(mocks.tx.project.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ status: "IN_DESIGN", updatedAt: expect.any(Date) }),
      data: { status: "ON_HOLD", updatedAt: expect.any(Date) },
    }));
    expect(mocks.logAudit).toHaveBeenCalledWith(mocks.tx, expect.objectContaining({
      payload: expect.objectContaining({ reason: "Waiting for client legal review", source: "constrained_admin_exception" }),
    }));
  });
  it("restores only the recorded held phase with reason and matching version", async () => {
    const version = new Date("2026-03-01");
    mocks.prisma.project.findUnique.mockResolvedValue({ id: "p1", status: "ON_HOLD", updatedAt: version });
    mocks.tx.auditEvent.findFirst.mockResolvedValue({ payload: { previousStatus: "IN_DESIGN", nextStatus: "ON_HOLD", heldVersion: version.toISOString() } });
    mocks.tx.projectBrief.count.mockResolvedValue(1);
    expect((await postStatus({ status: "RESUME", reason: "Client legal review complete" })).status).toBe(200);
    expect(mocks.tx.project.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { status: "IN_DESIGN", updatedAt: expect.any(Date) } }));
    expect(mocks.logAudit).toHaveBeenCalledWith(mocks.tx, expect.objectContaining({ payload: expect.objectContaining({ source: "hold_resume", reason: "Client legal review complete" }) }));
  });
  it("rejects stale holds, missing phase evidence, and arbitrary resume targets", async () => {
    mocks.prisma.project.findUnique.mockResolvedValue({ id: "p1", status: "ON_HOLD", updatedAt: new Date("2026-03-01") });
    mocks.tx.auditEvent.findFirst.mockResolvedValue({ payload: { previousStatus: "IN_DESIGN", nextStatus: "ON_HOLD", heldVersion: "stale" } });
    expect((await postStatus({ status: "RESUME", reason: "Resume" })).status).toBe(409);
    mocks.tx.auditEvent.findFirst.mockResolvedValue({ payload: { previousStatus: "IN_DESIGN", nextStatus: "ON_HOLD", heldVersion: new Date("2026-03-01").toISOString() } });
    mocks.tx.projectBrief.count.mockResolvedValue(0);
    expect((await postStatus({ status: "RESUME", reason: "Resume" })).status).toBe(409);
    expect(mocks.tx.project.updateMany).not.toHaveBeenCalled();
  });

});
