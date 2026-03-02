import { jsonError } from "@/lib/api-error";
import { prisma } from "@/lib/prisma";
import { getProjectSnapshot } from "@/lib/project-snapshot";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return jsonError("Unauthorized", 401, { nextStep: "Sign in and retry." }, "UNAUTHORIZED");

  const { id } = await params;

  const project = await prisma.project.findFirst({
    where: {
      id,
      client: { memberships: { some: { userId: user.id } } },
    },
    select: { id: true },
  });

  if (!project) return jsonError("Project not found", 404, { nextStep: "Check the project link." }, "PROJECT_NOT_FOUND");

  const snapshot = await getProjectSnapshot({ projectId: project.id });
  if (!snapshot) return jsonError("Project not found", 404, undefined, "PROJECT_NOT_FOUND");

  return Response.json({ snapshot });
}
