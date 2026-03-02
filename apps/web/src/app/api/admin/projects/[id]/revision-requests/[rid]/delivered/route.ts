import { isAdminUser } from "@/lib/auth/admin";
import { prisma } from "@/lib/prisma";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const STATUS_DELIVERED = "delivered";
const PROJECT_STATUS_CONCEPTS_READY = "CONCEPTS_READY";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string; rid: string }> },
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

  const { id: projectId, rid } = await params;
  const payload = (await req.json().catch(() => null)) as { setConceptsReady?: boolean } | null;
  const setConceptsReady = payload?.setConceptsReady !== false;

  const revisionRequest = await prisma.revisionRequest.findFirst({
    where: { id: rid, projectId },
    select: { id: true, status: true },
  });

  if (!revisionRequest) {
    return Response.json({ error: "Revision request not found" }, { status: 404 });
  }

  const result = await prisma.$transaction(async (tx) => {
    const updatedRevisionRequest = await tx.revisionRequest.update({
      where: { id: revisionRequest.id },
      data: { status: STATUS_DELIVERED },
      select: { id: true, status: true, updatedAt: true },
    });

    let project = null;
    if (setConceptsReady) {
      project = await tx.project.update({
        where: { id: projectId },
        data: { status: PROJECT_STATUS_CONCEPTS_READY },
        select: { id: true, status: true },
      });
    }

    return { updatedRevisionRequest, project };
  });

  return Response.json({ ok: true, revisionRequest: result.updatedRevisionRequest, project: result.project });
}
