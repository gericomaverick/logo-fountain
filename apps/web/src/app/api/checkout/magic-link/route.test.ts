import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  generateAndSendMagicLinkEmail: vi.fn(),
  getRequestOrigin: vi.fn(),
  prisma: {
    projectOrder: {
      findUnique: vi.fn(),
    },
  },
}));

vi.mock("@/lib/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/request-origin", () => ({ getRequestOrigin: mocks.getRequestOrigin }));
vi.mock("@/lib/magic-link-email", () => ({
  generateAndSendMagicLinkEmail: mocks.generateAndSendMagicLinkEmail,
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
    mocks.generateAndSendMagicLinkEmail.mockResolvedValue({ skipped: false });
    mocks.prisma.projectOrder.findUnique.mockResolvedValue({
      status: "FULFILLED",
      projectId: "project-1",
      client: { billingEmail: " Buyer@Example.com " },
    });
  });

  it("mail-delivers sign-in and never returns a bearer credential for a fulfilled session id", async () => {
    const res = await POST(requestFor("cs_stolen_fulfilled"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ ok: true, delivery: "email" });
    expect(JSON.stringify(body)).not.toMatch(/action_link|https:\/\/auth|token/i);
    expect(mocks.generateAndSendMagicLinkEmail).toHaveBeenCalledWith({
      purchaserEmail: "buyer@example.com",
      baseUrl: "https://app.example.com",
      projectId: "project-1",
      flow: "signin",
    });
  });

  it("never offers password setup through session-id possession, including for an existing or privileged account", async () => {
    await POST(requestFor("cs_privileged_account"));

    expect(mocks.generateAndSendMagicLinkEmail).toHaveBeenCalledWith(
      expect.objectContaining({ flow: "signin" }),
    );
  });

  it("does not send authentication mail for an unfulfilled session", async () => {
    mocks.prisma.projectOrder.findUnique.mockResolvedValueOnce({
      status: "PENDING",
      projectId: null,
      client: { billingEmail: "buyer@example.com" },
    });

    const res = await POST(requestFor("cs_unpaid"));

    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe("NOT_FULFILLED");
    expect(mocks.generateAndSendMagicLinkEmail).not.toHaveBeenCalled();
  });
});
