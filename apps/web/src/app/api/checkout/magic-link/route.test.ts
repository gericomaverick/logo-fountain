import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  generateAndSendMagicLinkEmail: vi.fn(),
  consumeLimit: vi.fn(),
  prisma: { projectOrder: { findUnique: vi.fn() } },
}));

vi.mock("@/lib/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/magic-link-email", () => ({
  generateAndSendMagicLinkEmail: mocks.generateAndSendMagicLinkEmail,
}));
vi.mock("@/lib/checkout-auth-email-rate-limit", () => ({
  consumeCheckoutAuthEmailLimit: mocks.consumeLimit,
}));

import { POST } from "./route";

function requestFor(sessionId: string, headers?: HeadersInit) {
  return new Request("https://internal.example.test/api/checkout/magic-link", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify({ session_id: sessionId }),
  });
}

describe("POST /api/checkout/magic-link", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.consumeLimit.mockReturnValue({ allowed: true });
    mocks.generateAndSendMagicLinkEmail.mockResolvedValue({ skipped: false });
    mocks.prisma.projectOrder.findUnique.mockResolvedValue({
      status: "FULFILLED",
      projectId: "project-1",
      client: { billingEmail: " Buyer@Example.com " },
    });
  });

  it("mail-delivers sign-in and never returns a bearer credential for a fulfilled session id", async () => {
    const req = requestFor("cs_stolen_fulfilled", {
      host: "evil.example",
      "x-forwarded-host": "evil.example",
      "x-forwarded-proto": "http",
    });
    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ ok: true, delivery: "email" });
    expect(JSON.stringify(body)).not.toMatch(/action_link|https:\/\/auth|token/i);
    expect(mocks.generateAndSendMagicLinkEmail).toHaveBeenCalledWith({
      purchaserEmail: "buyer@example.com",
      request: req,
      projectId: "project-1",
      flow: "signin",
    });
    expect(mocks.consumeLimit).toHaveBeenCalledWith({
      sessionId: "cs_stolen_fulfilled",
      destination: "buyer@example.com",
    });
  });

  it("returns a bounded generic response without provider details when delivery fails", async () => {
    mocks.generateAndSendMagicLinkEmail.mockRejectedValueOnce(
      new Error("Postmark echoed https://auth.example.com/secret-bearer"),
    );

    const res = await POST(requestFor("cs_failure"));
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.error).toEqual({ code: "AUTH_EMAIL_SEND_FAILED", message: "Unable to send sign-in email." });
    expect(JSON.stringify(body)).not.toContain("secret-bearer");
  });

  it("enforces the shared limiter before generating another credential", async () => {
    mocks.consumeLimit.mockReturnValueOnce({ allowed: false, retryAfterSeconds: 123 });

    const res = await POST(requestFor("cs_limited"));

    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toBe("123");
    expect(mocks.generateAndSendMagicLinkEmail).not.toHaveBeenCalled();
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
    expect(mocks.consumeLimit).not.toHaveBeenCalled();
    expect(mocks.generateAndSendMagicLinkEmail).not.toHaveBeenCalled();
  });
});
