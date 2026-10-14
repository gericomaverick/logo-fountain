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
      project: { findUnique: vi.fn() },
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

function getFor(id: string) {
  return GET(new Request("http://localhost"), { params: Promise.resolve({ id }) });
}

describe("GET /api/projects/[id]/concepts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireUser.mockResolvedValue({ id: "u1", email: "client@example.com" });
    mocks.requireAdmin.mockRejectedValue(new mocks.RouteAuthError("Forbidden", 403, "FORBIDDEN"));
    mocks.requireProjectMembership.mockResolvedValue({ id: "p1", clientId: "c1" });
    mocks.prisma.project.findUnique.mockResolvedValue({ id: "p1", status: "CONCEPTS_READY", concepts: [] });
    mocks.prisma.fileAsset.findMany.mockResolvedValue([]);
    mocks.createSignedConceptAssetUrl.mockResolvedValue("https://signed.example.com/asset");
  });

  it("returns 401 for unauthenticated callers", async () => {
    mocks.requireUser.mockRejectedValue(new mocks.RouteAuthError("Unauthorized", 401, "UNAUTHORIZED"));

    const res = await getFor("p1");

    expect(res.status).toBe(401);
    expect(mocks.prisma.project.findUnique).not.toHaveBeenCalled();
  });

  it("returns 404 for non-members (cross-tenant)", async () => {
    mocks.requireProjectMembership.mockRejectedValue(
      new mocks.RouteAuthError("Project not found", 404, "PROJECT_NOT_FOUND"),
    );

    const res = await getFor("someone-elses-project");

    expect(res.status).toBe(404);
    expect(mocks.prisma.project.findUnique).not.toHaveBeenCalled();
  });

  it("only queries published or approved concepts (drafts stay hidden)", async () => {
    const res = await getFor("p1");

    expect(res.status).toBe(200);
    expect(mocks.prisma.project.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({
          concepts: expect.objectContaining({
            where: { status: { in: ["published", "approved"] } },
          }),
        }),
      }),
    );
  });

  it("returns concepts with signed asset URLs and latest revision version", async () => {
    mocks.prisma.project.findUnique.mockResolvedValue({
      id: "p1",
      status: "CONCEPTS_READY",
      concepts: [
        { id: "c1", number: 1, status: "published", notes: null, createdAt: new Date(), updatedAt: new Date() },
      ],
    });
    mocks.prisma.fileAsset.findMany.mockResolvedValue([
      { path: "p1/c1/v2.png", createdAt: new Date() },
      { path: "p1/c1.png", createdAt: new Date(Date.now() - 1000) },
    ]);

    const res = await getFor("p1");
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.concepts).toHaveLength(1);
    expect(body.concepts[0].revisionVersion).toBe(2);
    expect(body.concepts[0].imageUrl).toBe("https://signed.example.com/asset");
  });
});
