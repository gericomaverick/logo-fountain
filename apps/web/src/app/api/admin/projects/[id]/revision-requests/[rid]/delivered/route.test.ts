import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => {
  const revisionRequest = { findFirst: vi.fn(), update: vi.fn() };
  const project = { findUnique: vi.fn(), update: vi.fn() };
  const projectEntitlement = { findFirst: vi.fn() };
  const $executeRaw = vi.fn();
  type Tx = {
    revisionRequest: typeof revisionRequest;
    project: typeof project;
    projectEntitlement: typeof projectEntitlement;
    $executeRaw: typeof $executeRaw;
  };
  const tx: Tx = { revisionRequest, project, projectEntitlement, $executeRaw };

  return {
    requireUser: vi.fn(),
    requireAdmin: vi.fn(),
    logAudit: vi.fn(),
    createProjectSystemMessage: vi.fn(),
    notifyClientRevisionReady: vi.fn(),
    prisma: {
      revisionRequest,
      project,
      projectEntitlement,
      $executeRaw,
      $transaction: vi.fn(async (fn: (tx: Tx) => Promise<unknown>) => fn(tx)),
    },
  };
});

vi.mock("@/lib/auth/require", () => ({
  requireUser: mocks.requireUser,
  requireAdmin: mocks.requireAdmin,
  toRouteErrorResponse: (error: unknown) => {
    const message = error instanceof Error ? error.message : "Unknown error";
    return Response.json({ error: { message } }, { status: 500 });
  },
}));

vi.mock("@/lib/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/audit", () => ({ logAudit: mocks.logAudit }));
vi.mock("@/lib/system-messages", () => ({ createProjectSystemMessage: mocks.createProjectSystemMessage }));
vi.mock("@/lib/project-lifecycle-email", () => ({ notifyClientRevisionReady: mocks.notifyClientRevisionReady }));

import { POST } from "./route";

describe("POST /api/admin/projects/[id]/revision-requests/[rid]/delivered", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireUser.mockResolvedValue({ id: "admin-user-1" });
    mocks.requireAdmin.mockResolvedValue(undefined);
    mocks.prisma.revisionRequest.findFirst.mockResolvedValue({ id: "rev-1", status: "requested" });
    mocks.prisma.project.findUnique.mockResolvedValue({ status: "REVISIONS_IN_PROGRESS" });
    mocks.prisma.revisionRequest.update.mockResolvedValue({ id: "rev-1", status: "delivered", updatedAt: new Date() });
    mocks.prisma.project.update.mockResolvedValue({ id: "p1", status: "CONCEPTS_READY" });
    mocks.prisma.projectEntitlement.findFirst.mockResolvedValue({ id: "ent-r", limitInt: 2, consumedInt: 0, reservedInt: 1 });
    mocks.prisma.$executeRaw.mockResolvedValue(1);
  });

  it("logs state_changed with the true previous status", async () => {
    const req = new Request("http://localhost", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ setConceptsReady: true }),
    });

    const res = await POST(req, { params: Promise.resolve({ id: "p1", rid: "rev-1" }) });
    expect(res.status).toBe(200);

    const stateChangeCall = mocks.logAudit.mock.calls.find(([, payload]) => payload?.type === "state_changed");
    expect(stateChangeCall?.[1]?.payload).toEqual({ previousStatus: "REVISIONS_IN_PROGRESS", nextStatus: "CONCEPTS_READY" });
    expect(mocks.notifyClientRevisionReady).toHaveBeenCalledWith("p1", "rev-1");
  });

  it("rejects delivery when no reserved revision entitlement remains", async () => {
    mocks.prisma.projectEntitlement.findFirst.mockResolvedValue({ id: "ent-r", limitInt: 2, consumedInt: 0, reservedInt: 0 });

    const req = new Request("http://localhost", { method: "POST" });
    const res = await POST(req, { params: Promise.resolve({ id: "p1", rid: "rev-1" }) });
    const payload = await res.json();

    expect(res.status).toBe(400);
    expect(payload.error?.code).toBe("INSUFFICIENT_REVISION_RESERVATION");
  });
});
