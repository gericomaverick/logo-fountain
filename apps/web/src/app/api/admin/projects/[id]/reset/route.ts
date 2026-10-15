import { jsonError } from "@/lib/api-error";
import { logAudit } from "@/lib/audit";
import { requireAdmin, requireUser, toRouteErrorResponse } from "@/lib/auth/require";
import { prisma } from "@/lib/prisma";
import { rejectUntrustedMutationOrigin } from "@/lib/request-origin";

export const runtime = "nodejs";

type Body = { confirm?: unknown; mode?: unknown; clearMessages?: unknown };
class ResetConflict extends Error {}

function isTransactionConflict(error: unknown) {
  const code = typeof error === "object" && error !== null && "code" in error ? (error as { code?: string }).code : undefined;
  return error instanceof ResetConflict || code === "P2034" || code === "P2028";
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const originError = rejectUntrustedMutationOrigin(req);
  if (originError) return originError;
  try {
    const user = await requireUser();
    await requireAdmin(user);
    const { id: projectId } = await params;
    const payload = (await req.json().catch(() => null)) as Body | null;

    if (payload?.confirm !== true || payload?.mode !== "clean-slate") {
      return jsonError("Reset requires explicit confirmation", 400, { nextStep: "Send { confirm: true, mode: 'clean-slate' }." }, "CONFIRM_REQUIRED");
    }
    const clearMessages = payload.clearMessages !== false;
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true, status: true, updatedAt: true, briefs: { select: { id: true }, orderBy: { version: "desc" }, take: 1 } },
    });
    if (!project) return jsonError("Project not found", 404, { nextStep: "Check the project link." }, "PROJECT_NOT_FOUND");

    const result = await prisma.$transaction(async (tx) => {
      const nextStatus = project.briefs.length > 0 ? "BRIEF_SUBMITTED" : "AWAITING_BRIEF";
      // Lock/version-guard the project before deleting active records. A final
      // publisher uses the same project version guard, so it must commit before
      // this reset (and be removed below) or fail after this reset.
      const guarded = await tx.project.updateMany({
        where: { id: projectId, status: project.status, updatedAt: project.updatedAt },
        data: { status: nextStatus },
      });
      if (guarded.count !== 1) throw new ResetConflict("Project changed before reset");

      const assets = await tx.fileAsset.findMany({
        where: { projectId, kind: { in: ["concept", "final_zip"] } },
        select: { id: true, kind: true, bucket: true, path: true },
      });
      const conceptAssets = assets.filter((asset) => asset.kind === "concept");
      const retainedFinalAssets = assets.filter((asset) => asset.kind === "final_zip");

      const revisionDelete = await tx.revisionRequest.deleteMany({ where: { projectId } });
      const commentDelete = await tx.conceptComment.deleteMany({ where: { projectId } });
      const conceptDelete = await tx.concept.deleteMany({ where: { projectId } });
      const conceptAssetDelete = await tx.fileAsset.deleteMany({ where: { projectId, kind: "concept" } });
      // Delete publication metadata, never immutable final bytes. Existing
      // signed URLs can expire naturally, while no retained object can become
      // active again without a new FileAsset publication transaction.
      const finalPublicationDelete = await tx.fileAsset.deleteMany({ where: { projectId, kind: "final_zip" } });
      const messageDelete = clearMessages ? await tx.message.deleteMany({ where: { projectId, kind: { not: "system" } } }) : { count: 0 };

      await tx.projectEntitlement.updateMany({
        where: { projectId, key: { in: ["concepts", "revisions"] } },
        data: { consumedInt: 0, reservedInt: 0 },
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
            finalPublications: finalPublicationDelete.count,
            revisionRequests: revisionDelete.count,
            conceptComments: commentDelete.count,
            messages: messageDelete.count,
          },
          entitlementsReset: ["concepts", "revisions"],
          entitlementFieldsReset: ["consumedInt", "reservedInt"],
          retainedFinalStorageObjects: retainedFinalAssets.map(({ bucket, path }) => ({ bucket, path })),
          retainedConceptStorageObjects: conceptAssets.map(({ bucket, path }) => ({ bucket, path })),
          retainedFinalReason: "allow_pre_reset_signed_urls_to_expire_without_reactivating_publication_records",
        },
      });

      return {
        nextStatus,
        conceptAssets,
        retainedFinalStorageObjects: retainedFinalAssets.map(({ bucket, path }) => ({ bucket, path })),
        deleted: {
          concepts: conceptDelete.count,
          conceptAssets: conceptAssetDelete.count,
          finalPublications: finalPublicationDelete.count,
          revisionRequests: revisionDelete.count,
          conceptComments: commentDelete.count,
          messages: messageDelete.count,
        },
      };
    }, { isolationLevel: "Serializable", maxWait: 2_000, timeout: 5_000 });

    // Reset publication metadata only. Retain immutable concept bytes as well:
    // issued URLs and durable upload receipts must not become dangling capabilities.
    const storageCleanup = { attempted: 0, deleted: 0, failures: [] };

    return Response.json({
      ok: true,
      projectId,
      mode: "clean-slate",
      clearMessages,
      nextStatus: result.nextStatus,
      retainedFinalStorageObjects: result.retainedFinalStorageObjects,
      retainedConceptStorageObjects: result.conceptAssets.map(({ bucket, path }) => ({ bucket, path })),
      deleted: result.deleted,
      storageCleanup,
    });
  } catch (error) {
    if (isTransactionConflict(error)) return jsonError("Project changed during reset; refresh before retrying", 409, undefined, "PROJECT_RESET_CONFLICT");
    return toRouteErrorResponse(error);
  }
}
