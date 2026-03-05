import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  requireProjectMembership: vi.fn(),
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
  requireProjectMembership: mocks.requireProjectMembership,
  toRouteErrorResponse: mocks.toRouteErrorResponse,
}));
vi.mock("@/lib/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/client-invoices", () => ({ resolveStripeInvoiceDocument: mocks.resolveStripeInvoiceDocument }));

import { GET } from "./route";

describe("GET /api/projects/[id]/invoices", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireUser.mockResolvedValue({ id: "user_1" });
    mocks.requireProjectMembership.mockResolvedValue({ id: "project_1", clientId: "client_1" });
    mocks.toRouteErrorResponse.mockImplementation((err: Error) =>
      Response.json({ error: { message: err.message } }, { status: 404 }),
    );
    mocks.resolveStripeInvoiceDocument.mockResolvedValue({
      invoiceId: "in_1",
      invoicePdfUrl: "https://stripe.example/invoice.pdf",
      hostedInvoiceUrl: null,
      receiptUrl: null,
      source: "invoice",
    });
  });

  it("denies cross-user access via membership guard", async () => {
    mocks.requireProjectMembership.mockRejectedValueOnce(new Error("Project not found"));

    const res = await GET(new Request("http://localhost"), { params: Promise.resolve({ id: "project_2" }) });

    expect(mocks.prisma.projectOrder.findMany).not.toHaveBeenCalled();
    expect(res.status).toBe(404);
  });

  it("returns project invoices for authorized users", async () => {
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
        projectName: "Brand 1",
        invoicePdfUrl: "https://stripe.example/invoice.pdf",
      }),
    );
  });
});
