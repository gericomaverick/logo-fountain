import { jsonError } from "@/lib/api-error";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const sessionId = searchParams.get("session_id")?.trim();

  if (!sessionId) return jsonError("Missing session_id", 400, { nextStep: "Include session_id query param." }, "MISSING_SESSION_ID");

  const order = await prisma.projectOrder.findUnique({
    where: { stripeCheckoutSessionId: sessionId },
    select: { id: true, status: true, projectId: true },
  });

  if (!order) {
    return Response.json({ sessionId, fulfilled: false, status: "PENDING", projectId: null });
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
