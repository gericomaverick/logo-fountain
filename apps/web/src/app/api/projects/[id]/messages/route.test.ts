import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  requireAdmin: vi.fn(),
  requireProjectMembership: vi.fn(),
  toRouteErrorResponse: vi.fn(),
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
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn() }));

import { POST } from "./route";

describe("POST /api/projects/[id]/messages", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireUser.mockResolvedValue({ id: "u1", email: "x@example.com", user_metadata: {} });
    mocks.requireAdmin.mockResolvedValue(undefined);
    mocks.toRouteErrorResponse.mockImplementation((err: Error) =>
      Response.json({ error: { message: err.message, code: "ERR" } }, { status: 500 }),
    );
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
});
