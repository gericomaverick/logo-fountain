import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  constructEvent: vi.fn(),
  retrieveSession: vi.fn(),
  fulfillCheckoutSession: vi.fn(),
  ensureAccessProvisioning: vi.fn(),
  generateAndSendMagicLinkEmail: vi.fn(),
  notifyAdminNewProject: vi.fn(),
  prisma: {
    stripeEvent: {
      upsert: vi.fn(),
      create: vi.fn(),
      findUnique: vi.fn(),
      updateMany: vi.fn(),
      deleteMany: vi.fn(),
    },
    auditEvent: {
      findFirst: vi.fn(),
      create: vi.fn(),
    },
  },
}));

vi.mock("@/lib/stripe", () => ({
  stripe: {
    webhooks: { constructEvent: mocks.constructEvent },
    checkout: { sessions: { retrieve: mocks.retrieveSession } },
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
    mocks.notifyAdminNewProject.mockResolvedValue({ status: "sent" });
    mocks.prisma.auditEvent.findFirst.mockResolvedValue(null);
    mocks.prisma.auditEvent.create.mockResolvedValue({ id: "audit-email" });
    mocks.ensureAccessProvisioning.mockResolvedValue({ userId: "user-1", existed: false, needsSetup: true });
    mocks.prisma.stripeEvent.create.mockResolvedValue(undefined);
    mocks.prisma.stripeEvent.updateMany.mockResolvedValue({ count: 1 });
    mocks.prisma.stripeEvent.deleteMany.mockResolvedValue({ count: 1 });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("dedupes already-processed duplicate events with 200 and skips fulfillment", async () => {
    mocks.constructEvent.mockReturnValue({
      id: "evt_dup",
      type: "checkout.session.completed",
      created: 1700000000,
      data: { object: { id: "cs_1" } },
    });
    mocks.prisma.stripeEvent.create.mockRejectedValueOnce({ code: "P2002" });
    mocks.prisma.stripeEvent.findUnique.mockResolvedValueOnce({
      eventId: "evt_dup",
      type: "checkout.session.completed",
      processedAt: new Date(),
    });

    const res = await POST(webhookRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.deduped).toBe(true);
    expect(mocks.fulfillCheckoutSession).not.toHaveBeenCalled();
  });

  it("returns non-2xx while a duplicate event is still in-flight so Stripe retries", async () => {
    mocks.constructEvent.mockReturnValue({
      id: "evt_inflight",
      type: "checkout.session.completed",
      created: 1700000000,
      data: { object: { id: "cs_2" } },
    });
    mocks.prisma.stripeEvent.create.mockRejectedValueOnce({ code: "P2002" });
    mocks.prisma.stripeEvent.findUnique.mockResolvedValueOnce({
      eventId: "evt_inflight",
      type: `processing:${Date.now()}:claim:checkout.session.completed`,
      processedAt: null,
    });

    const res = await POST(webhookRequest());

    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toMatchObject({ inFlight: true, retry: true });
    expect(mocks.fulfillCheckoutSession).not.toHaveBeenCalled();
  });

  it("reclaims an expired processing claim and fulfills the event", async () => {
    const expiredType = `processing:${Date.now() - 10 * 60 * 1000}:old-claim:checkout.session.completed`;
    mocks.constructEvent.mockReturnValue({
      id: "evt_expired",
      type: "checkout.session.completed",
      created: 1700000000,
      data: { object: { id: "cs_expired" } },
    });
    mocks.prisma.stripeEvent.create.mockRejectedValueOnce({ code: "P2002" });
    mocks.prisma.stripeEvent.findUnique.mockResolvedValueOnce({
      eventId: "evt_expired",
      type: expiredType,
      processedAt: null,
    });
    mocks.fulfillCheckoutSession.mockResolvedValue({
      deduped: true,
      projectId: "project-expired",
      orderId: "order-expired",
      clientId: "client-expired",
      purchaserEmail: null,
      firstName: null,
      lastName: null,
    });

    const res = await POST(webhookRequest());

    expect(res.status).toBe(200);
    expect(mocks.prisma.stripeEvent.updateMany).toHaveBeenCalledWith({
      where: { eventId: "evt_expired", type: expiredType, processedAt: null },
      data: { type: expect.stringMatching(/^processing:/) },
    });
    expect(mocks.fulfillCheckoutSession).toHaveBeenCalledTimes(1);
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
    expect(mocks.prisma.stripeEvent.updateMany).toHaveBeenCalledWith({
      where: {
        eventId: "evt_new",
        type: expect.stringMatching(/^processing:/),
        processedAt: null,
      },
      data: { type: "checkout.session.completed", processedAt: expect.any(Date) },
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

    expect(res.status).toBe(500);
    expect(await res.json()).toMatchObject({ error: "Webhook processing failed", retry: true });
    expect(JSON.stringify(errorSpy.mock.calls)).not.toContain("secret-bearer");
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
    mocks.ensureAccessProvisioning.mockResolvedValueOnce({ userId: "user-1", existed: true, needsSetup: false });

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

  it("retry after a failed first setup email sends SETUP again while no password exists", async () => {
    mocks.constructEvent.mockReturnValue({
      id: "evt_setup_retry",
      type: "checkout.session.completed",
      created: 1700000000,
      data: { object: { id: "cs_setup_retry" } },
    });
    mocks.fulfillCheckoutSession.mockResolvedValue({
      deduped: true,
      projectId: "project-1",
      orderId: "order-1",
      clientId: "client-1",
      purchaserEmail: "buyer@example.com",
      firstName: "Buyer",
      lastName: "Name",
    });
    // The identity row already exists (first attempt created it), but setup was never completed.
    mocks.ensureAccessProvisioning.mockResolvedValueOnce({ userId: "user-1", existed: true, needsSetup: true });

    const res = await POST(webhookRequest());
    expect(res.status).toBe(200);
    expect(mocks.generateAndSendMagicLinkEmail).toHaveBeenCalledWith(expect.objectContaining({ flow: "setup" }));
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
    mocks.prisma.stripeEvent.findUnique.mockResolvedValueOnce({
      eventId: "evt_race",
      type: `processing:${Date.now()}:claim:checkout.session.completed`,
      processedAt: null,
    });
    mocks.fulfillCheckoutSession.mockImplementationOnce(() => inflight.promise);

    const firstRequest = POST(webhookRequest());
    await Promise.resolve();

    const secondRes = await POST(webhookRequest());
    expect(secondRes.status).toBe(409);
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
    expect(mocks.prisma.stripeEvent.updateMany).toHaveBeenCalledWith({
      where: {
        eventId: "evt_race",
        type: expect.stringMatching(/^processing:/),
        processedAt: null,
      },
      data: { type: "checkout.session.completed", processedAt: expect.any(Date) },
    });
  });

  it("converges distinct event IDs for the same Checkout Session while preserving at-least-once side effects", async () => {
    const firstFulfillment = deferred<{
      deduped: boolean; projectId: string; orderId: string; clientId: string;
      purchaserEmail: string; firstName: string; lastName: string;
    }>();
    const secondFulfillment = deferred<{
      deduped: boolean; projectId: string; orderId: string; clientId: string;
      purchaserEmail: string; firstName: string; lastName: string;
    }>();
    mocks.constructEvent
      .mockReturnValueOnce({
        id: "evt_session_race_a", type: "checkout.session.completed", created: 1700000000,
        data: { object: { id: "cs_shared", payment_status: "paid" } },
      })
      .mockReturnValueOnce({
        id: "evt_session_race_b", type: "checkout.session.async_payment_succeeded", created: 1700000001,
        data: { object: { id: "cs_shared", payment_status: "paid" } },
      });
    mocks.retrieveSession.mockResolvedValueOnce({ id: "cs_shared", payment_status: "paid" });
    mocks.fulfillCheckoutSession
      .mockImplementationOnce(() => firstFulfillment.promise)
      .mockImplementationOnce(() => secondFulfillment.promise);

    const firstRequest = POST(webhookRequest());
    const secondRequest = POST(webhookRequest());
    await Promise.resolve();

    firstFulfillment.resolve({
      deduped: false, projectId: "project-shared", orderId: "order-shared", clientId: "client-shared",
      purchaserEmail: "buyer@example.com", firstName: "Shared", lastName: "Buyer",
    });
    secondFulfillment.resolve({
      deduped: true, projectId: "project-shared", orderId: "order-shared", clientId: "client-shared",
      purchaserEmail: "buyer@example.com", firstName: "Shared", lastName: "Buyer",
    });

    const [firstResponse, secondResponse] = await Promise.all([firstRequest, secondRequest]);
    expect(firstResponse.status).toBe(200);
    expect(secondResponse.status).toBe(200);
    expect(mocks.fulfillCheckoutSession).toHaveBeenCalledTimes(2);
    expect(mocks.fulfillCheckoutSession.mock.calls.map(([session]) => session.id)).toEqual(["cs_shared", "cs_shared"]);
    expect(await firstResponse.json()).toMatchObject({ fulfilled: true, projectId: "project-shared" });
    expect(await secondResponse.json()).toMatchObject({ fulfilled: true, projectId: "project-shared" });
    // Without a schema-level delivery claim, concurrent attempts may both send.
    // At-least-once requires one or more attempts; exactly-once is not asserted.
    expect(mocks.generateAndSendMagicLinkEmail.mock.calls.length).toBeGreaterThanOrEqual(1);
    expect(mocks.notifyAdminNewProject.mock.calls.length).toBeGreaterThanOrEqual(1);
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

  it("does not report owner success when the fenced completion update affects zero rows", async () => {
    mocks.constructEvent.mockReturnValue({
      id: "evt_completion_lost",
      type: "checkout.session.completed",
      created: 1700000000,
      data: { object: { id: "cs_completion_lost", metadata: { kind: "addon" } } },
    });
    mocks.fulfillCheckoutSession.mockResolvedValue({
      deduped: true,
      projectId: "project-completion-lost",
      orderId: "order-completion-lost",
      clientId: "client-completion-lost",
      purchaserEmail: null,
      firstName: null,
      lastName: null,
    });
    mocks.prisma.stripeEvent.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });

    const res = await POST(webhookRequest());
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.fulfilled).toBe(false);
    expect(body.retry).toBe(true);
  });

  it("does not report success or run follow-up side effects after losing lease ownership", async () => {
    mocks.constructEvent.mockReturnValue({
      id: "evt_lost",
      type: "checkout.session.completed",
      created: 1700000000,
      data: { object: { id: "cs_lost" } },
    });
    mocks.fulfillCheckoutSession.mockResolvedValue({
      deduped: false,
      projectId: "project-lost",
      orderId: "order-lost",
      clientId: "client-lost",
      purchaserEmail: "buyer@example.com",
      firstName: "Lease",
      lastName: "Lost",
    });
    mocks.prisma.stripeEvent.updateMany.mockResolvedValueOnce({ count: 0 });

    const res = await POST(webhookRequest());
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.fulfilled).toBe(false);
    expect(body.retry).toBe(true);
    expect(mocks.ensureAccessProvisioning).not.toHaveBeenCalled();
    expect(mocks.generateAndSendMagicLinkEmail).not.toHaveBeenCalled();
    expect(mocks.notifyAdminNewProject).not.toHaveBeenCalled();
  });

  it("releases a transiently failed event so its next sequential delivery fulfills", async () => {
    const event = {
      id: "evt_transient",
      type: "checkout.session.completed",
      created: 1700000000,
      data: { object: { id: "cs_transient" } },
    };
    let storedEvent: { eventId: string; type: string; processedAt: Date | null } | null = null;

    mocks.constructEvent.mockReturnValue(event);
    mocks.prisma.stripeEvent.create.mockImplementation(async ({ data }) => {
      if (storedEvent) throw { code: "P2002" };
      storedEvent = { eventId: data.eventId, type: data.type, processedAt: null };
    });
    mocks.prisma.stripeEvent.findUnique.mockImplementation(async () => storedEvent);
    mocks.prisma.stripeEvent.deleteMany.mockImplementation(async ({ where }) => {
      if (storedEvent && storedEvent.type === where.type && storedEvent.processedAt === null) {
        storedEvent = null;
        return { count: 1 };
      }
      return { count: 0 };
    });
    mocks.prisma.stripeEvent.updateMany.mockImplementation(async ({ where, data }) => {
      if (storedEvent && storedEvent.type === where.type && storedEvent.processedAt === null) {
        storedEvent = {
          ...storedEvent,
          type: data.type,
          processedAt: data.processedAt === undefined ? storedEvent.processedAt : data.processedAt,
        };
        return { count: 1 };
      }
      return { count: 0 };
    });
    mocks.fulfillCheckoutSession
      .mockRejectedValueOnce({ code: "P1001" })
      .mockResolvedValueOnce({
        deduped: false,
        projectId: "project-retried",
        orderId: "order-retried",
        clientId: "client-retried",
        purchaserEmail: "buyer@example.com",
        firstName: "Retry",
        lastName: "Success",
      });

    const firstRes = await POST(webhookRequest());
    const firstBody = await firstRes.json();
    expect(firstRes.status).toBe(500);
    expect(firstBody.classification).toBe("transient");
    expect(firstBody.retry).toBe(true);
    expect(storedEvent).toBeNull();

    const secondRes = await POST(webhookRequest());
    const secondBody = await secondRes.json();
    expect(secondRes.status).toBe(200);
    expect(secondBody.fulfilled).toBe(true);
    expect(mocks.fulfillCheckoutSession).toHaveBeenCalledTimes(2);
    expect(storedEvent).toMatchObject({
      eventId: "evt_transient",
      type: "checkout.session.completed",
      processedAt: expect.any(Date),
    });
  });

  it("retries a failed admin notification after durable fulfillment without resending customer mail", async () => {
    const event = {
      id: "evt_notify_retry",
      type: "checkout.session.completed",
      created: 1700000000,
      data: { object: { id: "cs_notify_retry" } },
    };
    let storedEvent: { eventId: string; type: string; processedAt: Date | null } | null = null;
    let customerEmailMarked = false;

    mocks.constructEvent.mockReturnValue(event);
    mocks.prisma.stripeEvent.create.mockImplementation(async ({ data }) => {
      if (storedEvent) throw { code: "P2002" };
      storedEvent = { eventId: data.eventId, type: data.type, processedAt: null };
    });
    mocks.prisma.stripeEvent.updateMany.mockImplementation(async ({ where, data }) => {
      if (storedEvent && storedEvent.type === where.type && storedEvent.processedAt === null) {
        storedEvent = {
          ...storedEvent,
          type: data.type,
          processedAt: data.processedAt === undefined ? storedEvent.processedAt : data.processedAt,
        };
        return { count: 1 };
      }
      return { count: 0 };
    });
    mocks.prisma.stripeEvent.deleteMany.mockImplementation(async ({ where }) => {
      if (storedEvent && storedEvent.type === where.type && storedEvent.processedAt === null) {
        storedEvent = null;
        return { count: 1 };
      }
      return { count: 0 };
    });
    mocks.prisma.auditEvent.findFirst.mockImplementation(async () => customerEmailMarked ? { id: "email-audit" } : null);
    mocks.prisma.auditEvent.create.mockImplementation(async () => {
      customerEmailMarked = true;
      return { id: "email-audit" };
    });
    mocks.fulfillCheckoutSession
      .mockResolvedValueOnce({
        deduped: false,
        projectId: "project-notify",
        orderId: "order-notify",
        clientId: "client-notify",
        purchaserEmail: "buyer@example.com",
        firstName: "Notify",
        lastName: "Retry",
      })
      .mockResolvedValueOnce({
        deduped: true,
        projectId: "project-notify",
        orderId: "order-notify",
        clientId: "client-notify",
        purchaserEmail: "buyer@example.com",
        firstName: "Notify",
        lastName: "Retry",
      });
    mocks.notifyAdminNewProject
      .mockRejectedValueOnce(new Error("temporarily unavailable"))
      .mockResolvedValueOnce(undefined);

    const firstRes = await POST(webhookRequest());
    expect(firstRes.status).toBe(500);
    expect(customerEmailMarked).toBe(true);

    const secondRes = await POST(webhookRequest());
    expect(secondRes.status).toBe(200);
    expect(mocks.fulfillCheckoutSession).toHaveBeenCalledTimes(2);
    expect(mocks.generateAndSendMagicLinkEmail).toHaveBeenCalledTimes(1);
    expect(mocks.notifyAdminNewProject).toHaveBeenCalledTimes(2);
  });

  it("does not complete a production event when a required customer email is skipped", async () => {
    vi.stubEnv("NODE_ENV", "production");
    mocks.constructEvent.mockReturnValue({
      id: "evt_skipped_email",
      type: "checkout.session.completed",
      created: 1700000000,
      data: { object: { id: "cs_skipped_email" } },
    });
    mocks.fulfillCheckoutSession.mockResolvedValue({
      deduped: true,
      projectId: "project-1",
      orderId: "order-1",
      clientId: "client-1",
      purchaserEmail: "buyer@example.com",
      firstName: "Buyer",
      lastName: "Name",
    });
    mocks.generateAndSendMagicLinkEmail.mockResolvedValueOnce({ skipped: true, reason: "not configured" });

    const res = await POST(webhookRequest());

    expect(res.status).toBe(500);
    expect(mocks.prisma.auditEvent.create).not.toHaveBeenCalled();
    expect(mocks.notifyAdminNewProject).not.toHaveBeenCalled();
    expect(mocks.prisma.stripeEvent.deleteMany).toHaveBeenCalled();
  });

  it("does not complete a production event when the required admin email is skipped", async () => {
    vi.stubEnv("NODE_ENV", "production");
    mocks.constructEvent.mockReturnValue({
      id: "evt_skipped_admin",
      type: "checkout.session.completed",
      created: 1700000000,
      data: { object: { id: "cs_skipped_admin" } },
    });
    mocks.fulfillCheckoutSession.mockResolvedValue({
      deduped: true,
      projectId: "project-1",
      orderId: "order-1",
      clientId: "client-1",
      purchaserEmail: null,
      firstName: null,
      lastName: null,
    });
    mocks.notifyAdminNewProject.mockResolvedValueOnce({ status: "skipped", reason: "missing_recipient" });

    const res = await POST(webhookRequest());

    expect(res.status).toBe(500);
    expect(mocks.prisma.stripeEvent.deleteMany).toHaveBeenCalled();
  });

  it("fulfills a later async success after an unpaid completed event without provisioning early", async () => {
    const unpaid = {
      id: "evt_unpaid_sequence",
      type: "checkout.session.completed",
      created: 1700000000,
      data: { object: { id: "cs_delayed", payment_status: "unpaid" } },
    };
    const paidEvent = {
      id: "evt_paid_sequence",
      type: "checkout.session.async_payment_succeeded",
      created: 1700000060,
      data: { object: { id: "cs_delayed", payment_status: "paid" } },
    };
    const paidSession = { id: "cs_delayed", payment_status: "paid", metadata: { kind: "addon" } };
    mocks.constructEvent.mockReturnValueOnce(unpaid).mockReturnValueOnce(paidEvent);
    mocks.fulfillCheckoutSession
      .mockRejectedValueOnce({ code: "CHECKOUT_SESSION_NOT_PAID", message: "Checkout session is not paid" })
      .mockResolvedValueOnce({
        deduped: false,
        projectId: "project-delayed",
        orderId: "order-delayed",
        clientId: "client-delayed",
        purchaserEmail: "buyer@example.com",
        firstName: "Delayed",
        lastName: "Buyer",
      });
    mocks.retrieveSession.mockResolvedValueOnce(paidSession);

    const unpaidRes = await POST(webhookRequest());
    expect(unpaidRes.status).toBe(200);
    expect(mocks.ensureAccessProvisioning).not.toHaveBeenCalled();

    const paidRes = await POST(webhookRequest());
    expect(paidRes.status).toBe(200);
    expect(mocks.retrieveSession).toHaveBeenCalledWith("cs_delayed");
    expect(mocks.fulfillCheckoutSession).toHaveBeenLastCalledWith(paidSession);
    expect(mocks.ensureAccessProvisioning).toHaveBeenCalledTimes(1);
  });

  it("records async payment failure observably without provisioning", async () => {
    mocks.constructEvent.mockReturnValue({
      id: "evt_async_failed",
      type: "checkout.session.async_payment_failed",
      created: 1700000000,
      data: { object: { id: "cs_failed" } },
    });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    const res = await POST(webhookRequest());

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ paymentFailed: true });
    expect(mocks.prisma.stripeEvent.upsert).toHaveBeenCalled();
    expect(mocks.fulfillCheckoutSession).not.toHaveBeenCalled();
    expect(mocks.ensureAccessProvisioning).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith("Stripe asynchronous checkout payment failed", {
      id: "evt_async_failed",
      type: "checkout.session.async_payment_failed",
    });
    warn.mockRestore();
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
