import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  class RouteAuthError extends Error {
    constructor(public status: number, public code: string, message: string) { super(message); }
  }
  return {
    RouteAuthError,
    requireUser: vi.fn(),
    requireAdmin: vi.fn(),
    notifyClientFinalDeliverablesReady: vi.fn(),
    projectFindFirst: vi.fn(),
  };
});

vi.mock("@/lib/auth/require", () => ({
  requireUser: mocks.requireUser,
  requireAdmin: mocks.requireAdmin,
  toRouteErrorResponse: (error: unknown) => error instanceof mocks.RouteAuthError
    ? Response.json({ error: { code: error.code } }, { status: error.status })
    : Response.json({ error: "unexpected" }, { status: 500 }),
}));
vi.mock("@/lib/prisma", () => ({ prisma: { project: { findFirst: mocks.projectFindFirst } } }));
vi.mock("@/lib/project-lifecycle-email", () => ({
  notifyClientFinalDeliverablesReady: mocks.notifyClientFinalDeliverablesReady,
}));
vi.mock("@/lib/supabase/storage", () => {
  throw new Error("notification-only endpoint must not import storage");
});

import { POST } from "./route";

function request() {
  return POST(new Request("http://localhost/api/admin/projects/p1/finals/notify", { method: "POST" }), {
    params: Promise.resolve({ id: "p1" }),
  });
}

const currentAsset = { id: "asset-new", path: "p1/finals/new.zip", createdAt: new Date("2026-03-05T10:00:00Z") };

describe("POST /api/admin/projects/[id]/finals/notify", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireUser.mockResolvedValue({ id: "admin-1" });
    mocks.requireAdmin.mockResolvedValue(undefined);
    mocks.projectFindFirst.mockResolvedValue({ id: "p1", status: "FINAL_FILES_READY", fileAssets: [currentAsset] });
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

  it("revalidates final state, approval, and newest current asset ordering", async () => {
    const response = await request();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ ok: true, committed: true, finalLive: true, notification: "sent" });
    expect(mocks.projectFindFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        id: "p1",
        status: { in: ["FINAL_FILES_READY", "DELIVERED"] },
        concepts: { some: { status: "approved" } },
      }),
      select: expect.objectContaining({
        fileAssets: expect.objectContaining({
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          take: 1,
        }),
      }),
    }));
    expect(mocks.notifyClientFinalDeliverablesReady).toHaveBeenCalledWith("p1", "asset-new");
  });

  it("returns already-sent success for the current publication", async () => {
    mocks.notifyClientFinalDeliverablesReady.mockResolvedValueOnce({ status: "already_sent" });
    const response = await request();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ notification: "already_sent", finalLive: true });
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

  it("rejects notification when there is no currently valid publication", async () => {
    mocks.projectFindFirst.mockResolvedValueOnce(null);
    expect((await request()).status).toBe(409);
    expect(mocks.notifyClientFinalDeliverablesReady).not.toHaveBeenCalled();
  });
});
