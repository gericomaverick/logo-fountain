import { requireAdmin, requireUser, toRouteErrorResponse } from "@/lib/auth/require";
import {
  ensureAccessProvisioning,
  fulfillCheckoutSession,
  ORDER_STATUS_FULFILLED,
  ORDER_STATUS_NEEDS_CONTACT,
} from "@/lib/checkout-fulfillment";
import { stripe } from "@/lib/stripe";

export const runtime = "nodejs";

export async function POST(req: Request) {
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
    return toRouteErrorResponse(error);
  }
}
