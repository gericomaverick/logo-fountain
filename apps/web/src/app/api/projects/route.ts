import { prisma } from "@/lib/prisma";
import { requireUser, toRouteErrorResponse } from "@/lib/auth/require";

export const runtime = "nodejs";

export async function GET() {
  try {
    const user = await requireUser();

    const memberships = await prisma.clientMembership.findMany({
      where: { userId: user.id },
      include: {
        client: {
          include: {
            projects: {
              select: {
                id: true,
                status: true,
                packageCode: true,
              },
              orderBy: { createdAt: "desc" },
            },
          },
        },
      },
    });

    const projects = memberships.flatMap((membership) => membership.client.projects);

    return Response.json({ projects });
  } catch (error) {
    return toRouteErrorResponse(error);
  }
}
