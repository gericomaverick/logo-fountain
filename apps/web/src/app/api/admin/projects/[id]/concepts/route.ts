import { jsonError } from "@/lib/api-error";
import { prisma } from "@/lib/prisma";
import { uploadConceptAsset } from "@/lib/supabase/storage";
import { logAudit } from "@/lib/audit";
import { applyTransition } from "@/lib/project-state-machine";
import { requireAdmin, requireUser, toRouteErrorResponse } from "@/lib/auth/require";

export const runtime = "nodejs";

const PROJECT_STATUS_CONCEPTS_READY = "CONCEPTS_READY";
const CONCEPT_STATUS_PUBLISHED = "published";

function parseConceptNumber(raw: FormDataEntryValue | null): number | null {
  if (typeof raw !== "string") return null;
  const value = Number.parseInt(raw, 10);
  return Number.isInteger(value) && value > 0 ? value : null;
}

function parseNotes(raw: FormDataEntryValue | null): string | null {
  if (typeof raw !== "string") return null;
  const value = raw.trim();
  return value.length > 0 ? value : null;
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    await requireAdmin(user);

    const { id: projectId } = await params;
    const [project, concepts] = await Promise.all([
      prisma.project.findUnique({ where: { id: projectId }, select: { status: true } }),
      prisma.concept.findMany({
        where: { projectId },
        orderBy: [{ number: "asc" }, { createdAt: "asc" }],
        select: { id: true, number: true, status: true, notes: true },
      }),
    ]);

    return Response.json({ concepts, projectStatus: project?.status ?? null });
  } catch (error) {
    return toRouteErrorResponse(error);
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    await requireAdmin(user);

    const { id: projectId } = await params;
    const project = await prisma.project.findUnique({ where: { id: projectId }, select: { id: true, status: true } });
    if (!project) return jsonError("Project not found", 404, { nextStep: "Check the project link." }, "PROJECT_NOT_FOUND");

    const formData = await req.formData();
    const fileEntry = formData.get("file");
    const conceptNumber = parseConceptNumber(formData.get("conceptNumber"));
    const notes = parseNotes(formData.get("notes"));

    if (!(fileEntry instanceof File) || fileEntry.size <= 0) return jsonError("Image file is required", 400, { nextStep: "Upload an image file." }, "FILE_REQUIRED");
    if (!fileEntry.type.startsWith("image/")) return jsonError("Only image uploads are supported", 400, { nextStep: "Upload a PNG/JPEG/WebP image." }, "INVALID_FILE_TYPE");
    if (!conceptNumber) return jsonError("Valid conceptNumber is required", 400, { nextStep: "Set conceptNumber to a positive integer." }, "INVALID_CONCEPT_NUMBER");

    const existingConcept = await prisma.concept.findUnique({
      where: { projectId_number: { projectId, number: conceptNumber } },
      select: { id: true, status: true },
    });

    const concept = await prisma.concept.upsert({
      where: { projectId_number: { projectId, number: conceptNumber } },
      update: { notes, status: CONCEPT_STATUS_PUBLISHED },
      create: { projectId, number: conceptNumber, status: CONCEPT_STATUS_PUBLISHED, notes },
      select: { id: true, number: true, status: true, notes: true },
    });

    const shouldConsumeEntitlement = !existingConcept || existingConcept.status !== CONCEPT_STATUS_PUBLISHED;

    const upload = await uploadConceptAsset({ projectId, conceptId: concept.id, file: fileEntry });

    const alreadyPublishedCount = await prisma.concept.count({
      where: {
        projectId,
        status: CONCEPT_STATUS_PUBLISHED,
        id: { not: concept.id },
      },
    });

    const needsTransition = alreadyPublishedCount === 0 && project.status !== PROJECT_STATUS_CONCEPTS_READY;
    if (needsTransition) {
      const transition = applyTransition(project.status, PROJECT_STATUS_CONCEPTS_READY);
      if (!transition.ok) {
        return jsonError(
          `Invalid transition from ${project.status} to ${PROJECT_STATUS_CONCEPTS_READY}`,
          400,
          { allowed: transition.allowed },
          "INVALID_PROJECT_STATUS_TRANSITION",
        );
      }
    }

    const result = await prisma.$transaction(async (tx) => {
      if (shouldConsumeEntitlement) {
        // Increment concepts entitlement usage when a concept is first published for a given concept number.
        // (Re-uploads/replacements should not consume another entitlement.)
        const before = await tx.projectEntitlement.findFirst({
          where: { projectId, key: "concepts" },
          select: { id: true, limitInt: true, consumedInt: true },
        });

        await tx.$executeRaw`
          UPDATE "ProjectEntitlement"
          SET "consumedInt" = COALESCE("consumedInt", 0) + 1,
              "updatedAt" = NOW()
          WHERE "projectId" = ${projectId}::uuid
            AND "key" = 'concepts'
        `;

        const after = await tx.projectEntitlement.findFirst({
          where: { projectId, key: "concepts" },
          select: { id: true, limitInt: true, consumedInt: true },
        });

        await logAudit(tx, {
          projectId,
          actorId: user.id,
          type: "entitlement_consumed",
          payload: {
            key: "concepts",
            before,
            after,
            reason: "admin_concept_publish",
            conceptId: concept.id,
            conceptNumber: concept.number,
          },
        });
      }

      await tx.fileAsset.create({
        data: { projectId, kind: "concept", bucket: upload.bucket, path: upload.path, mime: upload.mime, size: upload.size, uploadedBy: user.id },
      });

      await logAudit(tx, {
        projectId,
        actorId: user.id,
        type: "concept_uploaded",
        payload: { conceptId: concept.id, conceptNumber: concept.number, filePath: upload.path, published: true },
      });

      if (needsTransition) {
        await tx.project.update({
          where: { id: projectId },
          data: { status: PROJECT_STATUS_CONCEPTS_READY },
        });

        await logAudit(tx, {
          projectId,
          actorId: user.id,
          type: "state_changed",
          payload: { previousStatus: project.status, nextStatus: PROJECT_STATUS_CONCEPTS_READY },
        });
      }

      return { projectStatus: needsTransition ? PROJECT_STATUS_CONCEPTS_READY : project.status };
    });

    return Response.json({ ok: true, concept, projectStatus: result.projectStatus });
  } catch (error) {
    return toRouteErrorResponse(error);
  }
}
