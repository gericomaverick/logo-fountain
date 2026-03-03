import { jsonError } from "@/lib/api-error";
import { prisma } from "@/lib/prisma";
import { createSignedConceptAssetUrl, inferExtension, uploadConceptAsset } from "@/lib/supabase/storage";
import { logAudit } from "@/lib/audit";
import { applyTransition } from "@/lib/project-state-machine";
import { requireAdmin, requireUser, toRouteErrorResponse } from "@/lib/auth/require";
import { createProjectSystemMessage } from "@/lib/system-messages";

export const runtime = "nodejs";

const PROJECT_STATUS_CONCEPTS_READY = "CONCEPTS_READY";
const CONCEPT_STATUS_PUBLISHED = "published";

type UploadMode = "concept" | "replace" | "revision";

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

function parseUploadMode(raw: FormDataEntryValue | null): UploadMode {
  if (raw === "replace" || raw === "revision") return raw;
  return "concept";
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    await requireAdmin(user);

    const { id: projectId } = await params;
    const [project, concepts, pendingRevisionCounts, deliveredRevisionCounts, commentsCounts] = await Promise.all([
      prisma.project.findUnique({ where: { id: projectId }, select: { status: true } }),
      prisma.concept.findMany({
        where: { projectId },
        orderBy: [{ number: "asc" }, { createdAt: "asc" }],
        select: { id: true, number: true, status: true, notes: true },
      }),
      prisma.revisionRequest.groupBy({
        by: ["conceptId"],
        where: { projectId, status: { not: "delivered" }, conceptId: { not: null } },
        _count: { _all: true },
      }),
      prisma.revisionRequest.groupBy({
        by: ["conceptId"],
        where: { projectId, status: "delivered", conceptId: { not: null } },
        _count: { _all: true },
      }),
      prisma.conceptComment.groupBy({
        by: ["conceptId"],
        where: { projectId },
        _count: { _all: true },
      }),
    ]);

    const conceptIds = concepts.map((concept) => concept.id);
    const files = conceptIds.length
      ? await prisma.fileAsset.findMany({
          where: {
            projectId,
            kind: "concept",
            OR: conceptIds.flatMap((conceptId) => ([
              { path: { startsWith: `${projectId}/${conceptId}.` } },
              { path: { startsWith: `${projectId}/${conceptId}/v` } },
            ])),
          },
          orderBy: [{ createdAt: "desc" }],
          select: { path: true },
        })
      : [];

    const fileByConceptId = new Map<string, { path: string }>();
    const versionByConceptId = new Map<string, number>();

    for (const file of files) {
      const parts = file.path.split("/");
      const fileName = parts.at(-1) ?? "";

      // Legacy path:   <projectId>/<conceptId>.<ext>
      // Versioned path:<projectId>/<conceptId>/vN.<ext>
      const conceptId = parts.length >= 3 ? (parts[1] ?? "") : fileName.split(".")[0];
      if (!conceptId) continue;

      const versionMatch = fileName.match(/^v(\d+)\./);
      const parsedVersion = versionMatch?.[1] ? Number.parseInt(versionMatch[1], 10) : 1;
      const safeVersion = Number.isFinite(parsedVersion) && parsedVersion > 0 ? parsedVersion : 1;

      versionByConceptId.set(conceptId, Math.max(versionByConceptId.get(conceptId) ?? 0, safeVersion));

      // files are ordered DESC, so first seen is latest.
      if (!fileByConceptId.has(conceptId)) fileByConceptId.set(conceptId, { path: file.path });
    }

    const pendingByConceptId = new Map(
      pendingRevisionCounts
        .filter((entry) => Boolean(entry.conceptId))
        .map((entry) => [entry.conceptId as string, entry._count._all]),
    );

    const deliveredByConceptId = new Map(
      deliveredRevisionCounts
        .filter((entry) => Boolean(entry.conceptId))
        .map((entry) => [entry.conceptId as string, entry._count._all]),
    );

    const commentsByConceptId = new Map(
      commentsCounts
        .filter((entry) => Boolean(entry.conceptId))
        .map((entry) => [entry.conceptId as string, entry._count._all]),
    );

    const conceptsWithMeta = await Promise.all(
      concepts.map(async (concept) => {
        const file = fileByConceptId.get(concept.id);
        const version = versionByConceptId.get(concept.id) ?? 0;
        return {
          ...concept,
          revisionVersion: Math.max(version, 1),
          imageUrl: file ? await createSignedConceptAssetUrl(file.path) : null,
          pendingRevisionCount: pendingByConceptId.get(concept.id) ?? 0,
          commentCount: commentsByConceptId.get(concept.id) ?? 0,
        };
      }),
    );

    return Response.json({ concepts: conceptsWithMeta, projectStatus: project?.status ?? null });
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
    const conceptIdRaw = formData.get("conceptId");
    const conceptId = typeof conceptIdRaw === "string" && conceptIdRaw.trim() ? conceptIdRaw : null;
    const notes = parseNotes(formData.get("notes"));
    const assetNotes = parseNotes(formData.get("assetNotes"));
    const uploadMode = parseUploadMode(formData.get("uploadMode"));

    if (!(fileEntry instanceof File) || fileEntry.size <= 0) return jsonError("Image file is required", 400, { nextStep: "Upload an image file." }, "FILE_REQUIRED");
    if (!fileEntry.type.startsWith("image/")) return jsonError("Only image uploads are supported", 400, { nextStep: "Upload a PNG/JPEG/WebP image." }, "INVALID_FILE_TYPE");

    let concept: { id: string; number: number; status: string; notes: string | null } | null = null;
    let shouldConsumeEntitlement = false;

    if (uploadMode === "revision") {
      if (!conceptId) {
        return jsonError("conceptId is required for revision uploads", 400, { nextStep: "Use Upload revision on a specific concept." }, "CONCEPT_ID_REQUIRED");
      }

      const existingConcept = await prisma.concept.findFirst({
        where: { id: conceptId, projectId },
        select: { id: true, number: true, status: true, notes: true },
      });

      if (!existingConcept) {
        return jsonError("Concept not found", 404, { nextStep: "Refresh and pick a valid concept." }, "CONCEPT_NOT_FOUND");
      }

      concept = await prisma.concept.update({
        where: { id: existingConcept.id },
        data: { status: CONCEPT_STATUS_PUBLISHED },
        select: { id: true, number: true, status: true, notes: true },
      });
    } else {
      if (!conceptNumber) return jsonError("Valid conceptNumber is required", 400, { nextStep: "Set conceptNumber to a positive integer." }, "INVALID_CONCEPT_NUMBER");

      const existingConcept = await prisma.concept.findUnique({
        where: { projectId_number: { projectId, number: conceptNumber } },
        select: { id: true, status: true },
      });

      concept = await prisma.concept.upsert({
        where: { projectId_number: { projectId, number: conceptNumber } },
        update: { notes, status: CONCEPT_STATUS_PUBLISHED },
        create: { projectId, number: conceptNumber, status: CONCEPT_STATUS_PUBLISHED, notes },
        select: { id: true, number: true, status: true, notes: true },
      });

      shouldConsumeEntitlement = uploadMode === "concept" && (!existingConcept || existingConcept.status !== CONCEPT_STATUS_PUBLISHED);
    }

    const ext = inferExtension(fileEntry);

    let bucketPath = `${projectId}/${concept.id}.${ext}`;
    let upsert = true;

    if (uploadMode === "revision") {
      const existingFiles = await prisma.fileAsset.findMany({
        where: {
          projectId,
          kind: "concept",
          OR: [
            { path: { startsWith: `${projectId}/${concept.id}/v` } },
            { path: { startsWith: `${projectId}/${concept.id}.` } },
          ],
        },
        select: { path: true },
      });

      let maxVersion = 0;
      for (const file of existingFiles) {
        const match = file.path.match(/\/v(\d+)\./);
        if (match?.[1]) {
          const parsed = Number.parseInt(match[1], 10);
          if (Number.isFinite(parsed)) maxVersion = Math.max(maxVersion, parsed);
          continue;
        }
        // Legacy single-file path counts as version 1.
        maxVersion = Math.max(maxVersion, 1);
      }

      const nextVersion = Math.max(maxVersion + 1, 2);
      bucketPath = `${projectId}/${concept.id}/v${nextVersion}.${ext}`;
      upsert = false;
    }

    const upload = await uploadConceptAsset({ bucketPath, file: fileEntry, upsert });

    const alreadyPublishedCount = await prisma.concept.count({
      where: {
        projectId,
        status: CONCEPT_STATUS_PUBLISHED,
        id: { not: concept.id },
      },
    });

    const shouldSetConceptsReady = uploadMode === "revision" || (alreadyPublishedCount === 0 && project.status !== PROJECT_STATUS_CONCEPTS_READY);
    if (shouldSetConceptsReady && project.status !== PROJECT_STATUS_CONCEPTS_READY) {
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
        data: {
          projectId,
          kind: "concept",
          bucket: upload.bucket,
          path: upload.path,
          mime: upload.mime,
          size: upload.size,
          notes: assetNotes,
          uploadedBy: user.id,
        },
      });

      let deliveredCount = 0;
      if (uploadMode === "revision") {
        const delivered = await tx.revisionRequest.updateMany({
          where: { projectId, conceptId: concept.id, status: { not: "delivered" } },
          data: { status: "delivered" },
        });
        deliveredCount = delivered.count;

        if (deliveredCount > 0) {
          // Reserve-on-request, consume-on-delivery: convert reservations into consumed revisions.
          await tx.$executeRaw`
            UPDATE "ProjectEntitlement"
            SET "reservedInt" = GREATEST(COALESCE("reservedInt", 0) - ${deliveredCount}, 0),
                "consumedInt" = COALESCE("consumedInt", 0) + ${deliveredCount},
                "updatedAt" = NOW()
            WHERE "projectId" = ${projectId}::uuid
              AND "key" = 'revisions'
          `;
        }
      }

      await logAudit(tx, {
        projectId,
        actorId: user.id,
        type: uploadMode === "revision" ? "concept_revision_uploaded" : "concept_uploaded",
        payload: {
          conceptId: concept.id,
          conceptNumber: concept.number,
          filePath: upload.path,
          published: true,
          uploadMode,
          deliveredRevisionRequests: deliveredCount,
        },
      });

      await createProjectSystemMessage(tx, {
        projectId,
        fallbackUserId: user.id,
        body: uploadMode === "revision"
          ? `Revision delivered for Concept ${concept.number}.`
          : `Concept ${concept.number} is ready for review.`,
      });

      if (shouldSetConceptsReady && project.status !== PROJECT_STATUS_CONCEPTS_READY) {
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

      return { projectStatus: shouldSetConceptsReady ? PROJECT_STATUS_CONCEPTS_READY : project.status };
    });

    return Response.json({ ok: true, concept, projectStatus: result.projectStatus });
  } catch (error) {
    return toRouteErrorResponse(error);
  }
}
