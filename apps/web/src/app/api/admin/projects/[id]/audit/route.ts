import { isAdminUser } from "@/lib/auth/admin";
import { jsonError } from "@/lib/api-error";
import { prisma } from "@/lib/prisma";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return jsonError("Unauthorized", 401, { nextStep: "Sign in and retry." }, "UNAUTHORIZED");
  if (!(await isAdminUser(user))) return jsonError("Forbidden", 403, { nextStep: "Use an admin account." }, "FORBIDDEN");

  const { id: projectId } = await params;

  const events = await prisma.auditEvent.findMany({
    where: { projectId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 100,
    select: {
      id: true,
      type: true,
      payload: true,
      createdAt: true,
      actor: { select: { email: true, fullName: true } },
    },
  });

  return Response.json({ events });
}
