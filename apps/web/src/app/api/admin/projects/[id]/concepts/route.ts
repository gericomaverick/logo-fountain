import { conceptUploadDigest, findConceptUploadRequest, UploadReplayMismatch } from "@/lib/concept-upload-request";
import { randomUUID } from "node:crypto";
import { prepareConceptImage, UploadValidationError } from "@/lib/upload-validation";
import { jsonError } from "@/lib/api-error";
import { prisma } from "@/lib/prisma";
import { createSignedConceptAssetUrl, deleteStoredFiles, uploadConceptAsset } from "@/lib/supabase/storage";
import { logAudit } from "@/lib/audit";
import { applyTransition } from "@/lib/project-state-machine";
import { requireAdmin, requireUser, toRouteErrorResponse } from "@/lib/auth/require";
import { createProjectSystemMessage } from "@/lib/system-messages";
import { notifyClientConceptReady } from "@/lib/project-lifecycle-email";
import { ConceptEntitlementError, consumeConceptEntitlement } from "@/lib/concept-entitlement";

class SafeConceptPublicationAbort extends Error {}

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
    const [project, concepts, pendingRevisionCounts, pendingRevisionRequests] = await Promise.all([
      prisma.project.findUnique({ where: { id: projectId }, select: { status: true } }),
      prisma.concept.findMany({
        where: { projectId },
        orderBy: [{ number: "asc" }, { createdAt: "asc" }],
        select: { id: true, number: true, status: true, notes: true, createdAt: true },
      }),
      prisma.revisionRequest.groupBy({
        by: ["conceptId"],
        where: { projectId, status: { not: "delivered" } },
        _count: { _all: true },
      }),
      prisma.revisionRequest.findMany({
        where: { projectId, status: { not: "delivered" } },
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          conceptId: true,
          body: true,
          createdAt: true,
          concept: { select: { id: true, number: true } },
          user: { select: { email: true, firstName: true, lastName: true } },
        },
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

    const conceptlessPendingCount = pendingRevisionCounts
      .filter((entry) => !entry.conceptId)
      .reduce((sum, entry) => sum + entry._count._all, 0);

    const conceptsWithMeta = await Promise.all(
      concepts.map(async (concept) => {
        const file = fileByConceptId.get(concept.id);
        const version = versionByConceptId.get(concept.id) ?? 0;
        return {
          id: concept.id,
          number: concept.number,
          status: concept.status,
          notes: concept.notes,
          revisionVersion: Math.max(version, 1),
          imageUrl: file ? await createSignedConceptAssetUrl(file.path) : null,
          pendingRevisionCount: pendingByConceptId.get(concept.id) ?? 0,
          unresolvedFeedbackCount: pendingByConceptId.get(concept.id) ?? 0,
        };
      }),
    );

    return Response.json({
      concepts: conceptsWithMeta,
      projectStatus: project?.status ?? null,
      conceptlessPendingRevisionCount: conceptlessPendingCount,
      pendingRevisionRequests: pendingRevisionRequests.map((request) => ({
        id: request.id,
        conceptId: request.conceptId,
        body: request.body,
        createdAt: request.createdAt,
        concept: request.concept,
        user: {
          email: request.user.email,
          fullName: [request.user.firstName, request.user.lastName].filter(Boolean).join(" ").trim() || null,
        },
      })),
    });
  } catch (error) {
    return toRouteErrorResponse(error);
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    await requireAdmin(user);
    const { id: projectId } = await params;

    const formData = await req.formData();
    const fileEntry = formData.get("file");
    const requestedConceptNumber = parseConceptNumber(formData.get("conceptNumber"));
    const conceptIdRaw = formData.get("conceptId");
    const requestedConceptId = typeof conceptIdRaw === "string" && conceptIdRaw.trim() ? conceptIdRaw : null;
    const notes = parseNotes(formData.get("notes"));
    const assetNotes = parseNotes(formData.get("assetNotes"));
    const uploadMode = parseUploadMode(formData.get("uploadMode"));

    if (!(fileEntry instanceof File) || fileEntry.size <= 0) return jsonError("Image file is required", 400, { nextStep: "Upload an image file." }, "FILE_REQUIRED");

    const requestKey = formData.get("requestKey");
    if (typeof requestKey !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestKey)) return jsonError("A stable UUID v4 requestKey is required", 400, undefined, "REQUEST_KEY_REQUIRED");
    const prepared = await prepareConceptImage(fileEntry);
    const digest = conceptUploadDigest([projectId, uploadMode, requestedConceptId, requestedConceptNumber, notes, assetNotes, prepared.contentType], prepared.bytes);
    const replay = await findConceptUploadRequest(prisma, projectId, requestKey, digest);
    if (replay) return Response.json({ ok: true, ...replay as object, replayed: true });

    const project = await prisma.project.findUnique({ where: { id: projectId }, select: { id: true, status: true, updatedAt: true } });
    if (!project) return jsonError("Project not found", 404, { nextStep: "Check the project link." }, "PROJECT_NOT_FOUND");

    const allowedStatuses = uploadMode === "revision"
      ? ["REVISIONS_IN_PROGRESS", "CONCEPTS_READY"]
      : ["BRIEF_SUBMITTED", "IN_DESIGN", "CONCEPTS_READY"];
    if (!allowedStatuses.includes(project.status)) return jsonError("Project state does not allow publication", 409, undefined, "INVALID_PROJECT_STATUS_TRANSITION");

    let existingConcept: { id: string; number: number; status: string; notes: string | null } | null = null;
    let conceptId = requestedConceptId;
    let conceptNumber: number;

    if (uploadMode === "revision") {
      if (!requestedConceptId) return jsonError("conceptId is required for revision uploads", 400, undefined, "CONCEPT_ID_REQUIRED");
      existingConcept = await prisma.concept.findFirst({ where: { id: requestedConceptId, projectId }, select: { id: true, number: true, status: true, notes: true } });
      if (!existingConcept) return jsonError("Concept not found", 404, undefined, "CONCEPT_NOT_FOUND");
      if (existingConcept.status !== "published") return jsonError("Only a published concept can receive a revision", 409, undefined, "CONCEPT_NOT_REVISIONABLE");
      conceptNumber = existingConcept.number;
    } else if (uploadMode === "replace") {
      if (!requestedConceptNumber) return jsonError("Valid conceptNumber is required for replace uploads", 400, undefined, "INVALID_CONCEPT_NUMBER");
      existingConcept = await prisma.concept.findUnique({ where: { projectId_number: { projectId, number: requestedConceptNumber } }, select: { id: true, number: true, status: true, notes: true } });
      if (!existingConcept) return jsonError("Concept not found", 404, undefined, "CONCEPT_NOT_FOUND");
      if (!['draft', 'published'].includes(existingConcept.status)) return jsonError("Approved or archived concepts cannot be replaced", 409, undefined, "CONCEPT_NOT_REPLACEABLE");
      conceptId = existingConcept.id;
      conceptNumber = existingConcept.number;
    } else {
      const latest = await prisma.concept.aggregate({ where: { projectId }, _max: { number: true } });
      conceptNumber = Math.max((latest._max.number ?? 0) + 1, 1);
      conceptId = crypto.randomUUID();
    }

    if (!conceptId) throw new Error("CONCEPT_ID_REQUIRED");
    if (uploadMode === "concept" || (uploadMode === "replace" && existingConcept?.status === "draft")) {
      const entitlement = await prisma.projectEntitlement.findFirst({ where: { projectId, key: "concepts" } });
      if (!entitlement) throw new ConceptEntitlementError("CONCEPTS_ENTITLEMENT_MISSING");
      if (entitlement.limitInt !== null && entitlement.consumedInt + entitlement.reservedInt >= entitlement.limitInt) throw new ConceptEntitlementError("CONCEPT_ENTITLEMENT_EXHAUSTED");
    }
    if (uploadMode === "revision") {
      const pending = await prisma.revisionRequest.count({ where: { projectId, conceptId, status: { not: "delivered" } } });
      if (!pending) throw new SafeConceptPublicationAbort("NO_PENDING_REVISION_REQUESTS");
      const entitlement = await prisma.projectEntitlement.findFirst({ where: { projectId, key: "revisions" } });
      if (!entitlement) throw new SafeConceptPublicationAbort("REVISIONS_ENTITLEMENT_MISSING");
      if (entitlement.reservedInt < pending) throw new SafeConceptPublicationAbort("INSUFFICIENT_REVISION_RESERVATION");
      if (entitlement.limitInt !== null && entitlement.consumedInt + pending > entitlement.limitInt) throw new SafeConceptPublicationAbort("REVISION_LIMIT_EXCEEDED");
    }
    const existingFiles = await prisma.fileAsset.findMany({
      where: { projectId, kind: "concept", OR: [{ path: { startsWith: `${projectId}/${conceptId}/v` } }, { path: { startsWith: `${projectId}/${conceptId}.` } }] },
      select: { path: true },
    });
    let maxVersion = 0;
    for (const file of existingFiles) {
      const match = file.path.match(/\/v(\d+)\./);
      maxVersion = Math.max(maxVersion, match?.[1] ? Number.parseInt(match[1], 10) : 1);
    }
    // Revision stays parseable by existing readers; every attempt, including
    // replacement/retry, gets a distinct key even when no metadata committed.
    const bucketPath = `${projectId}/${conceptId}/v${maxVersion + 1}.${randomUUID()}.${prepared.extension}`;
    const upload = await uploadConceptAsset({ bucketPath, upload: prepared, upsert: false });

    let result;
    try {
      result = await prisma.$transaction(async (tx) => {
        // Serialize equal logical requests, including concurrent submissions. The
        // project-version fence also serializes different keys against lifecycle.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${projectId + ":" + requestKey}, 0))`;
        const receipt = await findConceptUploadRequest(tx, projectId, requestKey, digest);
        if (receipt) return receipt as unknown as { concept: { id: string; number: number; status: string; notes: string | null }; projectStatus: string };

        const guard = await tx.project.updateMany({
          where: { id: projectId, status: project.status, updatedAt: project.updatedAt },
          data: { updatedAt: new Date() },
        });
        if (guard.count !== 1) throw new SafeConceptPublicationAbort("CONCEPT_PUBLICATION_CONFLICT");
        const currentProject = await tx.project.findUnique({ where: { id: projectId }, select: { status: true } });
        if (!currentProject) throw new SafeConceptPublicationAbort("PROJECT_NOT_FOUND");
        const allowedStatuses = uploadMode === "revision"
          ? ["REVISIONS_IN_PROGRESS", "CONCEPTS_READY"]
          : ["BRIEF_SUBMITTED", "IN_DESIGN", "CONCEPTS_READY"];
        if (!allowedStatuses.includes(currentProject.status)) throw new SafeConceptPublicationAbort("INVALID_PROJECT_STATUS_TRANSITION");

        let concept: { id: string; number: number; status: string; notes: string | null };
        let entitlement = null;
        if (uploadMode === "concept") {
          entitlement = await consumeConceptEntitlement(tx, projectId);
          concept = await tx.concept.create({
            data: { id: conceptId, projectId, number: conceptNumber, status: CONCEPT_STATUS_PUBLISHED, notes },
            select: { id: true, number: true, status: true, notes: true },
          });
        } else {
          const current = await tx.concept.findFirst({ where: { id: conceptId, projectId }, select: { id: true, number: true, status: true, notes: true } });
          if (!current) throw new SafeConceptPublicationAbort("CONCEPT_NOT_FOUND");
          if (uploadMode === "replace") {
            if (!['draft', 'published'].includes(current.status)) throw new SafeConceptPublicationAbort("CONCEPT_NOT_REPLACEABLE");
            if (current.status === "draft") entitlement = await consumeConceptEntitlement(tx, projectId);
            const changed = await tx.concept.updateMany({ where: { id: conceptId, projectId, status: current.status }, data: { notes, status: CONCEPT_STATUS_PUBLISHED } });
            if (changed.count !== 1) throw new SafeConceptPublicationAbort("CONCEPT_PUBLICATION_CONFLICT");
            concept = { ...current, notes, status: CONCEPT_STATUS_PUBLISHED };
          } else {
            if (current.status !== "published") throw new SafeConceptPublicationAbort("CONCEPT_NOT_REVISIONABLE");
            concept = current;
          }
        }

        if (entitlement) {
          await logAudit(tx, { projectId, actorId: user.id, type: "entitlement_consumed", payload: { key: "concepts", after: entitlement, reason: "admin_concept_publish", conceptId: concept.id, conceptNumber: concept.number } });
        }

        let deliveredCount = 0;
        if (uploadMode === "revision") {
          const pendingCount = await tx.revisionRequest.count({ where: { projectId, conceptId: concept.id, status: { not: "delivered" } } });
          if (pendingCount <= 0) throw new SafeConceptPublicationAbort("NO_PENDING_REVISION_REQUESTS");
          const revisionsEntitlement = await tx.projectEntitlement.findFirst({ where: { projectId, key: "revisions" }, select: { id: true, limitInt: true, consumedInt: true, reservedInt: true } });
          if (!revisionsEntitlement) throw new SafeConceptPublicationAbort("REVISIONS_ENTITLEMENT_MISSING");
          const consumed = Math.max(revisionsEntitlement.consumedInt ?? 0, 0);
          const reserved = Math.max(revisionsEntitlement.reservedInt ?? 0, 0);
          if (reserved < pendingCount) throw new SafeConceptPublicationAbort("INSUFFICIENT_REVISION_RESERVATION");
          if (revisionsEntitlement.limitInt !== null && consumed + pendingCount > revisionsEntitlement.limitInt) throw new SafeConceptPublicationAbort("REVISION_LIMIT_EXCEEDED");
          const delivered = await tx.revisionRequest.updateMany({ where: { projectId, conceptId: concept.id, status: { not: "delivered" } }, data: { status: "delivered" } });
          deliveredCount = delivered.count;
          await tx.$executeRaw`
            UPDATE "ProjectEntitlement"
            SET "reservedInt" = GREATEST(COALESCE("reservedInt", 0) - ${deliveredCount}, 0),
                "consumedInt" = COALESCE("consumedInt", 0) + ${deliveredCount}, "updatedAt" = NOW()
            WHERE "projectId" = ${projectId}::uuid AND "key" = 'revisions'
          `;
        }

        await tx.fileAsset.create({ data: { projectId, kind: "concept", bucket: upload.bucket, path: upload.path, mime: upload.mime, size: upload.size, notes: assetNotes, uploadedBy: user.id } });
        const otherVisible = await tx.concept.count({ where: { projectId, status: { in: ["published", "approved"] }, id: { not: concept.id } } });
        const shouldSetConceptsReady = uploadMode === "revision" || otherVisible === 0;
        if (shouldSetConceptsReady && currentProject.status !== PROJECT_STATUS_CONCEPTS_READY) {
          const transition = applyTransition(currentProject.status, PROJECT_STATUS_CONCEPTS_READY);
          if (!transition.ok) throw new SafeConceptPublicationAbort("INVALID_PROJECT_STATUS_TRANSITION");
          await tx.project.update({ where: { id: projectId }, data: { status: PROJECT_STATUS_CONCEPTS_READY } });
          await logAudit(tx, { projectId, actorId: user.id, type: "state_changed", payload: { previousStatus: currentProject.status, nextStatus: PROJECT_STATUS_CONCEPTS_READY } });
        }

        await logAudit(tx, { projectId, actorId: user.id, type: uploadMode === "revision" ? "concept_revision_uploaded" : "concept_uploaded", payload: { conceptId: concept.id, conceptNumber: concept.number, filePath: upload.path, published: true, uploadMode, deliveredRevisionRequests: deliveredCount } });
        await createProjectSystemMessage(tx, { projectId, fallbackUserId: user.id, body: uploadMode === "revision" ? `Revision delivered for Concept ${concept.number}.` : `Concept ${concept.number} is ready for review.` });
        const result = { concept, projectStatus: shouldSetConceptsReady ? PROJECT_STATUS_CONCEPTS_READY : currentProject.status };
        await logAudit(tx, { projectId, actorId: user.id, type: "concept_upload_request", payload: { requestKey, digest, result, object: { bucket: upload.bucket, path: upload.path } } });
        return result;
    }, { isolationLevel: "Serializable", maxWait: 2_000, timeout: 5_000 });

    } catch (error) {
      // A timeout can follow commit. An absent immediate read never proves
      // rollback. Retain bytes and keep the same request key on every retry.
      const recovered = await findConceptUploadRequest(prisma, projectId, requestKey, digest).catch(error => { if (error instanceof UploadReplayMismatch) throw error; return null; });
      if (recovered) return Response.json({ ok: true, ...recovered as object, recovered: true });
      if (error instanceof UploadReplayMismatch) throw error;
      if (error instanceof SafeConceptPublicationAbort || error instanceof ConceptEntitlementError) {
        // These are explicit callback aborts, not inferred DB rollbacks.
        const cleanup = await deleteStoredFiles([{ bucket: upload.bucket, path: upload.path }]).catch(() => null);
        if (!cleanup || cleanup.deleted !== 1) return jsonError("Publication aborted; new object retained after cleanup failure", 500,
          { requestKey, uploadedObjectRetained: true, uploadedObject: { bucket: upload.bucket, path: upload.path } }, "CONCEPT_UPLOAD_CLEANUP_FAILED");
        throw error;
      }
      return jsonError("Publication outcome is unconfirmed; retry with the same requestKey", 409,
        { requestKey, uploadedObjectRetained: true, uploadedObject: { bucket: upload.bucket, path: upload.path } }, "CONCEPT_PUBLICATION_UNCONFIRMED");
    }
    // Notification failure cannot turn a committed publication into a retryable
    // creation error. The durable receipt remains the source of truth.
    let notificationWarning: string | undefined;
    if (uploadMode !== "revision") await notifyClientConceptReady(projectId, result.concept.id).catch(() => { notificationWarning = "Publication committed; concept-ready notification failed. Do not republish to retry email."; });
    return Response.json({ ok: true, concept: result.concept, projectStatus: result.projectStatus, ...(notificationWarning ? { notificationWarning, committed: true } : {}) });
  } catch (error) {
    if (error instanceof UploadReplayMismatch) return jsonError(error.message, 409, undefined, "REQUEST_KEY_MISMATCH");
    if (error instanceof UploadValidationError) return jsonError(error.message, 400, undefined, error.code);
    if (error instanceof ConceptEntitlementError) {
      const missing = error.code === "CONCEPTS_ENTITLEMENT_MISSING";
      return jsonError(missing ? "Concept entitlement not configured" : "Concept entitlement exhausted", 400, { nextStep: "Set an appropriate concept entitlement with an audited override before publishing." }, error.code);
    }
    const known: Record<string, [string, string]> = {
      NO_PENDING_REVISION_REQUESTS: ["No pending revision request found for this concept", "NO_PENDING_REVISION_REQUESTS"],
      REVISIONS_ENTITLEMENT_MISSING: ["Revisions entitlement not configured", "REVISIONS_ENTITLEMENT_MISSING"],
      INSUFFICIENT_REVISION_RESERVATION: ["Revision upload exceeds reserved revisions", "INSUFFICIENT_REVISION_RESERVATION"],
      REVISION_LIMIT_EXCEEDED: ["Revision upload exceeds revision entitlement", "REVISION_LIMIT_EXCEEDED"],
      CONCEPT_PUBLICATION_CONFLICT: ["Concept publication changed concurrently; refresh before retrying", "CONCEPT_PUBLICATION_CONFLICT"],
      CONCEPT_NOT_REPLACEABLE: ["Concept can no longer be replaced", "CONCEPT_NOT_REPLACEABLE"],
      CONCEPT_NOT_REVISIONABLE: ["Concept can no longer receive a revision", "CONCEPT_NOT_REVISIONABLE"],
      INVALID_PROJECT_STATUS_TRANSITION: ["Project state does not allow this publication", "INVALID_PROJECT_STATUS_TRANSITION"],
    };
    if (error instanceof Error && known[error.message]) {
      const [message, code] = known[error.message];
      return jsonError(message, code === "CONCEPT_PUBLICATION_CONFLICT" ? 409 : 400, undefined, code);
    }
    const prismaCode = typeof error === "object" && error !== null && "code" in error ? (error as { code?: string }).code : undefined;
    if (prismaCode === "P2034" || prismaCode === "P2028" || prismaCode === "P2002") return jsonError("Concept publication changed concurrently; refresh before retrying", 409, undefined, "CONCEPT_PUBLICATION_CONFLICT");
    return toRouteErrorResponse(error);
  }
}
