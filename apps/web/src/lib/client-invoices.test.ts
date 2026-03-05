import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  stripe: {
    checkout: { sessions: { retrieve: vi.fn() } },
    paymentIntents: { retrieve: vi.fn() },
    invoices: { retrieve: vi.fn() },
  },
}));

vi.mock("@/lib/stripe", () => ({
  stripe: mocks.stripe,
}));

import { resolveStripeInvoiceDocument } from "./client-invoices";

describe("resolveStripeInvoiceDocument", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("prefers invoice PDF when session returns an invoice id string", async () => {
    mocks.stripe.checkout.sessions.retrieve.mockResolvedValueOnce({
      invoice: "in_123",
      payment_intent: null,
    });
    mocks.stripe.invoices.retrieve.mockResolvedValueOnce({
      id: "in_123",
      invoice_pdf: "https://stripe.test/in_123.pdf",
      hosted_invoice_url: "https://stripe.test/in_123",
    });

    const result = await resolveStripeInvoiceDocument({
      stripeCheckoutSessionId: "cs_123",
      stripePaymentIntentId: null,
    });

    expect(result).toEqual({
      invoiceId: "in_123",
      invoicePdfUrl: "https://stripe.test/in_123.pdf",
      hostedInvoiceUrl: "https://stripe.test/in_123",
      receiptUrl: null,
      source: "invoice",
    });
  });

  it("falls back to receipt for legacy receipt-only orders", async () => {
    mocks.stripe.checkout.sessions.retrieve.mockResolvedValueOnce({
      invoice: null,
      payment_intent: {
        latest_charge: {
          receipt_url: "https://stripe.test/receipt_1",
        },
      },
    });

    const result = await resolveStripeInvoiceDocument({
      stripeCheckoutSessionId: "cs_legacy",
      stripePaymentIntentId: "pi_legacy",
    });

    expect(result).toEqual({
      invoiceId: null,
      invoicePdfUrl: null,
      hostedInvoiceUrl: null,
      receiptUrl: "https://stripe.test/receipt_1",
      source: "receipt",
    });
  });
});
