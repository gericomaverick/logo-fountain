import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  constructEvent: vi.fn(),
  fulfillCheckoutSession: vi.fn(),
  ensureAccessProvisioning: vi.fn(),
  generateAndSendMagicLinkEmail: vi.fn(),
  notifyAdminNewProject: vi.fn(),
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
vi.mock("@/lib/magic-link-email", () => ({ generateAndSendMagicLinkEmail: mocks.generateAndSendMagicLinkEmail }));
vi.mock("@/lib/project-lifecycle-email", () => ({ notifyAdminNewProject: mocks.notifyAdminNewProject }));
vi.mock("@/lib/checkout-fulfillment", () => ({
  ORDER_STATUS_FULFILLED: "FULFILLED",
  ORDER_STATUS_NEEDS_CONTACT: "NEEDS_CONTACT",
  fulfillCheckoutSession: mocks.fulfillCheckoutSession,
  ensureAccessProvisioning: mocks.ensureAccessProvisioning,
  isUniqueViolation: (error: unknown) =>
    typeof error === "object" && error !== null && "code" in error && (error as { code?: string }).code === "P2002",
}));

import { POST } from "./route";

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

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
    mocks.generateAndSendMagicLinkEmail.mockResolvedValue({ skipped: false });
    mocks.ensureAccessProvisioning.mockResolvedValue({ userId: "user-1", existed: false });
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
    expect(mocks.generateAndSendMagicLinkEmail).toHaveBeenCalledWith({
      purchaserEmail: "buyer@example.com",
      request: expect.any(Request),
      projectId: "project-1",
      flow: "setup",
    });
    expect(mocks.notifyAdminNewProject).toHaveBeenCalledWith("project-1");
  });

  it("does not log an authentication provider error that may contain a bearer URL", async () => {
    mocks.constructEvent.mockReturnValue({
      id: "evt_email_failure",
      type: "checkout.session.completed",
      created: 1700000000,
      data: { object: { id: "cs_email_failure" } },
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
    mocks.generateAndSendMagicLinkEmail.mockRejectedValueOnce(
      new Error("provider echoed https://auth.example.com/secret-bearer"),
    );
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const res = await POST(webhookRequest());

    expect(res.status).toBe(200);
    expect(JSON.stringify(errorSpy.mock.calls)).not.toContain("secret-bearer");
    expect(errorSpy).toHaveBeenCalledWith("Failed to send checkout authentication email");
    errorSpy.mockRestore();
  });

  it("skips new-project admin email for upsell metadata", async () => {
    mocks.constructEvent.mockReturnValue({
      id: "evt_upsell",
      type: "checkout.session.completed",
      created: 1700000000,
      data: { object: { id: "cs_upsell", metadata: { kind: "addon" } } },
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
    expect(res.status).toBe(200);
    expect(mocks.notifyAdminNewProject).not.toHaveBeenCalled();
  });

  it("sends signin flow email for returning customers", async () => {
    mocks.constructEvent.mockReturnValue({
      id: "evt_returning",
      type: "checkout.session.completed",
      created: 1700000000,
      data: { object: { id: "cs_returning" } },
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
    mocks.ensureAccessProvisioning.mockResolvedValueOnce({ userId: "user-1", existed: true });

    const res = await POST(webhookRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.isReturningCustomer).toBe(true);
    expect(mocks.generateAndSendMagicLinkEmail).toHaveBeenCalledWith({
      purchaserEmail: "buyer@example.com",
      request: expect.any(Request),
      projectId: "project-1",
      flow: "signin",
    });
  });

  it("deterministically handles concurrent duplicate deliveries for same event/session", async () => {
    const inflight = deferred<{
      deduped: boolean;
      projectId: string;
      orderId: string;
      clientId: string;
      purchaserEmail: string;
      firstName: string;
      lastName: string;
    }>();

    mocks.constructEvent.mockReturnValue({
      id: "evt_race",
      type: "checkout.session.completed",
      created: 1700000000,
      data: { object: { id: "cs_race" } },
    });

    let createCalls = 0;
    mocks.prisma.stripeEvent.create.mockImplementation(async () => {
      createCalls += 1;
      if (createCalls === 1) return undefined;
      throw { code: "P2002" };
    });
    mocks.prisma.stripeEvent.findUnique.mockResolvedValueOnce({ eventId: "evt_race", processedAt: null });
    mocks.fulfillCheckoutSession.mockImplementationOnce(() => inflight.promise);

    const firstRequest = POST(webhookRequest());
    await Promise.resolve();

    const secondRes = await POST(webhookRequest());
    expect(secondRes.status).toBe(202);
    expect(mocks.fulfillCheckoutSession).toHaveBeenCalledTimes(1);

    inflight.resolve({
      deduped: false,
      projectId: "project-race",
      orderId: "order-race",
      clientId: "client-race",
      purchaserEmail: "buyer@example.com",
      firstName: "Race",
      lastName: "Case",
    });

    const firstRes = await firstRequest;
    expect(firstRes.status).toBe(200);
    expect(mocks.prisma.stripeEvent.update).toHaveBeenCalledWith({
      where: { eventId: "evt_race" },
      data: { processedAt: expect.any(Date) },
    });
  });

  it("acknowledges an unpaid completed session without provisioning access or sending credentials", async () => {
    mocks.constructEvent.mockReturnValue({
      id: "evt_unpaid",
      type: "checkout.session.completed",
      created: 1700000000,
      data: { object: { id: "cs_unpaid", payment_status: "unpaid" } },
    });
    mocks.fulfillCheckoutSession.mockRejectedValueOnce({
      code: "CHECKOUT_SESSION_NOT_PAID",
      message: "Checkout session is not paid (payment_status: unpaid)",
    });

    const res = await POST(webhookRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.fulfilled).toBe(false);
    expect(body.classification).toBe("permanent");
    expect(body.retry).toBe(false);
    expect(mocks.ensureAccessProvisioning).not.toHaveBeenCalled();
    expect(mocks.generateAndSendMagicLinkEmail).not.toHaveBeenCalled();
    expect(mocks.notifyAdminNewProject).not.toHaveBeenCalled();
  });

  it("returns 500/retry shape for transient fulfillment failures", async () => {
    mocks.constructEvent.mockReturnValue({
      id: "evt_transient",
      type: "checkout.session.completed",
      created: 1700000000,
      data: { object: { id: "cs_transient" } },
    });
    mocks.fulfillCheckoutSession.mockRejectedValueOnce({ code: "P1001" });

    const res = await POST(webhookRequest());
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.classification).toBe("transient");
    expect(body.retry).toBe(true);
  });

  it("returns 200/dead-letter shape for permanent fulfillment failures", async () => {
    mocks.constructEvent.mockReturnValue({
      id: "evt_permanent",
      type: "checkout.session.completed",
      created: 1700000000,
      data: { object: { id: "cs_perm" } },
    });
    mocks.fulfillCheckoutSession.mockRejectedValueOnce(
      new Error("Checkout session did not resolve to exactly one allowlisted package"),
    );

    const res = await POST(webhookRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.classification).toBe("permanent");
    expect(body.retry).toBe(false);
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
