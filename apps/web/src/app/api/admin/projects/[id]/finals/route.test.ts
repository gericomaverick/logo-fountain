import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  requireAdmin: vi.fn(),
  toRouteErrorResponse: vi.fn(),
  applyTransition: vi.fn(),
  uploadFinalDeliverable: vi.fn(),
  logAudit: vi.fn(),
  createProjectSystemMessage: vi.fn(),
  notifyClientFinalDeliverablesReady: vi.fn(),
  tx: {
    fileAsset: { findFirst: vi.fn(), update: vi.fn(), create: vi.fn() },
    project: { updateMany: vi.fn() },
  },
  prisma: {
    project: { findUnique: vi.fn() },
    concept: { count: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock("@/lib/auth/require", () => ({
  requireUser: mocks.requireUser,
  requireAdmin: mocks.requireAdmin,
  toRouteErrorResponse: mocks.toRouteErrorResponse,
}));
vi.mock("@/lib/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/project-state-machine", () => ({ applyTransition: mocks.applyTransition }));
vi.mock("@/lib/supabase/storage", () => ({ uploadFinalDeliverable: mocks.uploadFinalDeliverable }));
vi.mock("@/lib/audit", () => ({ logAudit: mocks.logAudit }));
vi.mock("@/lib/system-messages", () => ({ createProjectSystemMessage: mocks.createProjectSystemMessage }));
vi.mock("@/lib/project-lifecycle-email", () => ({
  notifyClientFinalDeliverablesReady: mocks.notifyClientFinalDeliverablesReady,
}));

import { POST } from "./route";

function request() {
  const form = new FormData();
  form.set("file", new File(["zip"], "final.zip", { type: "application/zip" }));
  return POST(new Request("http://localhost/api/admin/projects/p1/finals", { method: "POST", body: form }), {
    params: Promise.resolve({ id: "p1" }),
  });
}

describe("POST /api/admin/projects/[id]/finals", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireUser.mockResolvedValue({ id: "admin-1" });
    mocks.requireAdmin.mockResolvedValue(undefined);
    mocks.prisma.project.findUnique.mockResolvedValue({
      id: "p1",
      status: "FINAL_FILES_READY",
      updatedAt: new Date("2026-03-05T09:00:00Z"),
    });
    mocks.prisma.concept.count.mockResolvedValue(1);
    mocks.uploadFinalDeliverable.mockResolvedValue({
      bucket: "final-deliverables",
      path: "p1/final-deliverable.zip",
      mime: "application/zip",
      size: 3,
    });
    mocks.tx.project.updateMany.mockResolvedValue({ count: 1 });
    mocks.tx.fileAsset.findFirst.mockResolvedValue({ id: "asset-1" });
    mocks.tx.fileAsset.update.mockResolvedValue({ id: "asset-1", kind: "final_zip", path: "p1/final-deliverable.zip" });
    mocks.logAudit.mockResolvedValue(undefined);
    mocks.notifyClientFinalDeliverablesReady.mockResolvedValue({ status: "already_sent" });
    mocks.prisma.$transaction.mockImplementation(async (fn: (tx: typeof mocks.tx) => Promise<unknown>) => fn(mocks.tx));
  });

  it.each(["FINAL_FILES_READY", "DELIVERED"])("repairs/replaces a missing asset while preserving %s", async (status) => {
    mocks.prisma.project.findUnique.mockResolvedValueOnce({
      id: "p1",
      status,
      updatedAt: new Date("2026-03-05T09:00:00Z"),
    });

    const res = await request();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.project.status).toBe(status);
    expect(mocks.applyTransition).not.toHaveBeenCalled();
    expect(mocks.tx.project.updateMany).toHaveBeenCalledWith({
      where: {
        id: "p1",
        status,
        updatedAt: new Date("2026-03-05T09:00:00Z"),
      },
      data: { status, updatedAt: new Date("2026-03-05T09:00:00Z") },
    });
    expect(mocks.logAudit).toHaveBeenCalledTimes(1);
    expect(mocks.logAudit).toHaveBeenCalledWith(mocks.tx, expect.objectContaining({ type: "finals_uploaded" }));
    expect(mocks.createProjectSystemMessage).not.toHaveBeenCalled();
  });

  it("does not write audits or metadata when the repair loses its state guard", async () => {
    mocks.tx.project.updateMany.mockResolvedValueOnce({ count: 0 });

    const res = await request();

    expect(res.status).toBe(400);
    expect(mocks.tx.fileAsset.update).not.toHaveBeenCalled();
    expect(mocks.logAudit).not.toHaveBeenCalled();
  });

  it("validates an invalid repair before uploading storage", async () => {
    mocks.prisma.concept.count.mockResolvedValueOnce(0);

    const res = await request();

    expect(res.status).toBe(400);
    expect(mocks.uploadFinalDeliverable).not.toHaveBeenCalled();
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
  });
});
