import { isAdminUser } from "@/lib/auth/admin";
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

  if (!(await isAdminUser(user))) {
    return jsonError("Forbidden", 403, undefined, "FORBIDDEN");
  }

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
}
