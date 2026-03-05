import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  generateLink: vi.fn(),
  getRequestOrigin: vi.fn(),
  prisma: {
    projectOrder: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
    },
  },
}));

vi.mock("@/lib/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/request-origin", () => ({ getRequestOrigin: mocks.getRequestOrigin }));
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({
    auth: {
      admin: {
        generateLink: mocks.generateLink,
      },
    },
  }),
}));

import { POST } from "./route";

function requestFor(sessionId: string) {
  return new Request("http://localhost/api/checkout/magic-link", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ session_id: sessionId }),
  });
}

describe("POST /api/checkout/magic-link", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getRequestOrigin.mockReturnValue("https://app.example.com");
    mocks.generateLink.mockResolvedValue({
      error: null,
      data: { properties: { action_link: "https://auth.example.com/magic" } },
    });
  });

  it("uses setup flow for first-time purchasers", async () => {
    mocks.prisma.projectOrder.findUnique.mockResolvedValue({
      id: "order-new",
      status: "FULFILLED",
      projectId: "project-new",
      createdAt: new Date("2026-03-05T08:00:00.000Z"),
      client: { billingEmail: "new@example.com" },
    });
    mocks.prisma.projectOrder.findFirst.mockResolvedValue(null);

    const res = await POST(requestFor("cs_new"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.flow).toBe("setup");
    expect(mocks.generateLink).toHaveBeenCalledWith({
      type: "magiclink",
      email: "new@example.com",
      options: {
        redirectTo: "https://app.example.com/set-password?next=%2Fproject%2Fproject-new&projectId=project-new",
      },
    });
  });

  it("uses signin flow for returning purchasers", async () => {
    mocks.prisma.projectOrder.findUnique.mockResolvedValue({
      id: "order-returning",
      status: "FULFILLED",
      projectId: "project-returning",
      createdAt: new Date("2026-03-05T08:00:00.000Z"),
      client: { billingEmail: "buyer@example.com" },
    });
    mocks.prisma.projectOrder.findFirst.mockResolvedValue({ id: "order-old" });

    const res = await POST(requestFor("cs_returning"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.flow).toBe("signin");
    expect(mocks.generateLink).toHaveBeenCalledWith({
      type: "magiclink",
      email: "buyer@example.com",
      options: {
        redirectTo: "https://app.example.com/auth/callback?next=%2Fproject%2Fproject-returning",
      },
    });
  });

  it("uses callback handoff route for returning users without a project id", async () => {
    mocks.prisma.projectOrder.findUnique.mockResolvedValue({
      id: "order-returning-no-project",
      status: "FULFILLED",
      projectId: null,
      createdAt: new Date("2026-03-05T08:00:00.000Z"),
      client: { billingEmail: "buyer@example.com" },
    });
    mocks.prisma.projectOrder.findFirst.mockResolvedValue({ id: "order-old" });

    const res = await POST(requestFor("cs_returning_2"));
    expect(res.status).toBe(200);
    expect(mocks.generateLink).toHaveBeenCalledWith({
      type: "magiclink",
      email: "buyer@example.com",
      options: {
        redirectTo: "https://app.example.com/auth/callback?next=%2Fdashboard",
      },
    });
  });
});
