import { isAdminUser } from "@/lib/auth/admin";
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
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!(await isAdminUser(user))) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
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
