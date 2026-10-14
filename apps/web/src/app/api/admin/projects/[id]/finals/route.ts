import { jsonError } from "@/lib/api-error";
import { requireAdmin, requireUser, toRouteErrorResponse } from "@/lib/auth/require";
import { prisma } from "@/lib/prisma";
import { applyTransition } from "@/lib/project-state-machine";
import { deleteStoredFiles, uploadFinalDeliverable } from "@/lib/supabase/storage";
import { logAudit } from "@/lib/audit";
import { createProjectSystemMessage } from "@/lib/system-messages";
import { notifyClientFinalDeliverablesReady } from "@/lib/project-lifecycle-email";

export const runtime = "nodejs";

const CONCEPT_STATUS_APPROVED = "approved";
const PROJECT_STATUS_AWAITING_APPROVAL = "AWAITING_APPROVAL";
const PROJECT_STATUS_FINAL_FILES_READY = "FINAL_FILES_READY";
const PROJECT_STATUS_DELIVERED = "DELIVERED";

type UploadedFinal = Awaited<ReturnType<typeof uploadFinalDeliverable>>;

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
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
      return Response.json({ error: "ZIP file is required" }, { status: 400 });
    }
    const isZip = fileEntry.type === "application/zip" || fileEntry.name.toLowerCase().endsWith(".zip");
    if (!isZip) return Response.json({ error: "Only ZIP uploads are supported" }, { status: 400 });

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

    // Validation deliberately precedes storage. Storage is immutable/versioned;
    // until the guarded transaction commits, existing published bytes and metadata
    // continue to point at the previous asset.
    let upload: UploadedFinal;
    try {
      upload = await uploadFinalDeliverable({ projectId: project.id, file: fileEntry });
    } catch {
      // Storage provider details are intentionally not returned; they may contain
      // sensitive request/object diagnostics.
      return Response.json({ error: "Failed to upload final ZIP" }, { status: 400 });
    }

    let result: {
      asset: { id: string; kind: string; path: string };
      project: { id: string; status: string };
      oldAsset: { id: string; bucket: string; path: string } | null;
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
        if (statusGuard.count !== 1) throw new Error("Project state or approval changed before final metadata update");

        const oldAsset = await tx.fileAsset.findFirst({
          where: { projectId: project.id, kind: "final_zip" },
          orderBy: { createdAt: "desc" },
          select: { id: true, bucket: true, path: true },
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
        if (oldAsset) await tx.fileAsset.delete({ where: { id: oldAsset.id } });

        await logAudit(tx, {
          projectId: project.id,
          actorId: user.id,
          type: "finals_uploaded",
          payload: { fileAssetId: asset.id, path: asset.path, replacedFileAssetId: oldAsset?.id ?? null },
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
        return { asset, project: { id: project.id, status: targetStatus }, oldAsset };
      }, { isolationLevel: "Serializable", maxWait: 2_000, timeout: 5_000 });
    } catch {
      // The unique object was never published in DB; remove it best-effort. The
      // prior record/path remains untouched and therefore remains authorizable.
      await deleteStoredFiles([{ bucket: upload.bucket, path: upload.path }]);
      return Response.json({ error: "Project state changed before final publication; retry from the refreshed project" }, { status: 409 });
    }

    let oldStorageCleanup = { attempted: 0, deleted: 0, failed: 0 };
    if (result.oldAsset && result.oldAsset.path !== upload.path) {
      const cleanup = await deleteStoredFiles([{ bucket: result.oldAsset.bucket, path: result.oldAsset.path }]);
      oldStorageCleanup = { attempted: cleanup.attempted, deleted: cleanup.deleted, failed: cleanup.failures.length };
    }

    let email: Awaited<ReturnType<typeof notifyClientFinalDeliverablesReady>> | null = null;
    if (result.project.status === PROJECT_STATUS_FINAL_FILES_READY) {
      try {
        email = await notifyClientFinalDeliverablesReady(project.id);
      } catch {
        return Response.json({
          ok: false,
          committed: true,
          code: "FINAL_PUBLISHED_EMAIL_FAILED",
          message: "Final files were published, but the client email failed. Restore email delivery, then retry this upload request; the retry creates a new immutable version and retries the unsent notification.",
          retry: { method: "POST", path: `/api/admin/projects/${project.id}/finals`, requiresZip: true },
          fileAsset: result.asset,
          project: result.project,
          oldStorageCleanup,
        }, { status: 502 });
      }
      if (email.status === "skipped" && process.env.NODE_ENV === "production") {
        return Response.json({
          ok: false,
          committed: true,
          code: "FINAL_PUBLISHED_EMAIL_SKIPPED",
          message: "Final files were published, but client email configuration or recipient data is missing. Correct it, then retry this upload request; the retry creates a new immutable version and retries the unsent notification.",
          retry: { method: "POST", path: `/api/admin/projects/${project.id}/finals`, requiresZip: true },
          email,
          fileAsset: result.asset,
          project: result.project,
          oldStorageCleanup,
        }, { status: 503 });
      }
    }

    return Response.json({
      ok: true,
      fileAsset: result.asset,
      project: result.project,
      email,
      oldStorageCleanup,
    });
  } catch (error) {
    return toRouteErrorResponse(error);
  }
}
