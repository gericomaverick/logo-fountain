import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  requireAdmin: vi.fn(),
  toRouteErrorResponse: vi.fn(),
  buildFinalDeliverableFilename: vi.fn(),
  createSignedFinalDeliverableUrl: vi.fn(),
  tx: { project: { findFirst: vi.fn(), updateMany: vi.fn() } },
  prisma: { $transaction: vi.fn() },
}));

vi.mock("@/lib/auth/require", () => ({
  requireUser: mocks.requireUser,
  requireAdmin: mocks.requireAdmin,
  toRouteErrorResponse: mocks.toRouteErrorResponse,
}));
vi.mock("@/lib/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/final-deliverable-filename", () => ({ buildFinalDeliverableFilename: mocks.buildFinalDeliverableFilename }));
vi.mock("@/lib/supabase/storage", () => ({ createSignedFinalDeliverableUrl: mocks.createSignedFinalDeliverableUrl }));

import { POST } from "./route";

function request() {
  return POST(new Request("http://localhost", { method: "POST" }), { params: Promise.resolve({ id: "p1" }) });
}

describe("POST /api/admin/projects/[id]/finals/download", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireUser.mockResolvedValue({ id: "admin-1" });
    mocks.requireAdmin.mockResolvedValue(undefined);
    mocks.toRouteErrorResponse.mockReturnValue(Response.json({ error: { code: "FORBIDDEN" } }, { status: 403 }));
    mocks.buildFinalDeliverableFilename.mockReturnValue("brand.zip");
    mocks.createSignedFinalDeliverableUrl.mockResolvedValue("https://download.example/admin-final.zip");
    mocks.tx.project.findFirst.mockResolvedValue({
      id: "p1",
      status: "DELIVERED",
      updatedAt: new Date("2026-03-05T09:00:00Z"),
      client: { name: "Acme", memberships: [] },
      fileAssets: [{ path: "projects/p1/final.zip", createdAt: new Date("2026-03-05T08:00:00Z") }],
    });
    mocks.tx.project.updateMany.mockResolvedValue({ count: 1 });
    mocks.prisma.$transaction.mockImplementation(async (fn: (tx: typeof mocks.tx) => Promise<unknown>) => fn(mocks.tx));
  });

  it("rejects a signed-in non-admin before querying or signing", async () => {
    mocks.requireAdmin.mockRejectedValueOnce(new Error("forbidden"));

    const res = await request();

    expect(res.status).toBe(403);
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
    expect(mocks.createSignedFinalDeliverableUrl).not.toHaveBeenCalled();
  });

  it("lets an admin sign through the dedicated guarded path without client membership", async () => {
    const res = await request();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ url: "https://download.example/admin-final.zip" });
    expect(mocks.tx.project.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        id: "p1",
        status: { in: ["FINAL_FILES_READY", "DELIVERED"] },
        concepts: { some: { status: "approved" } },
        fileAssets: { some: { kind: "final_zip" } },
      },
    }));
  });

  it("does not sign if a concurrent state/approval/asset change loses the guard", async () => {
    mocks.tx.project.updateMany.mockResolvedValue({ count: 0 });

    const res = await request();

    expect(res.status).toBe(409);
    expect(mocks.createSignedFinalDeliverableUrl).not.toHaveBeenCalled();
  });
});
