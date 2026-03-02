import { prisma } from "@/lib/prisma";
import { requireAdmin, requireUser, toRouteErrorResponse } from "@/lib/auth/require";

export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    await requireAdmin(user);

    const { id: projectId } = await params;
    const events = await prisma.auditEvent.findMany({
      where: { projectId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 100,
      select: { id: true, type: true, payload: true, createdAt: true, actor: { select: { email: true, fullName: true } } },
    });

    return Response.json({ events });
  } catch (error) {
    return toRouteErrorResponse(error);
  }
}
