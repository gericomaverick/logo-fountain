import { prisma } from "@/lib/prisma";
import { requireAdmin, requireUser, toRouteErrorResponse } from "@/lib/auth/require";

export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    await requireAdmin(user);

    const { id: projectId } = await params;
    const revisionRequests = await prisma.revisionRequest.findMany({
      where: { projectId },
      orderBy: [{ createdAt: "desc" }],
      select: {
        id: true,
        status: true,
        body: true,
        createdAt: true,
        updatedAt: true,
        concept: { select: { id: true, number: true } },
        user: { select: { id: true, email: true, fullName: true } },
      },
    });

    return Response.json({ revisionRequests });
  } catch (error) {
    return toRouteErrorResponse(error);
  }
}
