import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  class RouteAuthError extends Error {
    constructor(public status: number, public code: string, message: string) { super(message); }
  }
  const tx = {
    fileAsset: { findFirst: vi.fn(), create: vi.fn(), delete: vi.fn() },
    project: { updateMany: vi.fn() },
  };
  return {
    RouteAuthError,
    requireUser: vi.fn(), requireAdmin: vi.fn(), applyTransition: vi.fn(),
    uploadFinalDeliverable: vi.fn(), deleteStoredFiles: vi.fn(), logAudit: vi.fn(),
    createProjectSystemMessage: vi.fn(), notifyClientFinalDeliverablesReady: vi.fn(), tx,
    prisma: { project: { findUnique: vi.fn() }, concept: { count: vi.fn() }, $transaction: vi.fn() },
  };
});

vi.mock("@/lib/auth/require", () => ({
  requireUser: mocks.requireUser,
  requireAdmin: mocks.requireAdmin,
  toRouteErrorResponse: (error: unknown) => error instanceof mocks.RouteAuthError
    ? Response.json({ error: { code: error.code, message: error.message } }, { status: error.status })
    : Response.json({ error: "unexpected" }, { status: 500 }),
}));
vi.mock("@/lib/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/project-state-machine", () => ({ applyTransition: mocks.applyTransition }));
vi.mock("@/lib/supabase/storage", () => ({
  uploadFinalDeliverable: mocks.uploadFinalDeliverable,
  deleteStoredFiles: mocks.deleteStoredFiles,
}));
vi.mock("@/lib/audit", () => ({ logAudit: mocks.logAudit }));
vi.mock("@/lib/system-messages", () => ({ createProjectSystemMessage: mocks.createProjectSystemMessage }));
vi.mock("@/lib/project-lifecycle-email", () => ({
  notifyClientFinalDeliverablesReady: mocks.notifyClientFinalDeliverablesReady,
}));

import { POST } from "./route";

function zipFile() { return new File(["zip"], "final.zip", { type: "application/zip" }); }
function request(file: File | null = zipFile()) {
  const form = new FormData();
  if (file) form.set("file", file);
  return POST(new Request("http://localhost/api/admin/projects/p1/finals", { method: "POST", body: form }), {
    params: Promise.resolve({ id: "p1" }),
  });
}

const updatedAt = new Date("2026-03-05T09:00:00Z");
const newUpload = { bucket: "final-deliverables", path: "p1/finals/new-version.zip", mime: "application/zip", size: 3 };
const oldAsset = { id: "asset-old", bucket: "final-deliverables", path: "p1/finals/old-version.zip" };
const newAsset = { id: "asset-new", kind: "final_zip", path: newUpload.path };

describe("POST /api/admin/projects/[id]/finals", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("NODE_ENV", "test");
    mocks.requireUser.mockResolvedValue({ id: "admin-1" });
    mocks.requireAdmin.mockResolvedValue(undefined);
    mocks.prisma.project.findUnique.mockResolvedValue({ id: "p1", status: "FINAL_FILES_READY", updatedAt });
    mocks.prisma.concept.count.mockResolvedValue(1);
    mocks.applyTransition.mockReturnValue({ ok: true });
    mocks.uploadFinalDeliverable.mockResolvedValue(newUpload);
    mocks.deleteStoredFiles.mockResolvedValue({ attempted: 1, deleted: 1, failures: [] });
    mocks.tx.project.updateMany.mockResolvedValue({ count: 1 });
    mocks.tx.fileAsset.findFirst.mockResolvedValue(oldAsset);
    mocks.tx.fileAsset.create.mockResolvedValue(newAsset);
    mocks.tx.fileAsset.delete.mockResolvedValue(oldAsset);
    mocks.logAudit.mockResolvedValue(undefined);
    mocks.createProjectSystemMessage.mockResolvedValue(undefined);
    mocks.notifyClientFinalDeliverablesReady.mockResolvedValue({ status: "already_sent" });
    mocks.prisma.$transaction.mockImplementation(async (fn: (tx: typeof mocks.tx) => Promise<unknown>) => fn(mocks.tx));
  });

  it("returns 403 for non-admin users", async () => {
    mocks.requireAdmin.mockRejectedValue(new mocks.RouteAuthError(403, "FORBIDDEN", "Forbidden"));
    expect((await request()).status).toBe(403);
    expect(mocks.uploadFinalDeliverable).not.toHaveBeenCalled();
  });

  it("returns 404 for an unknown project", async () => {
    mocks.prisma.project.findUnique.mockResolvedValue(null);
    expect((await request()).status).toBe(404);
  });

  it("rejects missing and non-ZIP files", async () => {
    expect((await request(null)).status).toBe(400);
    expect((await request(new File(["x"], "logo.png", { type: "image/png" }))).status).toBe(400);
    expect(mocks.uploadFinalDeliverable).not.toHaveBeenCalled();
  });

  it.each(["FINAL_FILES_READY", "DELIVERED"])("repairs/replaces finals while preserving %s", async (status) => {
    mocks.prisma.project.findUnique.mockResolvedValueOnce({ id: "p1", status, updatedAt });

    const response = await request();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.project.status).toBe(status);
    expect(body.fileAsset).toEqual(newAsset);
    expect(mocks.applyTransition).not.toHaveBeenCalled();
    expect(mocks.tx.project.updateMany).toHaveBeenCalledWith({
      where: { id: "p1", status, updatedAt, concepts: { some: { status: "approved" } } },
      data: { status, updatedAt: expect.any(Date) },
    });
    expect(mocks.prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: "Serializable",
      maxWait: 2_000,
      timeout: 5_000,
    });
    expect(mocks.tx.fileAsset.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ path: newUpload.path }) }));
    expect(mocks.tx.fileAsset.delete).toHaveBeenCalledWith({ where: { id: oldAsset.id } });
    expect(mocks.deleteStoredFiles).toHaveBeenCalledWith([{ bucket: oldAsset.bucket, path: oldAsset.path }]);
    expect(mocks.createProjectSystemMessage).not.toHaveBeenCalled();
  });

  it("keeps the currently published record/path intact and deletes only the new object when the DB guard fails", async () => {
    mocks.tx.project.updateMany.mockResolvedValueOnce({ count: 0 });

    const response = await request();

    expect(response.status).toBe(409);
    expect(mocks.tx.fileAsset.create).not.toHaveBeenCalled();
    expect(mocks.tx.fileAsset.delete).not.toHaveBeenCalled();
    expect(mocks.logAudit).not.toHaveBeenCalled();
    expect(mocks.deleteStoredFiles).toHaveBeenCalledTimes(1);
    expect(mocks.deleteStoredFiles).toHaveBeenCalledWith([{ bucket: newUpload.bucket, path: newUpload.path }]);
    expect(mocks.deleteStoredFiles).not.toHaveBeenCalledWith([{ bucket: oldAsset.bucket, path: oldAsset.path }]);
  });

  it("validates an invalid repair before uploading", async () => {
    mocks.prisma.concept.count.mockResolvedValueOnce(0);
    expect((await request()).status).toBe(400);
    expect(mocks.uploadFinalDeliverable).not.toHaveBeenCalled();
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
  });

  it("creates and publishes finals, transitions state, and notifies the client", async () => {
    mocks.prisma.project.findUnique.mockResolvedValueOnce({ id: "p1", status: "AWAITING_APPROVAL", updatedAt });
    mocks.tx.fileAsset.findFirst.mockResolvedValueOnce(null);
    mocks.notifyClientFinalDeliverablesReady.mockResolvedValueOnce({ status: "sent" });

    const response = await request();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.project.status).toBe("FINAL_FILES_READY");
    expect(mocks.createProjectSystemMessage).toHaveBeenCalled();
    expect(mocks.notifyClientFinalDeliverablesReady).toHaveBeenCalledWith("p1");
    expect(mocks.deleteStoredFiles).not.toHaveBeenCalled();
  });

  it("keeps an upload in AWAITING_APPROVAL when no concept is approved", async () => {
    mocks.prisma.project.findUnique.mockResolvedValueOnce({ id: "p1", status: "CONCEPTS_READY", updatedAt });
    mocks.prisma.concept.count.mockResolvedValueOnce(0);
    mocks.tx.fileAsset.findFirst.mockResolvedValueOnce(null);

    const response = await request();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.project.status).toBe("AWAITING_APPROVAL");
    expect(mocks.tx.project.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ concepts: { none: { status: "approved" } } }),
    }));
    expect(mocks.notifyClientFinalDeliverablesReady).not.toHaveBeenCalled();
  });

  it("returns an actionable partial failure when production email is skipped", async () => {
    vi.stubEnv("NODE_ENV", "production");
    mocks.notifyClientFinalDeliverablesReady.mockResolvedValueOnce({ status: "skipped", reason: "not_configured" });

    const response = await request();
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body).toMatchObject({
      ok: false,
      committed: true,
      code: "FINAL_PUBLISHED_EMAIL_SKIPPED",
      retry: { method: "POST", path: "/api/admin/projects/p1/finals", requiresZip: true },
    });
  });

  it("returns an actionable partial failure when the provider send fails", async () => {
    mocks.notifyClientFinalDeliverablesReady.mockRejectedValueOnce(new Error("provider details must not escape"));

    const response = await request();
    const body = await response.json();

    expect(response.status).toBe(502);
    expect(body).toMatchObject({
      ok: false,
      committed: true,
      code: "FINAL_PUBLISHED_EMAIL_FAILED",
      retry: { method: "POST", path: "/api/admin/projects/p1/finals", requiresZip: true },
    });
    expect(JSON.stringify(body)).not.toContain("provider details");
  });
});
