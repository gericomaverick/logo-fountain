import { jsonError } from "@/lib/api-error";
import { prisma } from "@/lib/prisma";
import { createSignedFinalDeliverableUrl } from "@/lib/supabase/storage";
import { requireProjectMembership, requireUser, toRouteErrorResponse } from "@/lib/auth/require";

export const runtime = "nodejs";

const PROJECT_STATUS_FINAL_FILES_READY = "FINAL_FILES_READY";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireUser();
    const { id } = await params;

    const membershipProject = await requireProjectMembership(user.id, id);

    const project = await prisma.project.findFirst({
      where: {
        id: membershipProject.id,
        status: PROJECT_STATUS_FINAL_FILES_READY,
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
      return jsonError("Project not found", 404, { nextStep: "Final files are available after delivery is complete." }, "PROJECT_NOT_FOUND");
    }

    const file = project.fileAssets[0];
    if (!file) {
      return jsonError("Final ZIP not available", 404, { nextStep: "Ask support to re-upload the final ZIP." }, "FINAL_ZIP_NOT_AVAILABLE");
    }

    const url = await createSignedFinalDeliverableUrl(file.path);
    return Response.json({ url });
  } catch (error) {
    return toRouteErrorResponse(error);
  }
}
