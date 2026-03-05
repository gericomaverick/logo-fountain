import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  toRouteErrorResponse: vi.fn(),
  resolveStripeInvoiceDocument: vi.fn(),
  prisma: {
    projectOrder: {
      findMany: vi.fn(),
    },
  },
}));

vi.mock("@/lib/auth/require", () => ({
  requireUser: mocks.requireUser,
  toRouteErrorResponse: mocks.toRouteErrorResponse,
}));

vi.mock("@/lib/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/client-invoices", () => ({ resolveStripeInvoiceDocument: mocks.resolveStripeInvoiceDocument }));

import { GET } from "./route";

describe("GET /api/invoices", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireUser.mockResolvedValue({ id: "user_1" });
    mocks.toRouteErrorResponse.mockImplementation((err: Error) =>
      Response.json({ error: { message: err.message } }, { status: 500 }),
    );
    mocks.resolveStripeInvoiceDocument.mockResolvedValue({
      invoiceId: "in_123",
      invoicePdfUrl: "https://stripe.example/invoice.pdf",
      hostedInvoiceUrl: "https://stripe.example/invoice",
      receiptUrl: null,
      source: "invoice",
    });
  });

  it("returns invoices only for authenticated user's memberships", async () => {
    mocks.prisma.projectOrder.findMany.mockResolvedValue([
      {
        id: "order_1",
        projectId: "project_1",
        status: "FULFILLED",
        currency: "gbp",
        totalCents: 12900,
        createdAt: new Date("2026-03-05T09:00:00.000Z"),
        stripeCheckoutSessionId: "cs_123",
        stripePaymentIntentId: "pi_123",
        project: {
          briefs: [{ answers: { brandName: "Acme" } }],
        },
      },
    ]);

    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(mocks.prisma.projectOrder.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          client: {
            memberships: {
              some: { userId: "user_1" },
            },
          },
        },
      }),
    );
    expect(body.invoices).toEqual([
      expect.objectContaining({
        id: "order_1",
        projectId: "project_1",
        projectName: "Acme",
        invoicePdfUrl: "https://stripe.example/invoice.pdf",
        downloadUrl: "https://stripe.example/invoice.pdf",
        documentType: "invoice",
      }),
    ]);
  });

  it("maps Stripe receipt fallback when invoice pdf is unavailable", async () => {
    mocks.prisma.projectOrder.findMany.mockResolvedValue([
      {
        id: "order_2",
        projectId: "project_2",
        status: "FULFILLED",
        currency: "usd",
        totalCents: 4900,
        createdAt: new Date("2026-03-05T09:10:00.000Z"),
        stripeCheckoutSessionId: "cs_456",
        stripePaymentIntentId: "pi_456",
        project: {
          briefs: [{ answers: {} }],
        },
      },
    ]);
    mocks.resolveStripeInvoiceDocument.mockResolvedValueOnce({
      invoiceId: null,
      invoicePdfUrl: null,
      hostedInvoiceUrl: null,
      receiptUrl: "https://stripe.example/receipt",
      source: "receipt",
    });

    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.invoices[0]).toEqual(
      expect.objectContaining({
        id: "order_2",
        projectName: "Your logo project",
        documentType: "receipt",
        receiptUrl: "https://stripe.example/receipt",
        downloadUrl: "https://stripe.example/receipt",
      }),
    );
  });
});
