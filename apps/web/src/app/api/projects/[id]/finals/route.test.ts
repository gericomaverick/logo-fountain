import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  requireProjectMembership: vi.fn(),
  toRouteErrorResponse: vi.fn(),
  buildFinalDeliverableFilename: vi.fn(),
  createSignedFinalDeliverableUrl: vi.fn(),
  applyTransition: vi.fn(),
  logAudit: vi.fn(),
  tx: {
    project: { update: vi.fn() },
  },
  prisma: {
    project: { findFirst: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock("@/lib/auth/require", () => ({
  requireUser: mocks.requireUser,
  requireProjectMembership: mocks.requireProjectMembership,
  toRouteErrorResponse: mocks.toRouteErrorResponse,
}));

vi.mock("@/lib/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/final-deliverable-filename", () => ({ buildFinalDeliverableFilename: mocks.buildFinalDeliverableFilename }));
vi.mock("@/lib/supabase/storage", () => ({ createSignedFinalDeliverableUrl: mocks.createSignedFinalDeliverableUrl }));
vi.mock("@/lib/project-state-machine", () => ({ applyTransition: mocks.applyTransition }));
vi.mock("@/lib/audit", () => ({ logAudit: mocks.logAudit }));

import { GET } from "./route";

describe("GET /api/projects/[id]/finals", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireUser.mockResolvedValue({ id: "u1" });
    mocks.requireProjectMembership.mockResolvedValue({ id: "p1" });
    mocks.toRouteErrorResponse.mockImplementation((err: Error) =>
      Response.json({ error: { message: err.message, code: "ERR" } }, { status: 500 }),
    );
    mocks.buildFinalDeliverableFilename.mockReturnValue("brand-2026-03-05.zip");
    mocks.createSignedFinalDeliverableUrl.mockResolvedValue("https://download.example/final.zip");
    mocks.applyTransition.mockReturnValue({ ok: true, allowed: ["DELIVERED"] });
    mocks.logAudit.mockResolvedValue(undefined);
    mocks.tx.project.update.mockResolvedValue({ id: "p1", status: "DELIVERED" });
    mocks.prisma.$transaction.mockImplementation(async (fn: (tx: typeof mocks.tx) => Promise<unknown>) => fn(mocks.tx));
  });

  it("transitions FINAL_FILES_READY to DELIVERED on first download", async () => {
    mocks.prisma.project.findFirst.mockResolvedValue({
      id: "p1",
      status: "FINAL_FILES_READY",
      client: { name: "Acme", memberships: [] },
      fileAssets: [{ path: "projects/p1/final.zip", createdAt: new Date("2026-03-05T08:00:00.000Z") }],
    });

    const res = await GET(new Request("http://localhost"), { params: Promise.resolve({ id: "p1" }) });

    expect(res.status).toBe(200);
    expect(mocks.applyTransition).toHaveBeenCalledWith("FINAL_FILES_READY", "DELIVERED");
    expect(mocks.tx.project.update).toHaveBeenCalledWith({ where: { id: "p1" }, data: { status: "DELIVERED" } });
    expect(mocks.logAudit).toHaveBeenCalled();
  });

  it("does not transition when already DELIVERED", async () => {
    mocks.prisma.project.findFirst.mockResolvedValue({
      id: "p1",
      status: "DELIVERED",
      client: { name: "Acme", memberships: [] },
      fileAssets: [{ path: "projects/p1/final.zip", createdAt: new Date("2026-03-05T08:00:00.000Z") }],
    });

    const res = await GET(new Request("http://localhost"), { params: Promise.resolve({ id: "p1" }) });

    expect(res.status).toBe(200);
    expect(mocks.applyTransition).not.toHaveBeenCalled();
    expect(mocks.tx.project.update).not.toHaveBeenCalled();
  });
});
