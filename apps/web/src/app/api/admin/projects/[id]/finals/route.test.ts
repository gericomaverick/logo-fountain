import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  class RouteAuthError extends Error {
    constructor(public status: number, public code: string, message: string) { super(message); }
  }
  class UploadValidationError extends Error {
    constructor(public code: string, message: string) { super(message); }
  }
  const tx = {
    fileAsset: { findFirst: vi.fn(), create: vi.fn() },
    project: { updateMany: vi.fn() },
  };
  return {
    RouteAuthError, UploadValidationError,
    requireUser: vi.fn(), requireAdmin: vi.fn(), applyTransition: vi.fn(),
    uploadFinalDeliverable: vi.fn(), deleteStoredFiles: vi.fn(), prepareFinalZip: vi.fn(), logAudit: vi.fn(),
    createProjectSystemMessage: vi.fn(), notifyClientFinalDeliverablesReady: vi.fn(), tx,
    prisma: {
      project: { findUnique: vi.fn() },
      concept: { count: vi.fn() },
      fileAsset: { findFirst: vi.fn() },
      $transaction: vi.fn(),
    },
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
vi.mock("@/lib/upload-validation", () => ({
  prepareFinalZip: mocks.prepareFinalZip,
  UploadValidationError: mocks.UploadValidationError,
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
  return POST(new Request("http://localhost/api/admin/projects/p1/finals", { headers: { origin: "https://app.example.com" }, method: "POST", body: form }), {
    params: Promise.resolve({ id: "p1" }),
  });
}

const updatedAt = new Date("2026-03-05T09:00:00Z");
const newUpload = { bucket: "final-deliverables", path: "p1/finals/new-version.zip", mime: "application/zip", size: 3 };
const oldAsset = { id: "asset-old", path: "p1/finals/old-version.zip" };
const newAsset = { id: "asset-new", kind: "final_zip", path: newUpload.path };

describe("POST /api/admin/projects/[id]/finals", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("PUBLIC_SITE_URL", "https://app.example.com");
    mocks.requireUser.mockResolvedValue({ id: "admin-1" });
    mocks.requireAdmin.mockResolvedValue(undefined);
    mocks.prisma.project.findUnique.mockResolvedValue({ id: "p1", status: "FINAL_FILES_READY", updatedAt });
    mocks.prisma.concept.count.mockResolvedValue(1);
    mocks.prisma.fileAsset.findFirst.mockResolvedValue(null);
    mocks.applyTransition.mockReturnValue({ ok: true });
    mocks.prepareFinalZip.mockResolvedValue({ bytes: new Uint8Array([1]), extension: "zip", contentType: "application/zip", contentDisposition: "attachment", size: 1 });
    mocks.uploadFinalDeliverable.mockResolvedValue(newUpload);
    mocks.deleteStoredFiles.mockResolvedValue({ attempted: 1, deleted: 1, failures: [] });
    mocks.tx.project.updateMany.mockResolvedValue({ count: 1 });
    mocks.tx.fileAsset.findFirst.mockResolvedValue(oldAsset);
    mocks.tx.fileAsset.create.mockResolvedValue(newAsset);
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

  it("rejects missing and invalid files before storage", async () => {
    expect((await request(null)).status).toBe(400);
    mocks.prepareFinalZip.mockRejectedValueOnce(new mocks.UploadValidationError("INVALID_FILE_TYPE", "Use a ZIP"));
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
    expect(mocks.tx.fileAsset.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    }));
    expect(mocks.tx.fileAsset.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ path: newUpload.path }) }));
    expect(body.retainedPreviousAsset).toEqual(oldAsset);
    expect(mocks.deleteStoredFiles).not.toHaveBeenCalled();
    expect(mocks.createProjectSystemMessage).not.toHaveBeenCalled();
  });

  it("retains the newly uploaded object after a typed optimistic conflict", async () => {
    mocks.tx.project.updateMany.mockResolvedValueOnce({ count: 0 });

    const response = await request();

    expect(response.status).toBe(409);
    expect(mocks.tx.fileAsset.create).not.toHaveBeenCalled();
    expect(mocks.logAudit).not.toHaveBeenCalled();
    expect(mocks.prisma.fileAsset.findFirst).toHaveBeenCalled();
    expect(mocks.deleteStoredFiles).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toMatchObject({
      code: "FINAL_PUBLICATION_CONFLICT", uploadedObjectRetained: true,
    });
  });

  it("treats committed-then-thrown transactions as committed without deleting storage", async () => {
    mocks.prisma.$transaction.mockImplementationOnce(async (fn: (tx: typeof mocks.tx) => Promise<unknown>) => {
      await fn(mocks.tx);
      throw new Error("connection lost after commit");
    });
    mocks.prisma.fileAsset.findFirst.mockResolvedValueOnce({
      ...newAsset,
      project: { id: "p1", status: "FINAL_FILES_READY", fileAssets: [{ id: "asset-new" }] },
    });

    const response = await request();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      ok: true,
      fileAsset: newAsset,
      recoveredAfterTransactionError: true,
      currentPublication: true,
    });
    expect(mocks.deleteStoredFiles).not.toHaveBeenCalled();
    expect(mocks.notifyClientFinalDeliverablesReady).toHaveBeenCalledWith("p1", "asset-new");
  });

  it("does not notify a recovered publication that has already been superseded", async () => {
    mocks.prisma.$transaction.mockRejectedValueOnce(new Error("ambiguous transaction result"));
    mocks.prisma.fileAsset.findFirst.mockResolvedValueOnce({
      ...newAsset,
      project: { id: "p1", status: "FINAL_FILES_READY", fileAssets: [{ id: "asset-later" }] },
    });

    const response = await request();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      recoveredAfterTransactionError: true,
      currentPublication: false,
    });
    expect(mocks.deleteStoredFiles).not.toHaveBeenCalled();
    expect(mocks.notifyClientFinalDeliverablesReady).not.toHaveBeenCalled();
  });

  it("fails safe without deleting when an ambiguous publication cannot be verified", async () => {
    mocks.prisma.$transaction.mockRejectedValueOnce(new Error("connection lost"));
    mocks.prisma.fileAsset.findFirst.mockRejectedValueOnce(new Error("database unavailable"));

    const response = await request();
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body).toMatchObject({
      ok: false,
      committed: "unknown",
      code: "FINAL_PUBLICATION_OUTCOME_UNKNOWN",
      uploadedObject: { bucket: newUpload.bucket, path: newUpload.path },
    });
    expect(mocks.deleteStoredFiles).not.toHaveBeenCalled();
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
    expect(mocks.notifyClientFinalDeliverablesReady).toHaveBeenCalledWith("p1", "asset-new");
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
      retry: { method: "POST", path: "/api/admin/projects/p1/finals/notify" },
    });
  });

  it("reports unexpected post-commit failures as committed partial success", async () => {
    mocks.notifyClientFinalDeliverablesReady.mockResolvedValueOnce(null);

    const response = await request();
    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      committed: true,
      code: "FINAL_PUBLISHED_POST_COMMIT_FAILED",
      retry: { method: "POST", path: "/api/admin/projects/p1/finals/notify" },
    });
    expect(mocks.deleteStoredFiles).not.toHaveBeenCalled();
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
      retry: { method: "POST", path: "/api/admin/projects/p1/finals/notify" },
    });
    expect(JSON.stringify(body)).not.toContain("provider details");
  });
});
