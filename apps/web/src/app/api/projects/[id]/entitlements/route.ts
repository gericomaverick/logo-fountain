import { jsonError } from "@/lib/api-error";
import { prisma } from "@/lib/prisma";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return jsonError("Unauthorized", 401, undefined, "UNAUTHORIZED");
  }

  const { id } = await params;

  const project = await prisma.project.findFirst({
    where: {
      id,
      client: {
        memberships: {
          some: {
            userId: user.id,
          },
        },
      },
    },
    select: { id: true },
  });

  if (!project) {
    return jsonError("Project not found", 404, undefined, "PROJECT_NOT_FOUND");
  }

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
}
