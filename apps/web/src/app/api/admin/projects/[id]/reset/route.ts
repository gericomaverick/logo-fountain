import { jsonError } from "@/lib/api-error";
import { logAudit } from "@/lib/audit";
import { requireAdmin, requireUser, toRouteErrorResponse } from "@/lib/auth/require";
import { prisma } from "@/lib/prisma";
import { deleteStoredFiles } from "@/lib/supabase/storage";

export const runtime = "nodejs";

type Body = { confirm?: unknown; mode?: unknown; clearMessages?: unknown };

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    await requireAdmin(user);

    const { id: projectId } = await params;
    const payload = (await req.json().catch(() => null)) as Body | null;

    if (payload?.confirm !== true || payload?.mode !== "clean-slate") {
      return jsonError(
        "Reset requires explicit confirmation",
        400,
        { nextStep: "Send { confirm: true, mode: 'clean-slate' }." },
        "CONFIRM_REQUIRED",
      );
    }

    const clearMessages = payload?.clearMessages !== false;

    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: {
        id: true,
        status: true,
        briefs: { select: { id: true }, orderBy: { version: "desc" }, take: 1 },
      },
    });

    if (!project) {
      return jsonError("Project not found", 404, { nextStep: "Check the project link." }, "PROJECT_NOT_FOUND");
    }

    const conceptAssets = await prisma.fileAsset.findMany({
      where: { projectId, kind: "concept" },
      select: { id: true, bucket: true, path: true },
    });

    const result = await prisma.$transaction(async (tx) => {
      const revisionDelete = await tx.revisionRequest.deleteMany({ where: { projectId } });
      const commentDelete = await tx.conceptComment.deleteMany({ where: { projectId } });
      const conceptDelete = await tx.concept.deleteMany({ where: { projectId } });
      const conceptAssetDelete = await tx.fileAsset.deleteMany({ where: { projectId, kind: "concept" } });
      const messageDelete = clearMessages
        ? await tx.message.deleteMany({ where: { projectId, kind: { not: "system" } } })
        : { count: 0 };

      await tx.projectEntitlement.updateMany({
        where: { projectId, key: { in: ["concepts", "revisions"] } },
        data: { consumedInt: 0 },
      });

      const nextStatus = project.briefs.length > 0 ? "BRIEF_SUBMITTED" : "AWAITING_BRIEF";
      const updatedProject = await tx.project.update({
        where: { id: projectId },
        data: { status: nextStatus },
        select: { status: true },
      });

      await logAudit(tx, {
        projectId,
        actorId: user.id,
        type: "project_reset",
        payload: {
          mode: "clean-slate",
          clearMessages,
          previousStatus: project.status,
          nextStatus,
          deleted: {
            concepts: conceptDelete.count,
            conceptAssets: conceptAssetDelete.count,
            revisionRequests: revisionDelete.count,
            conceptComments: commentDelete.count,
            messages: messageDelete.count,
          },
          entitlementsReset: ["concepts", "revisions"],
        },
      });

      return {
        nextStatus: updatedProject.status,
        deleted: {
          concepts: conceptDelete.count,
          conceptAssets: conceptAssetDelete.count,
          revisionRequests: revisionDelete.count,
          conceptComments: commentDelete.count,
          messages: messageDelete.count,
        },
      };
    });

    const storageCleanup = await deleteStoredFiles(
      conceptAssets.map((asset) => ({ bucket: asset.bucket, path: asset.path })),
    );

    return Response.json({ ok: true, projectId, mode: "clean-slate", clearMessages, ...result, storageCleanup });
  } catch (error) {
    return toRouteErrorResponse(error);
  }
}
