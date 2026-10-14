import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  toRouteErrorResponse: vi.fn(),
  buildFinalDeliverableFilename: vi.fn(),
  createSignedFinalDeliverableUrl: vi.fn(),
  applyTransition: vi.fn(),
  logAudit: vi.fn(),
  tx: {
    project: { findFirst: vi.fn(), updateMany: vi.fn() },
  },
  prisma: { $transaction: vi.fn() },
}));

vi.mock("@/lib/auth/require", () => ({
  requireUser: mocks.requireUser,
  toRouteErrorResponse: mocks.toRouteErrorResponse,
}));
vi.mock("@/lib/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/final-deliverable-filename", () => ({ buildFinalDeliverableFilename: mocks.buildFinalDeliverableFilename }));
vi.mock("@/lib/supabase/storage", () => ({ createSignedFinalDeliverableUrl: mocks.createSignedFinalDeliverableUrl }));
vi.mock("@/lib/project-state-machine", () => ({ applyTransition: mocks.applyTransition }));
vi.mock("@/lib/audit", () => ({ logAudit: mocks.logAudit }));

import { POST } from "./route";

function project(status = "FINAL_FILES_READY") {
  return {
    id: "p1",
    status,
    updatedAt: new Date("2026-03-05T09:00:00.000Z"),
    client: { name: "Acme", memberships: [] },
    fileAssets: [{ path: "projects/p1/final.zip", createdAt: new Date("2026-03-05T08:00:00.000Z") }],
  };
}

function request() {
  return POST(new Request("http://localhost", { method: "POST" }), { params: Promise.resolve({ id: "p1" }) });
}

describe("POST /api/projects/[id]/finals", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireUser.mockResolvedValue({ id: "u1" });
    mocks.toRouteErrorResponse.mockImplementation((error: Error) => {
      throw error;
    });
    mocks.buildFinalDeliverableFilename.mockReturnValue("brand-2026-03-05.zip");
    mocks.createSignedFinalDeliverableUrl.mockResolvedValue("https://download.example/final.zip");
    mocks.applyTransition.mockReturnValue({ ok: true, allowed: ["DELIVERED"] });
    mocks.logAudit.mockResolvedValue(undefined);
    mocks.tx.project.findFirst.mockResolvedValue(project());
    mocks.tx.project.updateMany.mockResolvedValue({ count: 1 });
    mocks.prisma.$transaction.mockImplementation(async (fn: (tx: typeof mocks.tx) => Promise<unknown>) => fn(mocks.tx));
  });

  it("checks client membership, state, approval and asset inside the guarded transaction", async () => {
    const res = await request();

    expect(res.status).toBe(200);
    expect(mocks.prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: "Serializable" });
    expect(mocks.tx.project.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        id: "p1",
        status: { in: ["FINAL_FILES_READY", "DELIVERED"] },
        client: { memberships: { some: { userId: "u1" } } },
        concepts: { some: { status: "approved" } },
        fileAssets: { some: { kind: "final_zip" } },
      },
    }));
    expect(mocks.tx.project.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ status: "FINAL_FILES_READY" }),
      data: { status: "DELIVERED" },
    }));
    expect(mocks.createSignedFinalDeliverableUrl).toHaveBeenCalled();
  });

  it("returns no URL when membership/state/approval/asset validation fails", async () => {
    mocks.tx.project.findFirst.mockResolvedValue(null);

    const res = await request();

    expect(res.status).toBe(404);
    expect(mocks.tx.project.updateMany).not.toHaveBeenCalled();
    expect(mocks.createSignedFinalDeliverableUrl).not.toHaveBeenCalled();
  });

  it("does not sign when a concurrent hold, approval removal, or asset removal loses the conditional guard", async () => {
    mocks.tx.project.updateMany.mockResolvedValue({ count: 0 });

    const res = await request();
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body.error.code).toBe("FINAL_DOWNLOAD_CONFLICT");
    expect(mocks.logAudit).not.toHaveBeenCalled();
    expect(mocks.createSignedFinalDeliverableUrl).not.toHaveBeenCalled();
  });

  it("transitions and signs FINAL_FILES_READY only after its conditional guard succeeds", async () => {
    const res = await request();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ url: "https://download.example/final.zip" });
    expect(mocks.logAudit).toHaveBeenCalledWith(mocks.tx, expect.objectContaining({
      projectId: "p1",
      actorId: "u1",
      type: "state_changed",
    }));
  });

  it("keeps a valid delivered state and signs without another transition audit", async () => {
    mocks.tx.project.findFirst.mockResolvedValue(project("DELIVERED"));

    const res = await request();

    expect(res.status).toBe(200);
    expect(mocks.tx.project.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ status: "DELIVERED" }),
      data: {
        status: "DELIVERED",
        updatedAt: new Date("2026-03-05T09:00:00.000Z"),
      },
    }));
    expect(mocks.logAudit).not.toHaveBeenCalled();
    expect(mocks.createSignedFinalDeliverableUrl).toHaveBeenCalledWith(
      "projects/p1/final.zip",
      60 * 60,
      "brand-2026-03-05.zip",
    );
  });
});
