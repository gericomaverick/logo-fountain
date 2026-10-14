import "server-only";

import { jsonError } from "@/lib/api-error";
import { consumeCheckoutAuthEmailLimit } from "@/lib/checkout-auth-email-rate-limit";
import { generateAndSendMagicLinkEmail } from "@/lib/magic-link-email";
import { prisma } from "@/lib/prisma";

type Body = { session_id?: unknown };

function parseSessionId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

/** Shared implementation for every public checkout authentication-email send. */
export async function sendCheckoutAuthenticationEmail(req: Request): Promise<Response> {
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

  const limit = consumeCheckoutAuthEmailLimit({ sessionId, destination: purchaserEmail });
  if (!limit.allowed) {
    return Response.json(
      { error: { code: "RATE_LIMITED", message: "Please wait before requesting another sign-in email." } },
      { status: 429, headers: { "retry-after": String(limit.retryAfterSeconds) } },
    );
  }

  try {
    const result = await generateAndSendMagicLinkEmail({
      purchaserEmail,
      request: req,
      projectId: order.projectId,
      // A public Session ID is never authority to set or reset a password.
      flow: "signin",
    });

    if (result.skipped) {
      return jsonError("Sign-in email is temporarily unavailable.", 503, undefined, "EMAIL_UNAVAILABLE");
    }

    return Response.json({ ok: true, delivery: "email" });
  } catch {
    // Deliberately do not return or log provider errors: Postmark failure bodies
    // can echo the email body, which contains the generated bearer URL.
    return jsonError("Unable to send sign-in email.", 500, undefined, "AUTH_EMAIL_SEND_FAILED");
  }
}
