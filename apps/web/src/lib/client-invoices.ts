import type Stripe from "stripe";

import { stripe } from "@/lib/stripe";

export type InvoiceLikeRecord = {
  stripeCheckoutSessionId: string | null;
  stripePaymentIntentId: string | null;
};

export type StripeInvoiceDocument = {
  invoiceId: string | null;
  invoicePdfUrl: string | null;
  hostedInvoiceUrl: string | null;
  receiptUrl: string | null;
  source: "invoice" | "receipt" | "none";
};

function normalizeUrl(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function toInvoiceDocument(invoice: Stripe.Invoice | string | null | undefined): StripeInvoiceDocument | null {
  if (!invoice || typeof invoice === "string") return null;

  return {
    invoiceId: invoice.id,
    invoicePdfUrl: normalizeUrl(invoice.invoice_pdf),
    hostedInvoiceUrl: normalizeUrl(invoice.hosted_invoice_url),
    receiptUrl: null,
    source: normalizeUrl(invoice.invoice_pdf) ? "invoice" : "none",
  };
}

function toReceiptDocument(receiptUrl: unknown): StripeInvoiceDocument | null {
  const normalized = normalizeUrl(receiptUrl);
  if (!normalized) return null;

  return {
    invoiceId: null,
    invoicePdfUrl: null,
    hostedInvoiceUrl: null,
    receiptUrl: normalized,
    source: "receipt",
  };
}

export async function resolveStripeInvoiceDocument(order: InvoiceLikeRecord): Promise<StripeInvoiceDocument> {
  const sessionId = order.stripeCheckoutSessionId?.trim() || null;
  const paymentIntentId = order.stripePaymentIntentId?.trim() || null;

  try {
    if (sessionId) {
      const session = await stripe.checkout.sessions.retrieve(sessionId, {
        expand: ["invoice", "payment_intent.latest_charge"],
      });

      const sessionInvoice = toInvoiceDocument(session.invoice as Stripe.Invoice | string | null | undefined);
      if (sessionInvoice && (sessionInvoice.invoicePdfUrl || sessionInvoice.hostedInvoiceUrl)) {
        return {
          ...sessionInvoice,
          source: "invoice",
        };
      }

      const paymentIntent =
        session.payment_intent && typeof session.payment_intent === "object"
          ? (session.payment_intent as Stripe.PaymentIntent)
          : null;

      const latestCharge =
        paymentIntent?.latest_charge && typeof paymentIntent.latest_charge === "object"
          ? (paymentIntent.latest_charge as Stripe.Charge)
          : null;
      const receiptDoc = toReceiptDocument(latestCharge?.receipt_url);
      if (receiptDoc) return receiptDoc;
    }

    if (paymentIntentId) {
      const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId, {
        expand: ["latest_charge"],
      });

      const latestCharge = paymentIntent.latest_charge;
      if (latestCharge && typeof latestCharge !== "string") {
        const receiptDoc = toReceiptDocument(latestCharge.receipt_url);
        if (receiptDoc) return receiptDoc;
      }
    }
  } catch (error) {
    console.error("Failed to resolve Stripe invoice document", {
      sessionId,
      paymentIntentId,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  return {
    invoiceId: null,
    invoicePdfUrl: null,
    hostedInvoiceUrl: null,
    receiptUrl: null,
    source: "none",
  };
}
