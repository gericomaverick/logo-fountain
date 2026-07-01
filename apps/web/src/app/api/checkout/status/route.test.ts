import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  retrieveSession: vi.fn(),
  prisma: {
    projectOrder: { findUnique: vi.fn() },
  },
}));

vi.mock("@/lib/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/stripe", () => ({
  PRICE_ID_TO_PACKAGE: { price_professional: "professional" },
  stripe: {
    checkout: {
      sessions: { retrieve: mocks.retrieveSession },
    },
  },
}));

import { GET } from "./route";

describe("GET /api/checkout/status", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prisma.projectOrder.findUnique.mockResolvedValue(null);
    mocks.retrieveSession.mockResolvedValue({
      payment_status: "paid",
      customer_details: { email: "client@example.com" },
      amount_total: 49900,
      currency: "gbp",
      line_items: { data: [{ price: { id: "price_professional" } }] },
    });
  });

  it("rejects missing session_id", async () => {
    const res = await GET(new Request("http://localhost/api/checkout/status"));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error.code).toBe("MISSING_SESSION_ID");
  });

  it("returns fulfilled order state with project id", async () => {
    mocks.prisma.projectOrder.findUnique.mockResolvedValueOnce({
      id: "order-1",
      status: "FULFILLED",
      projectId: "project-1",
    });

    const res = await GET(new Request("http://localhost/api/checkout/status?session_id=cs_123"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({
      sessionId: "cs_123",
      fulfilled: true,
      status: "FULFILLED",
      projectId: "project-1",
      orderId: "order-1",
    });
    expect(mocks.retrieveSession).not.toHaveBeenCalled();
  });

  it("keeps projectId null for unfulfilled orders", async () => {
    mocks.prisma.projectOrder.findUnique.mockResolvedValueOnce({
      id: "order-1",
      status: "PENDING",
      projectId: "project-1",
    });

    const res = await GET(new Request("http://localhost/api/checkout/status?session_id=cs_123"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.fulfilled).toBe(false);
    expect(body.status).toBe("PENDING");
    expect(body.projectId).toBeNull();
  });

  it("can include Stripe diagnostics for pending sessions", async () => {
    const res = await GET(new Request("http://localhost/api/checkout/status?session_id=cs_123&include_stripe=1"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.fulfilled).toBe(false);
    expect(body.projectId).toBeNull();
    expect(body.stripe).toEqual(
      expect.objectContaining({
        exists: true,
        payment_status: "paid",
        customer_email: "client@example.com",
        line_item_price_id: "price_professional",
        allowlisted_price_id: true,
      }),
    );
  });
});
