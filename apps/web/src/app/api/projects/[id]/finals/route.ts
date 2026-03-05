import { jsonError } from "@/lib/api-error";
import { prisma } from "@/lib/prisma";
import { createSignedFinalDeliverableUrl } from "@/lib/supabase/storage";
import { requireProjectMembership, requireUser, toRouteErrorResponse } from "@/lib/auth/require";
import { buildFinalDeliverableFilename } from "@/lib/final-deliverable-filename";
import { applyTransition } from "@/lib/project-state-machine";
import { logAudit } from "@/lib/audit";

export const runtime = "nodejs";

const PROJECT_STATUS_FINAL_FILES_READY = "FINAL_FILES_READY";
const PROJECT_STATUS_DELIVERED = "DELIVERED";

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
        status: { in: [PROJECT_STATUS_FINAL_FILES_READY, PROJECT_STATUS_DELIVERED] },
      },
      select: {
        id: true,
        status: true,
        client: {
          select: {
            name: true,
            memberships: {
              select: {
                role: true,
                user: {
                  select: {
                    firstName: true,
                    lastName: true,
                    fullName: true,
                    email: true,
                  },
                },
              },
            },
          },
        },
        fileAssets: {
          where: { kind: "final_zip" },
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { path: true, createdAt: true },
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

    if (project.status === PROJECT_STATUS_FINAL_FILES_READY) {
      const transition = applyTransition(project.status, PROJECT_STATUS_DELIVERED);
      if (!transition.ok) {
        return jsonError(
          `Invalid transition from ${project.status} to ${PROJECT_STATUS_DELIVERED}`,
          400,
          { allowed: transition.allowed, nextStep: "Contact support to resolve project status." },
          "INVALID_PROJECT_STATUS_TRANSITION",
        );
      }

      await prisma.$transaction(async (tx) => {
        await tx.project.update({ where: { id: project.id }, data: { status: PROJECT_STATUS_DELIVERED } });
        await logAudit(tx, {
          projectId: project.id,
          actorId: user.id,
          type: "state_changed",
          payload: { previousStatus: project.status, nextStatus: PROJECT_STATUS_DELIVERED, reason: "client_final_zip_download" },
        });
      });
    }

    const owner = project.client.memberships.find((membership) => membership.role.toLowerCase() === "owner") ?? project.client.memberships[0];
    const fullName = owner
      ? [owner.user.firstName, owner.user.lastName].filter(Boolean).join(" ").trim() || owner.user.fullName?.trim() || null
      : null;
    const fileName = buildFinalDeliverableFilename({
      clientName: fullName,
      clientEmail: owner?.user.email ?? null,
      companyName: project.client.name,
      createdAt: file.createdAt,
    });

    const url = await createSignedFinalDeliverableUrl(file.path, 60 * 60, fileName);
    return Response.json({ url });
  } catch (error) {
    return toRouteErrorResponse(error);
  }
}
