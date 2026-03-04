import { describe, expect, it, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => {
  const revisionRequest = { findFirst: vi.fn(), update: vi.fn() };
  const project = { findUnique: vi.fn(), update: vi.fn() };
  type Tx = { revisionRequest: typeof revisionRequest; project: typeof project };
  const tx: Tx = { revisionRequest, project };

  return {
    requireUser: vi.fn(),
    requireAdmin: vi.fn(),
    logAudit: vi.fn(),
    createProjectSystemMessage: vi.fn(),
    prisma: {
      revisionRequest,
      project,
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
  });
});
