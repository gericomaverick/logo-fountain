import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const tx = {
    $queryRaw: vi.fn(),
    revisionRequest: { create: vi.fn() },
    project: { update: vi.fn() },
  };

  return {
    requireUser: vi.fn(),
    requireProjectMembership: vi.fn(),
    toRouteErrorResponse: vi.fn(),
    applyTransition: vi.fn(),
    logAudit: vi.fn(),
    createProjectSystemMessage: vi.fn(),
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
vi.mock("@/lib/system-messages", () => ({ createProjectSystemMessage: mocks.createProjectSystemMessage }));

import { POST } from "./route";

describe("POST /api/projects/[id]/revision-requests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireUser.mockResolvedValue({ id: "u1" });
    mocks.requireProjectMembership.mockResolvedValue({ id: "p1" });
    mocks.toRouteErrorResponse.mockImplementation((err: Error) =>
      Response.json({ error: { message: err.message, code: "ERR" } }, { status: 500 }),
    );

    mocks.prisma.project.findUnique.mockResolvedValue({ id: "p1", status: "CONCEPTS_READY" });
    mocks.prisma.concept.findFirst.mockResolvedValue({ id: "c2" });
    mocks.applyTransition.mockReturnValue({ ok: true });

    mocks.tx.$queryRaw.mockResolvedValue([{ id: "ent-1" }]);
    mocks.tx.revisionRequest.create.mockResolvedValue({
      id: "rr-1",
      projectId: "p1",
      conceptId: "c2",
      status: "requested",
      body: "Please adjust typography",
      createdAt: new Date("2026-03-03T12:00:00Z"),
    });
    mocks.tx.project.update.mockResolvedValue({ id: "p1", status: "REVISIONS_IN_PROGRESS" });
    mocks.logAudit.mockResolvedValue(undefined);
    mocks.createProjectSystemMessage.mockResolvedValue(undefined);
  });

  it("rejects requests that do not include conceptId", async () => {
    const req = new Request("http://localhost", {
      method: "POST",
      body: JSON.stringify({ body: "Please tweak spacing" }),
      headers: { "Content-Type": "application/json" },
    });

    const res = await POST(req, { params: Promise.resolve({ id: "p1" }) });

    expect(res.status).toBe(400);
    const payload = await res.json();
    expect(payload).toMatchObject({
      error: {
        code: "INVALID_BODY",
        message: "Body (1-5000 chars) and conceptId are required",
      },
    });
    expect(mocks.tx.revisionRequest.create).not.toHaveBeenCalled();
  });

  it("first revision request transitions project to REVISIONS_IN_PROGRESS", async () => {
    const req = new Request("http://localhost", {
      method: "POST",
      body: JSON.stringify({ body: "Please adjust typography", conceptId: "c2" }),
      headers: { "Content-Type": "application/json" },
    });

    const res = await POST(req, { params: Promise.resolve({ id: "p1" }) });

    expect(res.status).toBe(201);
    expect(mocks.applyTransition).toHaveBeenCalledWith("CONCEPTS_READY", "REVISIONS_IN_PROGRESS");
    expect(mocks.tx.project.update).toHaveBeenCalledWith({
      where: { id: "p1" },
      data: { status: "REVISIONS_IN_PROGRESS" },
      select: { id: true, status: true },
    });
    expect(mocks.prisma.concept.findFirst).toHaveBeenCalledWith({
      where: { id: "c2", projectId: "p1" },
      select: { id: true },
    });
    expect(mocks.tx.revisionRequest.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ conceptId: "c2", status: "requested" }),
      }),
    );
    expect(mocks.tx.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it("allows a second revision request while already in REVISIONS_IN_PROGRESS", async () => {
    mocks.prisma.project.findUnique.mockResolvedValue({ id: "p1", status: "REVISIONS_IN_PROGRESS" });

    const req = new Request("http://localhost", {
      method: "POST",
      body: JSON.stringify({ body: "Please explore another direction", conceptId: "c3" }),
      headers: { "Content-Type": "application/json" },
    });

    mocks.prisma.concept.findFirst.mockResolvedValue({ id: "c3" });
    mocks.tx.revisionRequest.create.mockResolvedValue({
      id: "rr-2",
      projectId: "p1",
      conceptId: "c3",
      status: "requested",
      body: "Please explore another direction",
      createdAt: new Date("2026-03-03T12:05:00Z"),
    });

    const res = await POST(req, { params: Promise.resolve({ id: "p1" }) });

    expect(res.status).toBe(201);
    expect(mocks.applyTransition).not.toHaveBeenCalled();
    expect(mocks.tx.project.update).not.toHaveBeenCalled();
    expect(mocks.tx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(mocks.tx.revisionRequest.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ conceptId: "c3", status: "requested" }),
      }),
    );
    expect(mocks.logAudit).toHaveBeenCalledTimes(1);
    expect(mocks.logAudit).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ type: "revision_requested" }),
    );
  });
});
