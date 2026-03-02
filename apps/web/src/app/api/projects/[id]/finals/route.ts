import { prisma } from "@/lib/prisma";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSignedFinalDeliverableUrl } from "@/lib/supabase/storage";

export const runtime = "nodejs";

const PROJECT_STATUS_FINAL_FILES_READY = "FINAL_FILES_READY";

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

  const { id } = await params;

  const project = await prisma.project.findFirst({
    where: {
      id,
      status: PROJECT_STATUS_FINAL_FILES_READY,
      client: {
        memberships: {
          some: {
            userId: user.id,
          },
        },
      },
    },
    select: {
      id: true,
      fileAssets: {
        where: { kind: "final_zip" },
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { path: true },
      },
    },
  });

  if (!project) {
    return Response.json({ error: "Project not found" }, { status: 404 });
  }

  const file = project.fileAssets[0];
  if (!file) {
    return Response.json({ error: "Final ZIP not available" }, { status: 404 });
  }

  const url = await createSignedFinalDeliverableUrl(file.path);
  return Response.json({ url });
}
