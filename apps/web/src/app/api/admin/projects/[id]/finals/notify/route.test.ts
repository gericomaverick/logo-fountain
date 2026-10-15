import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  class RouteAuthError extends Error {
    constructor(public status: number, public code: string, message: string) { super(message); }
  }
  const tx = {
    project: { findFirst: vi.fn(), updateMany: vi.fn() },
  };
  return {
    RouteAuthError,
    requireUser: vi.fn(),
    requireAdmin: vi.fn(),
    notifyClientFinalDeliverablesReady: vi.fn(),
    transaction: vi.fn(),
    tx,
  };
});

vi.mock("@/lib/auth/require", () => ({
  requireUser: mocks.requireUser,
  requireAdmin: mocks.requireAdmin,
  toRouteErrorResponse: (error: unknown) => error instanceof mocks.RouteAuthError
    ? Response.json({ error: { code: error.code } }, { status: error.status })
    : Response.json({ error: "unexpected" }, { status: 500 }),
}));
vi.mock("@/lib/prisma", () => ({ prisma: { $transaction: mocks.transaction } }));
vi.mock("@/lib/project-lifecycle-email", () => ({
  notifyClientFinalDeliverablesReady: mocks.notifyClientFinalDeliverablesReady,
}));
vi.mock("@/lib/supabase/storage", () => {
  throw new Error("notification-only endpoint must not import storage");
});

import { POST } from "./route";

const projectUpdatedAt = "2026-03-05T10:00:00.000Z";
function request(body: Record<string, unknown> = { assetId: "asset-new", projectUpdatedAt }) {
  return POST(new Request("http://localhost/api/admin/projects/p1/finals/notify", {
    method: "POST",
    headers: { origin: "http://localhost", "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }), { params: Promise.resolve({ id: "p1" }) });
}

const currentAsset = { id: "asset-new", path: "p1/finals/new.zip", createdAt: new Date("2026-03-05T10:00:00Z") };
const currentProject = {
  id: "p1",
  status: "FINAL_FILES_READY",
  updatedAt: new Date(projectUpdatedAt),
  fileAssets: [currentAsset],
};

describe("POST /api/admin/projects/[id]/finals/notify", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireUser.mockResolvedValue({ id: "admin-1" });
    mocks.requireAdmin.mockResolvedValue(undefined);
    mocks.tx.project.findFirst.mockResolvedValue(currentProject);
    mocks.tx.project.updateMany.mockResolvedValue({ count: 1 });
    mocks.transaction.mockImplementation(async (fn: (tx: typeof mocks.tx) => Promise<unknown>) => fn(mocks.tx));
    mocks.notifyClientFinalDeliverablesReady.mockResolvedValue({ status: "sent" });
  });

  it("requires authentication and admin access", async () => {
    mocks.requireUser.mockRejectedValueOnce(new mocks.RouteAuthError(401, "UNAUTHORIZED", "Unauthorized"));
    expect((await request()).status).toBe(401);

    mocks.requireUser.mockResolvedValueOnce({ id: "user-1" });
    mocks.requireAdmin.mockRejectedValueOnce(new mocks.RouteAuthError(403, "FORBIDDEN", "Forbidden"));
    expect((await request()).status).toBe(403);
    expect(mocks.notifyClientFinalDeliverablesReady).not.toHaveBeenCalled();
  });

  it("requires an explicit current asset and project version", async () => {
    expect((await request({})).status).toBe(400);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("guards the requested current asset, eligible state, approval, and project version immediately before send", async () => {
    const response = await request();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ ok: true, committed: true, finalLive: true, notification: "sent" });
    expect(mocks.tx.project.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        id: "p1",
        status: { in: ["FINAL_FILES_READY", "DELIVERED"] },
        updatedAt: new Date(projectUpdatedAt),
        concepts: { some: { status: "approved" } },
        fileAssets: { some: { id: "asset-new", kind: "final_zip" } },
      },
      select: expect.objectContaining({
        fileAssets: expect.objectContaining({
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          take: 1,
        }),
      }),
    }));
    expect(mocks.tx.project.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        status: "FINAL_FILES_READY",
        updatedAt: new Date(projectUpdatedAt),
        fileAssets: { some: { id: "asset-new", kind: "final_zip", path: currentAsset.path } },
      }),
    }));
    expect(mocks.transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: "Serializable", maxWait: 2_000, timeout: 5_000,
    });
    expect(mocks.notifyClientFinalDeliverablesReady).toHaveBeenCalledWith("p1", "asset-new");
  });

  it("returns already-sent success for the guarded publication", async () => {
    mocks.notifyClientFinalDeliverablesReady.mockResolvedValueOnce({ status: "already_sent" });
    const response = await request();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ notification: "already_sent", finalLive: true });
  });

  it("rejects a replacement race when the requested asset is no longer newest", async () => {
    mocks.tx.project.findFirst.mockResolvedValueOnce({
      ...currentProject,
      fileAssets: [{ id: "asset-replacement", path: "p1/finals/replacement.zip", createdAt: new Date() }],
    });
    const response = await request();
    expect(response.status).toBe(409);
    expect(mocks.notifyClientFinalDeliverablesReady).not.toHaveBeenCalled();
  });

  it("rejects a late state, approval, or version conflict when the conditional guard loses", async () => {
    mocks.tx.project.updateMany.mockResolvedValueOnce({ count: 0 });
    const response = await request();
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "FINAL_NOTIFICATION_CONFLICT" } });
    expect(mocks.notifyClientFinalDeliverablesReady).not.toHaveBeenCalled();
  });

  it("rejects cancelled, refunded, on-hold, or otherwise ineligible current state", async () => {
    mocks.tx.project.findFirst.mockResolvedValueOnce(null);
    expect((await request()).status).toBe(409);
    expect(mocks.notifyClientFinalDeliverablesReady).not.toHaveBeenCalled();
  });

  it("returns committed partial status for skipped configuration", async () => {
    mocks.notifyClientFinalDeliverablesReady.mockResolvedValueOnce({ status: "skipped", reason: "not_configured" });
    const response = await request();
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      ok: false, committed: true, finalLive: true, code: "FINAL_NOTIFICATION_SKIPPED",
    });
  });

  it("returns committed partial status for provider failure without exposing details", async () => {
    mocks.notifyClientFinalDeliverablesReady.mockRejectedValueOnce(new Error("provider secret body"));
    const response = await request();
    const body = await response.json();
    expect(response.status).toBe(502);
    expect(body).toMatchObject({ ok: false, committed: true, finalLive: true, code: "FINAL_NOTIFICATION_FAILED" });
    expect(JSON.stringify(body)).not.toContain("provider secret body");
  });
});
