import { jsonError } from "@/lib/api-error";
import { generateAndSendMagicLinkEmail } from "@/lib/magic-link-email";
import { prisma } from "@/lib/prisma";
import { getRequestOrigin } from "@/lib/request-origin";

export const runtime = "nodejs";

type Body = { session_id?: unknown };

function parseSessionId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export async function POST(req: Request) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return jsonError("Invalid JSON body", 400, undefined, "INVALID_JSON");
  }

  const sessionId = parseSessionId(body.session_id);
  if (!sessionId) return jsonError("Missing session_id", 400, undefined, "MISSING_SESSION_ID");

  const order = await prisma.projectOrder.findUnique({
    where: { stripeCheckoutSessionId: sessionId },
    select: {
      status: true,
      projectId: true,
      client: { select: { billingEmail: true } },
    },
  });

  if (!order || order.status !== "FULFILLED") {
    return jsonError("Checkout session is not fulfilled yet.", 409, undefined, "NOT_FULFILLED");
  }

  const purchaserEmail = order.client.billingEmail?.trim().toLowerCase();
  if (!purchaserEmail) return jsonError("No purchaser email found.", 409, undefined, "MISSING_EMAIL");

  try {
    // A Checkout Session ID is not an authentication credential. Always deliver
    // the bearer link to the purchaser's mailbox, and conservatively use sign-in
    // (never password setup) when this public endpoint is invoked. First-time
    // password setup is only selected by trusted webhook provisioning.
    const result = await generateAndSendMagicLinkEmail({
      purchaserEmail,
      baseUrl: getRequestOrigin(req),
      projectId: order.projectId,
      flow: "signin",
    });

    return Response.json({
      ok: true,
      delivery: result.skipped ? "unavailable" : "email",
      reason: result.reason,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to send sign-in email";
    return jsonError(message, 500, undefined, "MAGIC_LINK_SEND_FAILED");
  }
}
