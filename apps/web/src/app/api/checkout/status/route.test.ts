import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  prisma: { projectOrder: { findUnique: vi.fn() } },
}));

vi.mock("@/lib/prisma", () => ({ prisma: mocks.prisma }));

import { GET } from "./route";

describe("GET /api/checkout/status", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prisma.projectOrder.findUnique.mockResolvedValue(null);
  });

  it("rejects missing session_id", async () => {
    const res = await GET(new Request("http://localhost/api/checkout/status"));
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("MISSING_SESSION_ID");
  });

  it("returns only the coarse state needed by the polling UI", async () => {
    mocks.prisma.projectOrder.findUnique.mockResolvedValueOnce({ status: "FULFILLED" });

    const res = await GET(new Request("http://localhost/api/checkout/status?session_id=cs_123"));
    expect(await res.json()).toEqual({ fulfilled: true, status: "FULFILLED" });
    expect(mocks.prisma.projectOrder.findUnique).toHaveBeenCalledWith({
      where: { stripeCheckoutSessionId: "cs_123" },
      select: { status: true },
    });
  });

  it("does not expose IDs, payment/customer diagnostics, or internal failure states to a Session-ID holder", async () => {
    mocks.prisma.projectOrder.findUnique.mockResolvedValueOnce({ status: "PAYMENT_FAILED" });

    const res = await GET(new Request("http://localhost/api/checkout/status?session_id=cs_secret&include_stripe=1"));
    expect(await res.json()).toEqual({ fulfilled: false, status: "PENDING" });
  });
});
