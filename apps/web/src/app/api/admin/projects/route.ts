import { prisma } from "@/lib/prisma";
import { requireAdmin, requireUser, toRouteErrorResponse } from "@/lib/auth/require";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const user = await requireUser();
    await requireAdmin(user);

    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status")?.trim() ?? "";

    const projects = await prisma.project.findMany({
      where: status ? { status } : undefined,
      select: { id: true, status: true, packageCode: true, createdAt: true, client: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
    });

    return Response.json({
      projects: projects.map((project) => ({
        id: project.id,
        status: project.status,
        packageCode: project.packageCode,
        clientName: project.client.name,
      })),
    });
  } catch (error) {
    return toRouteErrorResponse(error);
  }
}
