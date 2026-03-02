import { jsonError } from "@/lib/api-error";
import { prisma } from "@/lib/prisma";
import { PRICE_ID_TO_PACKAGE, stripe } from "@/lib/stripe";

export const runtime = "nodejs";

type StripeDiagnostics = {
  exists: boolean;
  payment_status?: string | null;
  customer_email?: string | null;
  amount_total?: number | null;
  currency?: string | null;
  line_item_price_id?: string | null;
  allowlisted_price_id?: boolean;
  allowlist_hint?: string;
  jsonError?: { message: string };
};

async function getStripeDiagnostics(sessionId: string): Promise<StripeDiagnostics> {
  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ["line_items.data.price"],
    });

    const firstLineItem = session.line_items?.data?.[0];
    const priceObject = firstLineItem?.price;
    const priceId = typeof priceObject === "string" ? priceObject : priceObject?.id ?? null;

    const allowlisted = priceId ? Boolean(PRICE_ID_TO_PACKAGE[priceId]) : false;

    return {
      exists: true,
      payment_status: session.payment_status ?? null,
      customer_email: session.customer_details?.email ?? session.customer_email ?? null,
      amount_total: session.amount_total ?? null,
      currency: session.currency ?? null,
      line_item_price_id: priceId,
      allowlisted_price_id: allowlisted,
      allowlist_hint: allowlisted
        ? "Checkout Session price id is allowlisted."
        : "Checkout Session price id is not in allowlist.",
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to retrieve Checkout Session from Stripe.";

    return {
      exists: false,
      jsonError: { message },
    };
  }
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const sessionId = searchParams.get("session_id")?.trim();
  const includeStripeDiagnostics = searchParams.get("include_stripe") === "1";

  if (!sessionId) return jsonError("Missing session_id", 400, { nextStep: "Include session_id query param." }, "MISSING_SESSION_ID");

  const order = await prisma.projectOrder.findUnique({
    where: { stripeCheckoutSessionId: sessionId },
    select: { id: true, status: true, projectId: true },
  });

  if (!order) {
    const stripe = includeStripeDiagnostics ? await getStripeDiagnostics(sessionId) : undefined;

    return Response.json({
      sessionId,
      fulfilled: false,
      status: "PENDING",
      projectId: null,
      ...(stripe ? { stripe } : {}),
    });
  }

  const fulfilled = order.status === "FULFILLED";

  return Response.json({
    sessionId,
    fulfilled,
    status: order.status,
    projectId: fulfilled ? order.projectId : null,
    orderId: order.id,
  });
}
