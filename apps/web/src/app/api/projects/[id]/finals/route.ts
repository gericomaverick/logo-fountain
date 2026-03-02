import { jsonError } from "@/lib/api-error";
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
    return jsonError("Unauthorized", 401, undefined, "UNAUTHORIZED");
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
    return jsonError("Project not found", 404, undefined, "PROJECT_NOT_FOUND");
  }

  const file = project.fileAssets[0];
  if (!file) {
    return jsonError("Final ZIP not available", 404, undefined, "FINAL_ZIP_NOT_AVAILABLE");
  }

  const url = await createSignedFinalDeliverableUrl(file.path);
  return Response.json({ url });
}
