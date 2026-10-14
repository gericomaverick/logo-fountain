import { jsonError } from "@/lib/api-error";
import { requireAdmin, requireUser, toRouteErrorResponse } from "@/lib/auth/require";
import { prisma } from "@/lib/prisma";
import { applyTransition } from "@/lib/project-state-machine";
import { uploadFinalDeliverable } from "@/lib/supabase/storage";
import { logAudit } from "@/lib/audit";
import { createProjectSystemMessage } from "@/lib/system-messages";
import { notifyClientFinalDeliverablesReady } from "@/lib/project-lifecycle-email";

export const runtime = "nodejs";

const CONCEPT_STATUS_APPROVED = "approved";
const PROJECT_STATUS_AWAITING_APPROVAL = "AWAITING_APPROVAL";
const PROJECT_STATUS_FINAL_FILES_READY = "FINAL_FILES_READY";
const PROJECT_STATUS_DELIVERED = "DELIVERED";

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

  if (!project) {
    return jsonError("Project not found", 404, undefined, "PROJECT_NOT_FOUND");
  }

  const formData = await req.formData();
  const fileEntry = formData.get("file");

  if (!(fileEntry instanceof File) || fileEntry.size <= 0) {
    return Response.json({ error: "ZIP file is required" }, { status: 400 });
  }

  const isZip = fileEntry.type === "application/zip" || fileEntry.name.toLowerCase().endsWith(".zip");
  if (!isZip) {
    return Response.json({ error: "Only ZIP uploads are supported" }, { status: 400 });
  }

  try {
    const hasApproved = (await prisma.concept.count({
      where: { projectId: project.id, status: CONCEPT_STATUS_APPROVED },
    })) > 0;

    const isReadyRepair = project.status === PROJECT_STATUS_FINAL_FILES_READY || project.status === PROJECT_STATUS_DELIVERED;
    if (isReadyRepair && !hasApproved) {
      return jsonError(
        "Final-file repair requires an approved concept",
        400,
        undefined,
        "FINAL_REPAIR_REQUIRES_APPROVAL",
      );
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

    // Validate lifecycle state before writing storage so rejected requests cannot
    // leave an uploaded object without matching database metadata.
    const upload = await uploadFinalDeliverable({
      projectId: project.id,
      file: fileEntry,
    });

    const result = await prisma.$transaction(async (tx) => {
      const statusGuard = await tx.project.updateMany({
        where: { id: project.id, status: project.status, updatedAt: project.updatedAt },
        data: stateChanged
          ? { status: targetStatus }
          : { status: project.status, updatedAt: project.updatedAt },
      });
      if (statusGuard.count !== 1) throw new Error("Project state changed before final metadata update");

      const existing = await tx.fileAsset.findFirst({
        where: { projectId: project.id, kind: "final_zip" },
        select: { id: true },
      });

      const asset = existing
        ? await tx.fileAsset.update({
            where: { id: existing.id },
            data: {
              bucket: upload.bucket,
              path: upload.path,
              mime: upload.mime,
              size: upload.size,
              uploadedBy: user.id,
            },
            select: { id: true, kind: true, path: true },
          })
        : await tx.fileAsset.create({
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

      const updatedProject = { id: project.id, status: targetStatus };

      await logAudit(tx, {
        projectId: project.id,
        actorId: user.id,
        type: "finals_uploaded",
        payload: { fileAssetId: asset.id, path: asset.path },
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

      return { asset, project: updatedProject };
    });

    if (result.project.status === PROJECT_STATUS_FINAL_FILES_READY) {
      await notifyClientFinalDeliverablesReady(project.id);
    }

    return Response.json({ ok: true, fileAsset: result.asset, project: result.project });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to upload final ZIP";
    return Response.json({ error: message }, { status: 400 });
  }
  } catch (error) {
    return toRouteErrorResponse(error);
  }
}
