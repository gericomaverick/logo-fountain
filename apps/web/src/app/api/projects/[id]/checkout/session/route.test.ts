import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  requireProjectMembership: vi.fn(),
  prismaProjectFindUnique: vi.fn(),
  createSession: vi.fn(),
}));

vi.mock("@/lib/auth/require", () => ({
  requireUser: mocks.requireUser,
  requireProjectMembership: mocks.requireProjectMembership,
  toRouteErrorResponse: (error: unknown) => {
    throw error;
  },
}));

vi.mock("@/lib/prisma", () => ({ prisma: { project: { findUnique: mocks.prismaProjectFindUnique } } }));

vi.mock("@/lib/stripe", () => ({
  UPSELL_PRICE_TO_ACTION: {
    price_addon: { kind: "addon", addonKey: "extra_revision", revisionDelta: 1 },
    price_upgrade: { kind: "upgrade", fromPackage: "essential", toPackage: "professional" },
  },
  stripe: { checkout: { sessions: { create: mocks.createSession } } },
}));

import { POST } from "./route";

describe("POST /api/projects/[id]/checkout/session", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireUser.mockResolvedValue({ id: "u1" });
    mocks.requireProjectMembership.mockResolvedValue({ id: "p1", clientId: "c1" });
    mocks.prismaProjectFindUnique.mockResolvedValue({ id: "p1", packageCode: "essential" });
    mocks.createSession.mockResolvedValue({ url: "https://stripe.test/session" });
  });

  it("creates extra revision checkout", async () => {
    const req = new Request("http://localhost/api/projects/p1/checkout/session", {
      method: "POST",
      body: JSON.stringify({ kind: "addon", addonKey: "extra_revision" }),
      headers: { "content-type": "application/json" },
    });

    const res = await POST(req, { params: Promise.resolve({ id: "p1" }) });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.url).toBe("https://stripe.test/session");
    expect(mocks.createSession).toHaveBeenCalledWith(expect.objectContaining({
      metadata: expect.objectContaining({ kind: "addon", projectId: "p1", addonKey: "extra_revision" }),
    }));
  });

  it("rejects unsupported upgrade path", async () => {
    mocks.prismaProjectFindUnique.mockResolvedValue({ id: "p1", packageCode: "complete" });

    const req = new Request("http://localhost/api/projects/p1/checkout/session", {
      method: "POST",
      body: JSON.stringify({ kind: "upgrade", toPackage: "professional" }),
      headers: { "content-type": "application/json" },
    });

    const res = await POST(req, { params: Promise.resolve({ id: "p1" }) });

    expect(res.status).toBe(400);
  });
});
