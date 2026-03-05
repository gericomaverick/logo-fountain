import type Stripe from "stripe";

import { stripe } from "@/lib/stripe";

export type InvoiceLikeRecord = {
  stripeCheckoutSessionId: string | null;
  stripePaymentIntentId: string | null;
  isOrderSettled?: boolean;
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

function isSettledInvoice(invoice: Stripe.Invoice): boolean {
  if (invoice.status === "paid") return true;
  if ((invoice.amount_remaining ?? 0) > 0) return false;
  return Boolean(invoice.status_transitions?.paid_at);
}

function toInvoiceDocument(invoice: Stripe.Invoice | string | null | undefined): StripeInvoiceDocument | null {
  if (!invoice || typeof invoice === "string") return null;

  return {
    invoiceId: invoice.id,
    invoicePdfUrl: normalizeUrl(invoice.invoice_pdf),
    hostedInvoiceUrl: normalizeUrl(invoice.hosted_invoice_url),
    receiptUrl: null,
    source: normalizeUrl(invoice.invoice_pdf) || normalizeUrl(invoice.hosted_invoice_url) ? "invoice" : "none",
  };
}

function prefersPaidFriendlyLinks(doc: StripeInvoiceDocument, preferSettled: boolean): boolean {
  if (!preferSettled) return Boolean(doc.invoicePdfUrl || doc.hostedInvoiceUrl);
  return Boolean(doc.invoicePdfUrl);
}

function finalizeInvoiceDocument(doc: StripeInvoiceDocument, preferSettled: boolean): StripeInvoiceDocument {
  if (!preferSettled) return { ...doc, source: "invoice" };

  return {
    ...doc,
    hostedInvoiceUrl: null,
    source: doc.invoicePdfUrl ? "invoice" : "none",
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

async function resolveInvoiceById(invoiceId: string | null | undefined, preferSettled: boolean): Promise<StripeInvoiceDocument | null> {
  if (!invoiceId) return null;

  const invoice = await stripe.invoices.retrieve(invoiceId);
  if (preferSettled && !isSettledInvoice(invoice)) return null;

  const invoiceDoc = toInvoiceDocument(invoice);
  if (!invoiceDoc) return null;

  if (prefersPaidFriendlyLinks(invoiceDoc, preferSettled)) {
    return finalizeInvoiceDocument(invoiceDoc, preferSettled);
  }

  return null;
}

export async function resolveStripeInvoiceDocument(order: InvoiceLikeRecord): Promise<StripeInvoiceDocument> {
  const sessionId = order.stripeCheckoutSessionId?.trim() || null;
  const paymentIntentId = order.stripePaymentIntentId?.trim() || null;
  const preferSettled = order.isOrderSettled === true;

  try {
    if (sessionId) {
      const session = await stripe.checkout.sessions.retrieve(sessionId, {
        expand: ["invoice", "payment_intent.latest_charge"],
      });

      const expandedPaymentIntent =
        session.payment_intent && typeof session.payment_intent === "object"
          ? (session.payment_intent as Stripe.PaymentIntent)
          : null;

      const latestCharge =
        expandedPaymentIntent?.latest_charge && typeof expandedPaymentIntent.latest_charge === "object"
          ? (expandedPaymentIntent.latest_charge as Stripe.Charge)
          : null;

      const receiptDoc = toReceiptDocument(latestCharge?.receipt_url);
      if (preferSettled && receiptDoc) return receiptDoc;

      const sessionInvoiceRecord = session.invoice as Stripe.Invoice | string | null | undefined;
      const sessionInvoice = toInvoiceDocument(sessionInvoiceRecord);
      const sessionInvoiceIsSettled = !!sessionInvoiceRecord && typeof sessionInvoiceRecord !== "string" && isSettledInvoice(sessionInvoiceRecord);
      if (sessionInvoice && (!preferSettled || sessionInvoiceIsSettled) && prefersPaidFriendlyLinks(sessionInvoice, preferSettled)) {
        return finalizeInvoiceDocument(sessionInvoice, preferSettled);
      }

      if (typeof session.invoice === "string") {
        const invoiceFromSessionId = await resolveInvoiceById(session.invoice, preferSettled);
        if (invoiceFromSessionId) return invoiceFromSessionId;
      }

      const latestChargeInvoice = (latestCharge as { invoice?: Stripe.Invoice | string | null } | null)?.invoice;
      if (latestChargeInvoice) {
        if (typeof latestChargeInvoice === "string") {
          const invoiceFromLatestChargeId = await resolveInvoiceById(latestChargeInvoice, preferSettled);
          if (invoiceFromLatestChargeId) return invoiceFromLatestChargeId;
        } else {
          const invoiceFromLatestCharge = toInvoiceDocument(latestChargeInvoice);
          if (invoiceFromLatestCharge && (!preferSettled || isSettledInvoice(latestChargeInvoice)) && prefersPaidFriendlyLinks(invoiceFromLatestCharge, preferSettled)) {
            return finalizeInvoiceDocument(invoiceFromLatestCharge, preferSettled);
          }
        }
      }
      if (receiptDoc) return receiptDoc;
    }

    if (paymentIntentId) {
      const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId, {
        expand: ["latest_charge"],
      });

      const latestCharge = paymentIntent.latest_charge;
      if (latestCharge && typeof latestCharge !== "string") {
        const receiptDoc = toReceiptDocument(latestCharge.receipt_url);
        if (preferSettled && receiptDoc) return receiptDoc;

        const latestChargeInvoice = (latestCharge as { invoice?: Stripe.Invoice | string | null }).invoice;
        if (latestChargeInvoice) {
          if (typeof latestChargeInvoice === "string") {
            const invoiceFromLatestChargeId = await resolveInvoiceById(latestChargeInvoice, preferSettled);
            if (invoiceFromLatestChargeId) return invoiceFromLatestChargeId;
          } else {
            const invoiceFromLatestCharge = toInvoiceDocument(latestChargeInvoice);
            if (invoiceFromLatestCharge && (!preferSettled || isSettledInvoice(latestChargeInvoice)) && prefersPaidFriendlyLinks(invoiceFromLatestCharge, preferSettled)) {
              return finalizeInvoiceDocument(invoiceFromLatestCharge, preferSettled);
            }
          }
        }

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
