import { prisma } from "@/lib/prisma";
import { requireProjectMembership, requireUser, toRouteErrorResponse } from "@/lib/auth/require";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireUser();
    const { id } = await params;

    const project = await requireProjectMembership(user.id, id);

    const entitlements = await prisma.projectEntitlement.findMany({
      where: {
        projectId: project.id,
        key: { in: ["concepts", "revisions"] },
      },
      select: { key: true, limitInt: true, consumedInt: true },
    });

    const summary = { concepts: 0, revisions: 0 };

    for (const entitlement of entitlements) {
      const remaining = Math.max((entitlement.limitInt ?? 0) - entitlement.consumedInt, 0);
      if (entitlement.key === "concepts") summary.concepts = remaining;
      if (entitlement.key === "revisions") summary.revisions = remaining;
    }

    return Response.json({ entitlements: summary });
  } catch (error) {
    return toRouteErrorResponse(error);
  }
}
