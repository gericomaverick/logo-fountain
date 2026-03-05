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
  if (invoice.status === "paid" || invoice.status === "void" || invoice.status === "uncollectible") return true;
  return (invoice.amount_remaining ?? 0) <= 0;
}

function toInvoiceDocument(invoice: Stripe.Invoice | string | null | undefined): StripeInvoiceDocument | null {
  if (!invoice || typeof invoice === "string") return null;

  const settled = isSettledInvoice(invoice);

  return {
    invoiceId: invoice.id,
    invoicePdfUrl: normalizeUrl(invoice.invoice_pdf),
    hostedInvoiceUrl: settled ? normalizeUrl(invoice.hosted_invoice_url) : null,
    receiptUrl: null,
    source: normalizeUrl(invoice.invoice_pdf) || (settled && normalizeUrl(invoice.hosted_invoice_url)) ? "invoice" : "none",
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

  if (invoiceDoc.invoicePdfUrl || invoiceDoc.hostedInvoiceUrl) {
    return {
      ...invoiceDoc,
      source: "invoice",
    };
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

      const sessionInvoiceRecord = session.invoice as Stripe.Invoice | string | null | undefined;
      const sessionInvoice = toInvoiceDocument(sessionInvoiceRecord);
      const sessionInvoiceIsSettled = !!sessionInvoiceRecord && typeof sessionInvoiceRecord !== "string" && isSettledInvoice(sessionInvoiceRecord);
      if (sessionInvoice && (!preferSettled || sessionInvoiceIsSettled) && (sessionInvoice.invoicePdfUrl || sessionInvoice.hostedInvoiceUrl)) {
        return {
          ...sessionInvoice,
          source: "invoice",
        };
      }

      const expandedPaymentIntent =
        session.payment_intent && typeof session.payment_intent === "object"
          ? (session.payment_intent as Stripe.PaymentIntent)
          : null;

      if (typeof session.invoice === "string") {
        const invoiceFromSessionId = await resolveInvoiceById(session.invoice, preferSettled);
        if (invoiceFromSessionId) return invoiceFromSessionId;
      }

      const latestCharge =
        expandedPaymentIntent?.latest_charge && typeof expandedPaymentIntent.latest_charge === "object"
          ? (expandedPaymentIntent.latest_charge as Stripe.Charge)
          : null;

      const latestChargeInvoice = (latestCharge as { invoice?: Stripe.Invoice | string | null } | null)?.invoice;
      if (latestChargeInvoice) {
        if (typeof latestChargeInvoice === "string") {
          const invoiceFromLatestChargeId = await resolveInvoiceById(latestChargeInvoice, preferSettled);
          if (invoiceFromLatestChargeId) return invoiceFromLatestChargeId;
        } else {
          const invoiceFromLatestCharge = toInvoiceDocument(latestChargeInvoice);
          if (invoiceFromLatestCharge && (!preferSettled || isSettledInvoice(latestChargeInvoice)) && (invoiceFromLatestCharge.invoicePdfUrl || invoiceFromLatestCharge.hostedInvoiceUrl)) {
            return {
              ...invoiceFromLatestCharge,
              source: "invoice",
            };
          }
        }
      }
      const receiptDoc = toReceiptDocument(latestCharge?.receipt_url);
      if (receiptDoc) return receiptDoc;
    }

    if (paymentIntentId) {
      const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId, {
        expand: ["latest_charge"],
      });

      const latestCharge = paymentIntent.latest_charge;
      if (latestCharge && typeof latestCharge !== "string") {
        const latestChargeInvoice = (latestCharge as { invoice?: Stripe.Invoice | string | null }).invoice;
        if (latestChargeInvoice) {
          if (typeof latestChargeInvoice === "string") {
            const invoiceFromLatestChargeId = await resolveInvoiceById(latestChargeInvoice, preferSettled);
            if (invoiceFromLatestChargeId) return invoiceFromLatestChargeId;
          } else {
            const invoiceFromLatestCharge = toInvoiceDocument(latestChargeInvoice);
            if (invoiceFromLatestCharge && (!preferSettled || isSettledInvoice(latestChargeInvoice)) && (invoiceFromLatestCharge.invoicePdfUrl || invoiceFromLatestCharge.hostedInvoiceUrl)) {
              return {
                ...invoiceFromLatestCharge,
                source: "invoice",
              };
            }
          }
        }

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
