import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  class RouteAuthError extends Error {
    status: number;
    code: string;

    constructor(message: string, status: number, code: string) {
      super(message);
      this.status = status;
      this.code = code;
    }
  }

  return {
    RouteAuthError,
    requireUser: vi.fn(),
    requireAdmin: vi.fn(),
    requireProjectMembership: vi.fn(),
    createSignedConceptAssetUrl: vi.fn(),
    prisma: {
      fileAsset: { findMany: vi.fn() },
    },
  };
});

vi.mock("@/lib/auth/require", () => ({
  RouteAuthError: mocks.RouteAuthError,
  requireUser: mocks.requireUser,
  requireAdmin: mocks.requireAdmin,
  requireProjectMembership: mocks.requireProjectMembership,
  toRouteErrorResponse: (error: unknown) => {
    if (error instanceof mocks.RouteAuthError) {
      return Response.json({ error: { message: error.message, code: error.code } }, { status: error.status });
    }
    throw error;
  },
}));

vi.mock("@/lib/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/supabase/storage", () => ({ createSignedConceptAssetUrl: mocks.createSignedConceptAssetUrl }));

import { GET } from "./route";

function getFor(id: string, conceptId: string) {
  return GET(new Request("http://localhost"), { params: Promise.resolve({ id, conceptId }) });
}

describe("GET /api/projects/[id]/concepts/[conceptId]/assets", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireUser.mockResolvedValue({ id: "u1", email: "client@example.com" });
    mocks.requireAdmin.mockRejectedValue(new mocks.RouteAuthError("Forbidden", 403, "FORBIDDEN"));
    mocks.requireProjectMembership.mockResolvedValue({ id: "p1", clientId: "c1" });
    mocks.prisma.fileAsset.findMany.mockResolvedValue([]);
    mocks.createSignedConceptAssetUrl.mockResolvedValue("https://signed.example.com/asset");
  });

  it("returns 401 for unauthenticated callers", async () => {
    mocks.requireUser.mockRejectedValue(new mocks.RouteAuthError("Unauthorized", 401, "UNAUTHORIZED"));

    const res = await getFor("p1", "c1");

    expect(res.status).toBe(401);
    expect(mocks.prisma.fileAsset.findMany).not.toHaveBeenCalled();
  });

  it("returns 404 for non-members (cross-tenant)", async () => {
    mocks.requireProjectMembership.mockRejectedValue(
      new mocks.RouteAuthError("Project not found", 404, "PROJECT_NOT_FOUND"),
    );

    const res = await getFor("someone-elses-project", "c1");

    expect(res.status).toBe(404);
    expect(mocks.prisma.fileAsset.findMany).not.toHaveBeenCalled();
  });

  it("scopes the asset query to the authorized project and concept", async () => {
    const res = await getFor("p1", "c1");

    expect(res.status).toBe(200);
    expect(mocks.prisma.fileAsset.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          projectId: "p1",
          kind: "concept",
          OR: [
            { path: { startsWith: "p1/c1." } },
            { path: { startsWith: "p1/c1/v" } },
          ],
        }),
      }),
    );
  });

  it("returns assets sorted by version descending with signed URLs", async () => {
    mocks.prisma.fileAsset.findMany.mockResolvedValue([
      { path: "p1/c1.png", createdAt: new Date("2026-03-01T00:00:00.000Z"), notes: null },
      { path: "p1/c1/v3.png", createdAt: new Date("2026-03-03T00:00:00.000Z"), notes: "third pass" },
      { path: "p1/c1/v2.png", createdAt: new Date("2026-03-02T00:00:00.000Z"), notes: null },
    ]);

    const res = await getFor("p1", "c1");
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.assets.map((a: { version: number }) => a.version)).toEqual([3, 2, 1]);
    expect(body.assets[0].url).toBe("https://signed.example.com/asset");
    expect(body.assets[0].notes).toBe("third pass");
  });
});
