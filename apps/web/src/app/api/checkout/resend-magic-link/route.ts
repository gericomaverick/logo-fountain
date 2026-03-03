import { jsonError } from "@/lib/api-error";
import { generateAndSendMagicLinkEmail } from "@/lib/magic-link-email";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const RATE_LIMIT_WINDOW_MS = 60_000;
const resendRateLimit = new Map<string, number>();

type ResendBody = {
  session_id?: unknown;
};

function parseSessionId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function bestEffortRateLimitKey(sessionId: string, req: Request): string {
  const forwardedFor = req.headers.get("x-forwarded-for") || "unknown";
  return `${sessionId}:${forwardedFor}`;
}

export async function POST(req: Request) {
  let body: ResendBody;
  try {
    body = (await req.json()) as ResendBody;
  } catch {
    return jsonError("Invalid JSON body", 400, undefined, "INVALID_JSON");
  }

  const sessionId = parseSessionId(body.session_id);
  if (!sessionId) {
    return jsonError("Missing session_id", 400, undefined, "MISSING_SESSION_ID");
  }

  const rateKey = bestEffortRateLimitKey(sessionId, req);
  const now = Date.now();
  const lastSentAt = resendRateLimit.get(rateKey) || 0;
  if (now - lastSentAt < RATE_LIMIT_WINDOW_MS) {
    return jsonError("Please wait before requesting another email.", 429, undefined, "RATE_LIMITED");
  }

  const order = await prisma.projectOrder.findUnique({
    where: { stripeCheckoutSessionId: sessionId },
    select: {
      status: true,
      projectId: true,
      client: {
        select: { billingEmail: true },
      },
    },
  });

  if (!order || order.status !== "FULFILLED") {
    return jsonError("Checkout session is not fulfilled yet.", 409, undefined, "NOT_FULFILLED");
  }

  const purchaserEmail = order.client.billingEmail?.trim().toLowerCase();
  if (!purchaserEmail) {
    return jsonError("No purchaser email found for this checkout session.", 409, undefined, "MISSING_EMAIL");
  }

  const appBaseUrl = process.env.NEXT_PUBLIC_SITE_URL || new URL(req.url).origin;

  try {
    const result = await generateAndSendMagicLinkEmail({
      purchaserEmail,
      projectId: order.projectId,
      baseUrl: appBaseUrl,
    });

    resendRateLimit.set(rateKey, now);

    return Response.json({
      ok: true,
      skipped: result.skipped,
      reason: result.reason,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to resend magic link";
    return jsonError(message, 500, undefined, "RESEND_FAILED");
  }
}
