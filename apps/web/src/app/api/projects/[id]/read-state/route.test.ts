import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  requireAdmin: vi.fn(),
  requireProjectMembership: vi.fn(),
  toRouteErrorResponse: vi.fn(),
  prisma: {
    message: { aggregate: vi.fn() },
    concept: { aggregate: vi.fn() },
    conceptComment: { aggregate: vi.fn() },
    projectReadState: { upsert: vi.fn() },
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

import { RouteAuthError } from "@/lib/auth/require";
import { POST } from "./route";

describe("POST /api/projects/[id]/read-state", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireUser.mockResolvedValue({ id: "u1" });
    mocks.requireAdmin.mockResolvedValue(undefined);
    mocks.requireProjectMembership.mockResolvedValue({ id: "p1", clientId: "c1" });
    mocks.prisma.message.aggregate.mockResolvedValue({ _max: { createdAt: new Date("2026-03-03T10:00:00.000Z") } });
    mocks.prisma.concept.aggregate.mockResolvedValue({ _max: { createdAt: new Date("2026-03-03T10:00:00.000Z"), updatedAt: new Date("2026-03-03T10:00:00.000Z") } });
    mocks.prisma.conceptComment.aggregate.mockResolvedValue({ _max: { createdAt: null } });
    mocks.prisma.projectReadState.upsert.mockResolvedValue({});
    mocks.toRouteErrorResponse.mockImplementation((err: Error) =>
      Response.json({ error: { message: err.message, code: "ERR" } }, { status: 500 }),
    );
  });

  it("rejects invalid area", async () => {
    const req = new Request("http://localhost", { method: "POST", body: JSON.stringify({ area: "other" }) });
    const res = await POST(req, { params: Promise.resolve({ id: "p1" }) });

    expect(res.status).toBe(400);
    const payload = await res.json();
    expect(payload.error.code).toBe("INVALID_AREA");
  });

  it("allows admin and writes messages seen time", async () => {
    const req = new Request("http://localhost", { method: "POST", body: JSON.stringify({ area: "messages" }) });
    const res = await POST(req, { params: Promise.resolve({ id: "p1" }) });

    expect(res.status).toBe(200);
    expect(mocks.requireProjectMembership).not.toHaveBeenCalled();
    expect(mocks.prisma.projectReadState.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId_projectId: { userId: "u1", projectId: "p1" } },
        update: expect.objectContaining({ lastSeenMessagesAt: expect.any(Date) }),
      }),
    );
  });

  it("falls back to membership check for non-admin user", async () => {
    mocks.requireAdmin.mockRejectedValueOnce(new RouteAuthError("Forbidden", 403, "FORBIDDEN"));

    const req = new Request("http://localhost", { method: "POST", body: JSON.stringify({ area: "concepts" }) });
    await POST(req, { params: Promise.resolve({ id: "p1" }) });

    expect(mocks.requireProjectMembership).toHaveBeenCalledWith("u1", "p1");
    expect(mocks.prisma.projectReadState.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId_projectId: { userId: "u1", projectId: "p1" } },
        update: expect.objectContaining({ lastSeenConceptsAt: expect.any(Date) }),
      }),
    );
  });
});
