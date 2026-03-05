import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  requireAdmin: vi.fn(),
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
  requireAdmin: mocks.requireAdmin,
  toRouteErrorResponse: mocks.toRouteErrorResponse,
}));
vi.mock("@/lib/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/client-invoices", () => ({ resolveStripeInvoiceDocument: mocks.resolveStripeInvoiceDocument }));

import { GET } from "./route";

describe("GET /api/admin/projects/[id]/invoices", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireUser.mockResolvedValue({ id: "admin_1" });
    mocks.requireAdmin.mockResolvedValue(undefined);
    mocks.toRouteErrorResponse.mockImplementation((err: Error) =>
      Response.json({ error: { message: err.message } }, { status: 403 }),
    );
    mocks.resolveStripeInvoiceDocument.mockResolvedValue({
      invoiceId: "in_1",
      invoicePdfUrl: "https://stripe.example/invoice.pdf",
      hostedInvoiceUrl: null,
      receiptUrl: null,
      source: "invoice",
    });
  });

  it("enforces admin access before loading invoices", async () => {
    mocks.requireAdmin.mockRejectedValueOnce(new Error("Forbidden"));

    const res = await GET(new Request("http://localhost"), { params: Promise.resolve({ id: "project_1" }) });

    expect(mocks.prisma.projectOrder.findMany).not.toHaveBeenCalled();
    expect(res.status).toBe(403);
  });

  it("maps project invoice documents for admin project context", async () => {
    mocks.prisma.projectOrder.findMany.mockResolvedValue([
      {
        id: "order_1",
        projectId: "project_1",
        status: "FULFILLED",
        currency: "gbp",
        totalCents: 10000,
        createdAt: new Date("2026-03-05T09:00:00.000Z"),
        stripeCheckoutSessionId: "cs_1",
        stripePaymentIntentId: "pi_1",
        project: { briefs: [{ answers: { brandName: "Brand 1" } }] },
      },
    ]);

    const res = await GET(new Request("http://localhost"), { params: Promise.resolve({ id: "project_1" }) });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.invoices).toHaveLength(1);
    expect(body.invoices[0]).toEqual(
      expect.objectContaining({
        projectId: "project_1",
        projectName: "Brand 1 · #project_",
        invoicePdfUrl: "https://stripe.example/invoice.pdf",
        documentType: "invoice",
      }),
    );
  });
});
