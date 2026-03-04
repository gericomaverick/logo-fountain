import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  requireProjectMembership: vi.fn(),
  toRouteErrorResponse: vi.fn(),
  createProjectSystemMessage: vi.fn(),
  logAudit: vi.fn(),
  tx: {
    projectBrief: {
      findFirst: vi.fn(),
      create: vi.fn(),
    },
    project: {
      update: vi.fn(),
    },
  },
  prisma: {
    project: { findUnique: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock("@/lib/auth/require", () => ({
  requireUser: mocks.requireUser,
  requireProjectMembership: mocks.requireProjectMembership,
  toRouteErrorResponse: mocks.toRouteErrorResponse,
}));

vi.mock("@/lib/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/system-messages", () => ({ createProjectSystemMessage: mocks.createProjectSystemMessage }));
vi.mock("@/lib/audit", () => ({ logAudit: mocks.logAudit }));

import { POST } from "./route";

const validPayload = {
  brandName: "Acme",
  industry: "SaaS",
  offerSummary: "B2B tools",
  audiencePrimary: "Founders of early-stage SaaS companies",
  businessGoals: "Increase trust with enterprise buyers",
  brandPersonality: "Confident, modern, clear",
  styleDirection: "Minimal geometric mark with clean typography",
  usageContexts: "Website, product UI, social avatars",
};

describe("POST /api/projects/[id]/brief", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.requireUser.mockResolvedValue({ id: "u1", email: "client@example.com" });
    mocks.requireProjectMembership.mockResolvedValue({ id: "p1" });
    mocks.toRouteErrorResponse.mockImplementation((err: Error) =>
      Response.json({ error: { message: err.message, code: "ERR" } }, { status: 500 }),
    );

    mocks.tx.projectBrief.findFirst.mockResolvedValue(null);
    mocks.tx.projectBrief.create.mockResolvedValue({ id: "b1", version: 1 });
    mocks.tx.project.update.mockResolvedValue({ id: "p1", status: "BRIEF_SUBMITTED" });
    mocks.prisma.$transaction.mockImplementation(async (fn: (tx: typeof mocks.tx) => Promise<unknown>) => fn(mocks.tx));

    mocks.createProjectSystemMessage.mockResolvedValue(undefined);
    mocks.logAudit.mockResolvedValue(undefined);
  });

  it("transitions AWAITING_BRIEF -> BRIEF_SUBMITTED and logs transition once", async () => {
    mocks.prisma.project.findUnique.mockResolvedValue({ id: "p1", status: "AWAITING_BRIEF" });

    const req = new Request("http://localhost", {
      method: "POST",
      body: JSON.stringify(validPayload),
    });

    const res = await POST(req, { params: Promise.resolve({ id: "p1" }) });
    expect(res.status).toBe(200);

    expect(mocks.tx.project.update).toHaveBeenCalledWith({ where: { id: "p1" }, data: { status: "BRIEF_SUBMITTED" } });
    expect(mocks.createProjectSystemMessage).toHaveBeenCalledWith(
      mocks.tx,
      expect.objectContaining({
        projectId: "p1",
        body: "Brief received. Your designer will review and reply soon.",
      }),
    );
    expect(mocks.logAudit).toHaveBeenCalledWith(
      mocks.tx,
      expect.objectContaining({ type: "state_changed", payload: { previousStatus: "AWAITING_BRIEF", nextStatus: "BRIEF_SUBMITTED" } }),
    );
  });

  it("resubmission does not emit a state_changed audit event", async () => {
    mocks.prisma.project.findUnique.mockResolvedValue({ id: "p1", status: "BRIEF_SUBMITTED" });

    const req = new Request("http://localhost", {
      method: "POST",
      body: JSON.stringify(validPayload),
    });

    const res = await POST(req, { params: Promise.resolve({ id: "p1" }) });
    expect(res.status).toBe(200);

    expect(mocks.tx.project.update).not.toHaveBeenCalled();
    expect(mocks.createProjectSystemMessage).toHaveBeenCalledWith(
      mocks.tx,
      expect.objectContaining({ body: "Brief updated. We saved this as a new version for your designer." }),
    );

    const stateChangedCalls = mocks.logAudit.mock.calls.filter((call) => call[1]?.type === "state_changed");
    expect(stateChangedCalls).toHaveLength(0);
  });

  it("rejects payloads missing required fields", async () => {
    const req = new Request("http://localhost", {
      method: "POST",
      body: JSON.stringify({ brandName: "Acme", industry: "SaaS" }),
    });

    const res = await POST(req, { params: Promise.resolve({ id: "p1" }) });
    expect(res.status).toBe(400);

    const payload = await res.json();
    expect(JSON.stringify(payload)).toContain("Invalid brief payload");
  });
});
