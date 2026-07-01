import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  toRouteErrorResponse: vi.fn(),
  prisma: {
    clientMembership: { findMany: vi.fn() },
  },
}));

vi.mock("@/lib/auth/require", () => ({
  requireUser: mocks.requireUser,
  toRouteErrorResponse: mocks.toRouteErrorResponse,
}));
vi.mock("@/lib/prisma", () => ({ prisma: mocks.prisma }));

import { GET } from "./route";

describe("GET /api/projects", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireUser.mockResolvedValue({ id: "u1", email: "client@example.com" });
    mocks.toRouteErrorResponse.mockImplementation((err: Error) =>
      Response.json({ error: { message: err.message, code: "ERR" } }, { status: 500 }),
    );
    mocks.prisma.clientMembership.findMany.mockResolvedValue([]);
  });

  it("returns projects across all client memberships", async () => {
    mocks.prisma.clientMembership.findMany.mockResolvedValueOnce([
      {
        client: {
          projects: [
            { id: "p2", status: "CONCEPTS_READY", packageCode: "professional" },
            { id: "p1", status: "AWAITING_BRIEF", packageCode: "essential" },
          ],
        },
      },
      {
        client: {
          projects: [{ id: "p3", status: "FINAL_READY", packageCode: "complete" }],
        },
      },
    ]);

    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.projects).toEqual([
      { id: "p2", status: "CONCEPTS_READY", packageCode: "professional" },
      { id: "p1", status: "AWAITING_BRIEF", packageCode: "essential" },
      { id: "p3", status: "FINAL_READY", packageCode: "complete" },
    ]);
    expect(mocks.prisma.clientMembership.findMany).toHaveBeenCalledWith({
      where: { userId: "u1" },
      include: {
        client: {
          include: {
            projects: {
              select: { id: true, status: true, packageCode: true },
              orderBy: { createdAt: "desc" },
            },
          },
        },
      },
    });
  });
});
