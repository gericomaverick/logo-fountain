import { jsonError } from "@/lib/api-error";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const sessionId = searchParams.get("session_id")?.trim();

  if (!sessionId) {
    return jsonError("Missing session_id", 400, { nextStep: "Include session_id query param." }, "MISSING_SESSION_ID");
  }

  const order = await prisma.projectOrder.findUnique({
    where: { stripeCheckoutSessionId: sessionId },
    select: { status: true },
  });

  // A Checkout Session ID is a bearer-like lookup secret. The polling UI only
  // needs a coarse completion signal; do not expose internal order/project IDs,
  // customer details, prices, or raw Stripe diagnostics to its holder.
  const fulfilled = order?.status === "FULFILLED";
  return Response.json({
    fulfilled,
    status: fulfilled ? "FULFILLED" : "PENDING",
  });
}
