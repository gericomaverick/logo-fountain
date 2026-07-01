import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  generateAndSendMagicLinkEmail: vi.fn(),
  getRequestOrigin: vi.fn(),
  prisma: {
    projectOrder: { findUnique: vi.fn() },
  },
}));

vi.mock("@/lib/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/magic-link-email", () => ({ generateAndSendMagicLinkEmail: mocks.generateAndSendMagicLinkEmail }));
vi.mock("@/lib/request-origin", () => ({ getRequestOrigin: mocks.getRequestOrigin }));

import { POST } from "./route";

describe("POST /api/checkout/resend-magic-link", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prisma.projectOrder.findUnique.mockResolvedValue({
      status: "FULFILLED",
      projectId: "project-1",
      client: { billingEmail: " Client@Example.COM " },
    });
    mocks.generateAndSendMagicLinkEmail.mockResolvedValue({ skipped: false, reason: null });
    mocks.getRequestOrigin.mockReturnValue("https://logofountain.co.uk");
  });

  it("rejects invalid JSON and missing session_id", async () => {
    const invalidJson = await POST(new Request("http://localhost/api/checkout/resend-magic-link", { method: "POST", body: "{nope" }));
    expect(invalidJson.status).toBe(400);
    expect((await invalidJson.json()).error.code).toBe("INVALID_JSON");

    const missingSession = await POST(
      new Request("http://localhost/api/checkout/resend-magic-link", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      }),
    );
    expect(missingSession.status).toBe(400);
    expect((await missingSession.json()).error.code).toBe("MISSING_SESSION_ID");
  });

  it("rejects unfulfilled checkout sessions", async () => {
    mocks.prisma.projectOrder.findUnique.mockResolvedValueOnce({
      status: "PENDING",
      projectId: "project-1",
      client: { billingEmail: "client@example.com" },
    });

    const res = await POST(
      new Request("http://localhost/api/checkout/resend-magic-link", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ session_id: "cs_pending" }),
      }),
    );

    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe("NOT_FULFILLED");
    expect(mocks.generateAndSendMagicLinkEmail).not.toHaveBeenCalled();
  });

  it("sends the setup link to the normalized purchaser email", async () => {
    const res = await POST(
      new Request("http://localhost/api/checkout/resend-magic-link", {
        method: "POST",
        headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.10" },
        body: JSON.stringify({ session_id: "cs_fulfilled_unique" }),
      }),
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ ok: true, skipped: false, reason: null });
    expect(mocks.generateAndSendMagicLinkEmail).toHaveBeenCalledWith({
      purchaserEmail: "client@example.com",
      projectId: "project-1",
      baseUrl: "https://logofountain.co.uk",
    });
  });

  it("rate limits repeated sends for the same session and forwarded IP", async () => {
    const requestInit = {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": "198.51.100.20" },
      body: JSON.stringify({ session_id: "cs_rate_limit_unique" }),
    };

    const first = await POST(new Request("http://localhost/api/checkout/resend-magic-link", requestInit));
    expect(first.status).toBe(200);

    const second = await POST(new Request("http://localhost/api/checkout/resend-magic-link", requestInit));
    expect(second.status).toBe(429);
    expect((await second.json()).error.code).toBe("RATE_LIMITED");
  });
});
