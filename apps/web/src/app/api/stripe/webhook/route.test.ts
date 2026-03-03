import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  constructEvent: vi.fn(),
  fulfillCheckoutSession: vi.fn(),
  ensureAccessProvisioning: vi.fn(),
  sendCheckoutContinueEmail: vi.fn(),
  prisma: {
    stripeEvent: {
      upsert: vi.fn(),
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock("@/lib/stripe", () => ({
  stripe: {
    webhooks: { constructEvent: mocks.constructEvent },
  },
}));

vi.mock("@/lib/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/checkout-continue-email", () => ({ sendCheckoutContinueEmail: mocks.sendCheckoutContinueEmail }));
vi.mock("@/lib/checkout-fulfillment", () => ({
  ORDER_STATUS_FULFILLED: "FULFILLED",
  ORDER_STATUS_NEEDS_CONTACT: "NEEDS_CONTACT",
  fulfillCheckoutSession: mocks.fulfillCheckoutSession,
  ensureAccessProvisioning: mocks.ensureAccessProvisioning,
  isUniqueViolation: (error: unknown) =>
    typeof error === "object" && error !== null && "code" in error && (error as { code?: string }).code === "P2002",
}));

import { POST } from "./route";

function webhookRequest() {
  return new Request("http://localhost/api/stripe/webhook", {
    method: "POST",
    headers: { "stripe-signature": "sig_123" },
    body: JSON.stringify({ any: "body" }),
  });
}

describe("POST /api/stripe/webhook", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";
    mocks.sendCheckoutContinueEmail.mockResolvedValue(undefined);
    mocks.ensureAccessProvisioning.mockResolvedValue({ userId: "user-1" });
    mocks.prisma.stripeEvent.create.mockResolvedValue(undefined);
    mocks.prisma.stripeEvent.update.mockResolvedValue(undefined);
  });

  it("dedupes already-processed duplicate events with 200 and skips fulfillment", async () => {
    mocks.constructEvent.mockReturnValue({
      id: "evt_dup",
      type: "checkout.session.completed",
      created: 1700000000,
      data: { object: { id: "cs_1" } },
    });
    mocks.prisma.stripeEvent.create.mockRejectedValueOnce({ code: "P2002" });
    mocks.prisma.stripeEvent.findUnique.mockResolvedValueOnce({ eventId: "evt_dup", processedAt: new Date() });

    const res = await POST(webhookRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.deduped).toBe(true);
    expect(mocks.fulfillCheckoutSession).not.toHaveBeenCalled();
  });

  it("returns 202 while duplicate event is still in-flight", async () => {
    mocks.constructEvent.mockReturnValue({
      id: "evt_inflight",
      type: "checkout.session.completed",
      created: 1700000000,
      data: { object: { id: "cs_2" } },
    });
    mocks.prisma.stripeEvent.create.mockRejectedValueOnce({ code: "P2002" });
    mocks.prisma.stripeEvent.findUnique.mockResolvedValueOnce({ eventId: "evt_inflight", processedAt: null });

    const res = await POST(webhookRequest());

    expect(res.status).toBe(202);
    expect(mocks.fulfillCheckoutSession).not.toHaveBeenCalled();
  });

  it("processes first delivery and marks event processed", async () => {
    mocks.constructEvent.mockReturnValue({
      id: "evt_new",
      type: "checkout.session.completed",
      created: 1700000000,
      data: { object: { id: "cs_new" } },
    });
    mocks.fulfillCheckoutSession.mockResolvedValue({
      deduped: false,
      projectId: "project-1",
      orderId: "order-1",
      clientId: "client-1",
      purchaserEmail: "buyer@example.com",
      firstName: "Buyer",
      lastName: "Name",
    });

    const res = await POST(webhookRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.fulfilled).toBe(true);
    expect(body.deduped).toBe(false);
    expect(mocks.fulfillCheckoutSession).toHaveBeenCalledTimes(1);
    expect(mocks.prisma.stripeEvent.update).toHaveBeenCalledWith({
      where: { eventId: "evt_new" },
      data: { processedAt: expect.any(Date) },
    });
  });

  it("upserts non-checkout events as ignored", async () => {
    mocks.constructEvent.mockReturnValue({
      id: "evt_other",
      type: "payment_intent.created",
      created: 1700000000,
      data: { object: {} },
    });

    const res = await POST(webhookRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ignored).toBe(true);
    expect(mocks.prisma.stripeEvent.upsert).toHaveBeenCalledTimes(1);
    expect(mocks.fulfillCheckoutSession).not.toHaveBeenCalled();
  });
});
