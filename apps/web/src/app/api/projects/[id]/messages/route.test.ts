import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  requireAdmin: vi.fn(),
  requireProjectMembership: vi.fn(),
  toRouteErrorResponse: vi.fn(),
  logAudit: vi.fn(),
  notifyAdminMessageFromProject: vi.fn(),
  notifyClientNewMessage: vi.fn(),
  tx: {
    messageThread: { upsert: vi.fn() },
    message: { create: vi.fn() },
  },
  prisma: {
    profile: { upsert: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock("@/lib/auth/require", () => ({
  requireUser: mocks.requireUser,
  requireAdmin: mocks.requireAdmin,
  requireProjectMembership: mocks.requireProjectMembership,
  toRouteErrorResponse: mocks.toRouteErrorResponse,
  RouteAuthError: class RouteAuthError extends Error {
    constructor(public message: string, public status: number, public code: string) {
      super(message);
    }
  },
}));

vi.mock("@/lib/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/audit", () => ({ logAudit: mocks.logAudit }));
vi.mock("@/lib/project-lifecycle-email", () => ({
  notifyAdminMessageFromProject: mocks.notifyAdminMessageFromProject,
  notifyClientNewMessage: mocks.notifyClientNewMessage,
}));

import { POST } from "./route";

describe("POST /api/projects/[id]/messages", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireUser.mockResolvedValue({ id: "u1", email: "x@example.com", user_metadata: {} });
    mocks.requireAdmin.mockResolvedValue(undefined);
    mocks.toRouteErrorResponse.mockImplementation((err: Error) =>
      Response.json({ error: { message: err.message, code: "ERR" } }, { status: 500 }),
    );

    mocks.tx.messageThread.upsert.mockResolvedValue({ id: "t1" });
    mocks.tx.message.create.mockResolvedValue({
      id: "m1",
      body: "Hello",
      createdAt: new Date().toISOString(),
      sender: { id: "u1", email: "x@example.com", isAdmin: true },
    });
    mocks.prisma.$transaction.mockImplementation(async (fn: (tx: typeof mocks.tx) => Promise<unknown>) => fn(mocks.tx));
    mocks.logAudit.mockResolvedValue(undefined);
    mocks.notifyAdminMessageFromProject.mockResolvedValue(undefined);
    mocks.notifyClientNewMessage.mockResolvedValue(undefined);
  });

  it("returns jsonError shape for invalid body", async () => {
    const req = new Request("http://localhost", { method: "POST", body: JSON.stringify({ body: "" }) });
    const res = await POST(req, { params: Promise.resolve({ id: "p1" }) });

    expect(res.status).toBe(400);
    const payload = await res.json();
    expect(payload).toMatchObject({
      error: {
        code: "INVALID_MESSAGE_BODY",
        message: "Message body is required (1-2000 chars)",
      },
    });
  });

  it("upserts profile with isAdmin=true for admin sender", async () => {
    const req = new Request("http://localhost", { method: "POST", body: JSON.stringify({ body: "Hello" }) });
    const res = await POST(req, { params: Promise.resolve({ id: "p1" }) });

    expect(res.status).toBe(201);
    expect(mocks.prisma.profile.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ isAdmin: true }),
        update: expect.objectContaining({ isAdmin: true }),
      }),
    );
  });
});
