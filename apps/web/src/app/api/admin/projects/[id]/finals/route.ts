import { jsonError } from "@/lib/api-error";
import { requireAdmin, requireUser, toRouteErrorResponse } from "@/lib/auth/require";
import { prisma } from "@/lib/prisma";
import { applyTransition } from "@/lib/project-state-machine";
import { uploadFinalDeliverable } from "@/lib/storage/r2";
import { prepareFinalZip, UploadValidationError } from "@/lib/upload-validation";
import { logAudit } from "@/lib/audit";
import { createProjectSystemMessage } from "@/lib/system-messages";
import { notifyClientFinalDeliverablesReady } from "@/lib/project-lifecycle-email";
import { rejectUntrustedMutationOrigin } from "@/lib/request-origin";

export const runtime = "nodejs";

const CONCEPT_STATUS_APPROVED = "approved";
const PROJECT_STATUS_AWAITING_APPROVAL = "AWAITING_APPROVAL";
const PROJECT_STATUS_FINAL_FILES_READY = "FINAL_FILES_READY";
const PROJECT_STATUS_DELIVERED = "DELIVERED";

type UploadedFinal = Awaited<ReturnType<typeof uploadFinalDeliverable>>;

class KnownSafePublicationConflict extends Error {}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const originError = rejectUntrustedMutationOrigin(req);
  if (originError) return originError;
  try {
    const user = await requireUser();
    await requireAdmin(user);

    const { id: projectId } = await params;
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true, status: true, updatedAt: true },
    });
    if (!project) return jsonError("Project not found", 404, undefined, "PROJECT_NOT_FOUND");

    const formData = await req.formData();
    const fileEntry = formData.get("file");
    if (!(fileEntry instanceof File) || fileEntry.size <= 0) {
      return Response.json({ error: "ZIP file is required", code: "FILE_REQUIRED" }, { status: 400 });
    }

    const hasApproved = (await prisma.concept.count({
      where: { projectId: project.id, status: CONCEPT_STATUS_APPROVED },
    })) > 0;
    const isReadyRepair = project.status === PROJECT_STATUS_FINAL_FILES_READY || project.status === PROJECT_STATUS_DELIVERED;
    if (isReadyRepair && !hasApproved) {
      return jsonError("Final-file repair requires an approved concept", 400, undefined, "FINAL_REPAIR_REQUIRES_APPROVAL");
    }

    const targetStatus = isReadyRepair
      ? project.status
      : hasApproved ? PROJECT_STATUS_FINAL_FILES_READY : PROJECT_STATUS_AWAITING_APPROVAL;
    const stateChanged = targetStatus !== project.status;
    if (stateChanged) {
      const transition = applyTransition(project.status, targetStatus);
      if (!transition.ok) {
        return jsonError(
          `Invalid transition from ${project.status} to ${targetStatus}`,
          400,
          { allowed: transition.allowed },
          "INVALID_PROJECT_STATUS_TRANSITION",
        );
      }
    }

    // State/approval checks precede allocation and storage. The size check inside
    // prepareFinalZip also precedes arrayBuffer().
    let prepared;
    try {
      prepared = await prepareFinalZip(fileEntry);
    } catch (error) {
      if (error instanceof UploadValidationError) {
        return Response.json({ error: error.message, code: error.code }, { status: 400 });
      }
      throw error;
    }

    // Storage is immutable/versioned; until the guarded transaction commits,
    // existing published bytes and metadata still point at the previous asset.
    let upload: UploadedFinal;
    try {
      upload = await uploadFinalDeliverable({ projectId: project.id, upload: prepared });
    } catch {
      // Storage provider details are intentionally not returned; they may contain
      // sensitive request/object diagnostics.
      return Response.json({ error: "Failed to upload final ZIP" }, { status: 400 });
    }

    let result: {
      asset: { id: string; kind: string; path: string };
      project: { id: string; status: string };
      previousAsset: { id: string; path: string } | null;
      recoveredAfterTransactionError?: boolean;
      isCurrentPublication?: boolean;
    };
    try {
      const publicationTime = new Date();
      result = await prisma.$transaction(async (tx) => {
        const statusGuard = await tx.project.updateMany({
          where: {
            id: project.id,
            status: project.status,
            updatedAt: project.updatedAt,
            concepts: hasApproved
              ? { some: { status: CONCEPT_STATUS_APPROVED } }
              : { none: { status: CONCEPT_STATUS_APPROVED } },
          },
          // Always advance updatedAt, including same-state repair/replacement,
          // so concurrent publishers cannot both satisfy the optimistic guard.
          data: { status: targetStatus, updatedAt: publicationTime },
        });
        if (statusGuard.count !== 1) throw new KnownSafePublicationConflict("Project state or approval changed before final metadata update");

        const previousAsset = await tx.fileAsset.findFirst({
          where: { projectId: project.id, kind: "final_zip" },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          select: { id: true, path: true },
        });
        const asset = await tx.fileAsset.create({
          data: {
            projectId: project.id,
            kind: "final_zip",
            bucket: upload.bucket,
            path: upload.path,
            mime: upload.mime,
            size: upload.size,
            uploadedBy: user.id,
          },
          select: { id: true, kind: true, path: true },
        });

        await logAudit(tx, {
          projectId: project.id,
          actorId: user.id,
          type: "finals_uploaded",
          payload: { fileAssetId: asset.id, path: asset.path, supersededFileAssetId: previousAsset?.id ?? null },
        });
        if (stateChanged) {
          await logAudit(tx, {
            projectId: project.id,
            actorId: user.id,
            type: "state_changed",
            payload: { previousStatus: project.status, nextStatus: targetStatus },
          });
        }
        if (stateChanged && targetStatus === PROJECT_STATUS_FINAL_FILES_READY) {
          await createProjectSystemMessage(tx, {
            projectId: project.id,
            fallbackUserId: user.id,
            body: "Final files are ready to download.",
          });
        }
        return { asset, project: { id: project.id, status: targetStatus }, previousAsset };
      }, { isolationLevel: "Serializable", maxWait: 2_000, timeout: 5_000 });
    } catch {
      // All transaction exceptions retain immutable bytes, even typed callback aborts.
      try {
        const verifiedAsset = await prisma.fileAsset.findFirst({
          where: {
            projectId: project.id,
            kind: "final_zip",
            bucket: upload.bucket,
            path: upload.path,
          },
          select: {
            id: true,
            kind: true,
            path: true,
            project: {
              select: {
                id: true,
                status: true,
                fileAssets: {
                  where: { kind: "final_zip" },
                  orderBy: [{ createdAt: "desc" }, { id: "desc" }],
                  take: 1,
                  select: { id: true },
                },
              },
            },
          },
        });

        if (verifiedAsset) {
          result = {
            asset: { id: verifiedAsset.id, kind: verifiedAsset.kind, path: verifiedAsset.path },
            project: { id: verifiedAsset.project.id, status: verifiedAsset.project.status },
            previousAsset: null,
            recoveredAfterTransactionError: true,
            isCurrentPublication: verifiedAsset.project.fileAssets[0]?.id === verifiedAsset.id,
          };
        } else {
          // Even an immediate absent-row result cannot prove a transaction will
          // not become visible later. Retain immutable bytes fail-safe; this may
          // create an orphan that requires future audited housekeeping.
          return Response.json({
            error: "Project state changed before final publication; the uploaded object was retained for safe operational review",
            code: "FINAL_PUBLICATION_CONFLICT",
            uploadedObjectRetained: true,
            uploadedObject: { bucket: upload.bucket, path: upload.path },
          }, { status: 409 });
        }
      } catch {
        // Outcome cannot be established. Retain the object because deleting it
        // could break a publication that actually committed.
        return Response.json({
          ok: false,
          committed: "unknown",
          code: "FINAL_PUBLICATION_OUTCOME_UNKNOWN",
          message: "The final publication outcome could not be verified. The uploaded object was retained. Refresh project state and investigate before retrying.",
          uploadedObject: { bucket: upload.bucket, path: upload.path },
        }, { status: 503 });
      }
    }

    try {
      let email: Awaited<ReturnType<typeof notifyClientFinalDeliverablesReady>> | null = null;
      if (result.project.status === PROJECT_STATUS_FINAL_FILES_READY && result.isCurrentPublication !== false) {
        try {
          email = await notifyClientFinalDeliverablesReady(project.id, result.asset.id);
        } catch {
          return Response.json({
            ok: false,
            committed: true,
            code: "FINAL_PUBLISHED_EMAIL_FAILED",
            message: "Final files are live, but the client notification failed. Restore email delivery, then retry only the notification.",
            retry: { method: "POST", path: `/api/admin/projects/${project.id}/finals/notify` },
            fileAsset: result.asset,
            project: result.project,
          }, { status: 502 });
        }
        if (email.status === "skipped" && process.env.NODE_ENV === "production") {
          return Response.json({
            ok: false,
            committed: true,
            code: "FINAL_PUBLISHED_EMAIL_SKIPPED",
            message: "Final files are live, but client email configuration or recipient data is missing. Correct it, then retry only the notification.",
            retry: { method: "POST", path: `/api/admin/projects/${project.id}/finals/notify` },
            email,
            fileAsset: result.asset,
            project: result.project,
          }, { status: 503 });
        }
      }

      return Response.json({
        ok: true,
        fileAsset: result.asset,
        project: result.project,
        email,
        retainedPreviousAsset: result.previousAsset,
        recoveredAfterTransactionError: result.recoveredAfterTransactionError ?? false,
        currentPublication: result.isCurrentPublication ?? true,
      });
    } catch {
      return Response.json({
        ok: false,
        committed: true,
        code: "FINAL_PUBLISHED_POST_COMMIT_FAILED",
        message: "Final files are live, but a post-publication step failed. Refresh project state before retrying the client notification.",
        retry: { method: "POST", path: `/api/admin/projects/${project.id}/finals/notify` },
        fileAsset: result.asset,
        project: result.project,
      }, { status: 502 });
    }
  } catch (error) {
    return toRouteErrorResponse(error);
  }
}
