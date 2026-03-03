import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  requireAdmin: vi.fn(),
  requireProjectMembership: vi.fn(),
  toRouteErrorResponse: vi.fn(),
  prisma: {
    concept: { findFirst: vi.fn() },
    conceptComment: { findMany: vi.fn(), create: vi.fn() },
    profile: { upsert: vi.fn() },
  },
}));

vi.mock("@/lib/auth/require", () => ({
  requireUser: mocks.requireUser,
  requireAdmin: mocks.requireAdmin,
  requireProjectMembership: mocks.requireProjectMembership,
  toRouteErrorResponse: mocks.toRouteErrorResponse,
  RouteAuthError: class RouteAuthError extends Error {
    constructor(public message: string, public status: number, public code: string) { super(message); }
  },
}));
vi.mock("@/lib/prisma", () => ({ prisma: mocks.prisma }));

import { RouteAuthError } from "@/lib/auth/require";
import { GET, POST } from "./route";

describe("/api/projects/[id]/concepts/[conceptId]/comments", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireUser.mockResolvedValue({ id: "u1", email: "u@example.com", user_metadata: {} });
    mocks.requireAdmin.mockResolvedValue(undefined);
    mocks.requireProjectMembership.mockResolvedValue({ id: "p1", clientId: "c1" });
    mocks.prisma.concept.findFirst.mockResolvedValue({ id: "c1" });
    mocks.prisma.conceptComment.findMany.mockResolvedValue([]);
    mocks.prisma.conceptComment.create.mockResolvedValue({ id: "cm1", body: "hi", createdAt: new Date(), author: { id: "u1", email: "u@example.com", fullName: null, isAdmin: true } });
    mocks.prisma.profile.upsert.mockResolvedValue({});
    mocks.toRouteErrorResponse.mockImplementation((err: Error) => Response.json({ error: { message: err.message, code: "ERR" } }, { status: 500 }));
  });

  it("GET requires concept to belong to project", async () => {
    mocks.prisma.concept.findFirst.mockResolvedValueOnce(null);
    const res = await GET(new Request("http://localhost"), { params: Promise.resolve({ id: "p1", conceptId: "c1" }) });
    expect(res.status).toBe(500);
  });

  it("POST validates body", async () => {
    const res = await POST(new Request("http://localhost", { method: "POST", body: JSON.stringify({ body: "" }) }), {
      params: Promise.resolve({ id: "p1", conceptId: "c1" }),
    });

    expect(res.status).toBe(400);
    const payload = await res.json();
    expect(payload.error.code).toBe("INVALID_COMMENT_BODY");
  });

  it("POST allows member when admin check fails with 403", async () => {
    mocks.requireAdmin.mockRejectedValueOnce(new RouteAuthError("Forbidden", 403, "FORBIDDEN"));

    const res = await POST(new Request("http://localhost", { method: "POST", body: JSON.stringify({ body: "Concept notes" }) }), {
      params: Promise.resolve({ id: "p1", conceptId: "c1" }),
    });

    expect(res.status).toBe(201);
    expect(mocks.requireProjectMembership).toHaveBeenCalledWith("u1", "p1");
    expect(mocks.prisma.conceptComment.create).toHaveBeenCalled();
  });
});
