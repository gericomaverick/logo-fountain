import { requireAdmin, requireUser, toRouteErrorResponse } from "@/lib/auth/require";
import {
  ensureAccessProvisioning,
  fulfillCheckoutSession,
  ORDER_STATUS_FULFILLED,
  ORDER_STATUS_NEEDS_CONTACT,
} from "@/lib/checkout-fulfillment";
import { stripe } from "@/lib/stripe";
import { rejectUntrustedMutationOrigin } from "@/lib/request-origin";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const originError = rejectUntrustedMutationOrigin(req);
  if (originError) return originError;
  try {
    const user = await requireUser();
    await requireAdmin(user);

    const body = (await req.json().catch(() => null)) as { session_id?: unknown } | null;
    const rawSessionId = body?.session_id;
    const sessionId = typeof rawSessionId === "string" ? rawSessionId.trim() : "";
    if (!sessionId) {
      return Response.json({ error: { message: "Missing session_id" } }, { status: 400 });
    }

    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ["customer"],
    });

    const fulfillment = await fulfillCheckoutSession(session);

    let provisionedUserId: string | null = null;
    if (fulfillment.purchaserEmail) {
      const provisioning = await ensureAccessProvisioning(fulfillment.clientId, fulfillment.purchaserEmail);
      provisionedUserId = provisioning.userId;
    }

    return Response.json({
      ok: true,
      deduped: fulfillment.deduped,
      projectId: fulfillment.projectId,
      orderId: fulfillment.orderId,
      clientId: fulfillment.clientId,
      purchaserEmail: fulfillment.purchaserEmail,
      orderStatus: fulfillment.purchaserEmail ? ORDER_STATUS_FULFILLED : ORDER_STATUS_NEEDS_CONTACT,
      provisionedUserId,
      message: fulfillment.deduped ? "Session already fulfilled; ensured access provisioning." : "Session fulfilled successfully.",
    });
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code?: unknown }).code === "CHECKOUT_SESSION_NOT_PAID"
    ) {
      return Response.json(
        { error: { code: "CHECKOUT_SESSION_NOT_PAID", message: "Checkout session has not been paid; nothing was provisioned." } },
        { status: 409 },
      );
    }

    return toRouteErrorResponse(error);
  }
}
