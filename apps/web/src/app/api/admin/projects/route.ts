import { prisma } from "@/lib/prisma";
import { requireAdmin, requireUser, toRouteErrorResponse } from "@/lib/auth/require";

export const runtime = "nodejs";

function getStuckReason(order: { status: string; stripeCheckoutSessionId: string | null } | null): string | null {
  if (!order) return "Missing order record (webhook likely never fulfilled).";
  if (order.status === "NEEDS_CONTACT") return "Order needs contact (no purchaser email provisioned).";
  if (order.status !== "FULFILLED") return `Order status is ${order.status}.`;
  return null;
}

export async function GET(req: Request) {
  try {
    const user = await requireUser();
    await requireAdmin(user);

    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status")?.trim() ?? "";

    const projects = await prisma.project.findMany({
      where: status ? { status } : undefined,
      select: {
        id: true,
        status: true,
        packageCode: true,
        createdAt: true,
        client: { select: { name: true } },
        orders: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { id: true, status: true, stripeCheckoutSessionId: true, createdAt: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return Response.json({
      projects: projects.map((project) => {
        const latestOrder = project.orders[0] ?? null;
        const stuckReason = getStuckReason(latestOrder);

        return {
          id: project.id,
          status: project.status,
          packageCode: project.packageCode,
          clientName: project.client.name,
          latestOrder: latestOrder
            ? {
                id: latestOrder.id,
                status: latestOrder.status,
                stripeCheckoutSessionId: latestOrder.stripeCheckoutSessionId,
                createdAt: latestOrder.createdAt,
              }
            : null,
          stuck: Boolean(stuckReason),
          stuckReason,
        };
      }),
    });
  } catch (error) {
    return toRouteErrorResponse(error);
  }
}
