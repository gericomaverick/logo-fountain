import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const tx = {
    client: { create: vi.fn() },
    project: { create: vi.fn() },
    projectEntitlement: { createMany: vi.fn() },
    projectOrder: { create: vi.fn() },
  };

  return {
    listLineItems: vi.fn(),
    logAudit: vi.fn(),
    prisma: {
      projectOrder: { findUnique: vi.fn() },
      $transaction: vi.fn(async (fn: (trx: typeof tx) => unknown) => fn(tx)),
    },
    tx,
  };
});

vi.mock("@/lib/audit", () => ({ logAudit: mocks.logAudit }));
vi.mock("@/lib/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: vi.fn() }));
vi.mock("@/lib/stripe", () => ({
  PRICE_ID_TO_PACKAGE: { price_essential: "essential" },
  stripe: {
    checkout: {
      sessions: {
        listLineItems: mocks.listLineItems,
      },
    },
    customers: {
      retrieve: vi.fn(),
    },
  },
}));

import { fulfillCheckoutSession } from "./checkout-fulfillment";

const session = {
  id: "cs_test_12345678",
  customer_details: { email: "buyer@example.com", name: "Buyer Name" },
  custom_fields: [
    { key: "first_name", type: "text", text: { value: "Buyer" } },
    { key: "last_name", type: "text", text: { value: "Name" } },
  ],
  currency: "gbp",
  amount_total: 4900,
  payment_intent: "pi_123",
} as const;

describe("fulfillCheckoutSession", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.listLineItems.mockResolvedValue({
      data: [{ price: { id: "price_essential" } }],
    });
    mocks.logAudit.mockResolvedValue(undefined);

    mocks.tx.client.create.mockResolvedValue({ id: "client-1" });
    mocks.tx.project.create.mockResolvedValue({ id: "project-1" });
    mocks.tx.projectEntitlement.createMany.mockResolvedValue({ count: 2 });
    mocks.tx.projectOrder.create.mockResolvedValue({ id: "order-1" });
  });

  it("returns deduped result immediately when order already exists", async () => {
    mocks.prisma.projectOrder.findUnique.mockResolvedValueOnce({
      id: "order-existing",
      projectId: "project-existing",
      clientId: "client-existing",
    });

    const result = await fulfillCheckoutSession(session as never);

    expect(result).toMatchObject({
      deduped: true,
      orderId: "order-existing",
      projectId: "project-existing",
      clientId: "client-existing",
      purchaserEmail: "buyer@example.com",
    });
    expect(mocks.listLineItems).not.toHaveBeenCalled();
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
  });

  it("creates records once, then safe re-run dedupes without re-creating", async () => {
    mocks.prisma.projectOrder.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: "order-1", projectId: "project-1", clientId: "client-1" });

    const first = await fulfillCheckoutSession(session as never);
    const second = await fulfillCheckoutSession(session as never);

    expect(first.deduped).toBe(false);
    expect(first.orderId).toBe("order-1");
    expect(second.deduped).toBe(true);
    expect(second.orderId).toBe("order-1");

    expect(mocks.tx.client.create).toHaveBeenCalledTimes(1);
    expect(mocks.tx.project.create).toHaveBeenCalledTimes(1);
    expect(mocks.tx.projectOrder.create).toHaveBeenCalledTimes(1);
    expect(mocks.tx.projectEntitlement.createMany).toHaveBeenCalledTimes(1);
  });
});
