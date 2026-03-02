import { isAdminUser } from "@/lib/auth/admin";
import { jsonError } from "@/lib/api-error";
import { prisma } from "@/lib/prisma";
import { applyTransition } from "@/lib/project-state-machine";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { uploadFinalDeliverable } from "@/lib/supabase/storage";
import { logAudit } from "@/lib/audit";

export const runtime = "nodejs";

const CONCEPT_STATUS_APPROVED = "approved";
const PROJECT_STATUS_AWAITING_APPROVAL = "AWAITING_APPROVAL";
const PROJECT_STATUS_FINAL_FILES_READY = "FINAL_FILES_READY";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return jsonError("Unauthorized", 401, undefined, "UNAUTHORIZED");
  }

  if (!(await isAdminUser(user))) {
    return jsonError("Forbidden", 403, undefined, "FORBIDDEN");
  }

  const { id: projectId } = await params;

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, status: true },
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
    const upload = await uploadFinalDeliverable({
      projectId: project.id,
      file: fileEntry,
    });

    const hasApproved = (await prisma.concept.count({
      where: { projectId: project.id, status: CONCEPT_STATUS_APPROVED },
    })) > 0;

    const targetStatus = hasApproved ? PROJECT_STATUS_FINAL_FILES_READY : PROJECT_STATUS_AWAITING_APPROVAL;
    const transition = applyTransition(project.status, targetStatus);
    if (!transition.ok) {
      return jsonError(
        `Invalid transition from ${project.status} to ${targetStatus}`,
        400,
        { allowed: transition.allowed },
        "INVALID_PROJECT_STATUS_TRANSITION",
      );
    }

    const result = await prisma.$transaction(async (tx) => {
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

      const updatedProject = await tx.project.update({
        where: { id: project.id },
        data: { status: targetStatus },
        select: { id: true, status: true },
      });

      await logAudit(tx, {
        projectId: project.id,
        actorId: user.id,
        type: "finals_uploaded",
        payload: { fileAssetId: asset.id, path: asset.path },
      });

      await logAudit(tx, {
        projectId: project.id,
        actorId: user.id,
        type: "state_changed",
        payload: { previousStatus: project.status, nextStatus: targetStatus },
      });

      return { asset, project: updatedProject };
    });

    return Response.json({ ok: true, fileAsset: result.asset, project: result.project });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to upload final ZIP";
    return Response.json({ error: message }, { status: 400 });
  }
}
