import { describe, expect, it, vi } from "vitest";

const { createSession } = vi.hoisted(() => ({
  createSession: vi.fn(),
}));

vi.mock("@/lib/stripe", () => ({
  PACKAGE_TO_PRICE_ID: {
    essential: "price_1",
    professional: "price_2",
    complete: "price_3",
  },
  stripe: {
    checkout: {
      sessions: {
        create: createSession,
      },
    },
  },
}));

import { POST } from "./route";

describe("POST /api/checkout/session", () => {
  it("returns INVALID_JSON for malformed body", async () => {
    const req = new Request("http://localhost/api/checkout/session", {
      method: "POST",
      body: "{nope",
      headers: { "content-type": "application/json" },
    });

    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error.code).toBe("INVALID_JSON");
  });

  it("returns CHECKOUT_SESSION_FAILED when Stripe create throws", async () => {
    createSession.mockRejectedValueOnce(new Error("Stripe down"));

    const req = new Request("http://localhost/api/checkout/session", {
      method: "POST",
      body: JSON.stringify({ package_code: "essential" }),
      headers: { "content-type": "application/json" },
    });

    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.error.code).toBe("CHECKOUT_SESSION_FAILED");
    expect(body.error.message).toContain("Stripe down");
  });
});
