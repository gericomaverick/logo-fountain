import { buildTimeline, type ProjectState, PROJECT_STATES, PROJECT_STATE_LABELS, PRIMARY_CTA_BY_STATE } from "@/lib/project-state-machine";
import { prisma } from "@/lib/prisma";
import { createSignedConceptAssetUrl, createSignedFinalDeliverableUrl } from "@/lib/supabase/storage";

const PUBLISHED_OR_APPROVED = ["published", "approved"];

type SnapshotArgs = {
  projectId: string;
};

function asIso(value: Date | null | undefined): string | undefined {
  return value ? value.toISOString() : undefined;
}

async function fetchAuditStateTimestamps(projectId: string): Promise<Partial<Record<ProjectState, string>>> {
  const rows = await prisma.auditEvent.findMany({
    where: { projectId, type: "state_changed" },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: { payload: true, createdAt: true },
  });

  const map: Partial<Record<ProjectState, string>> = {};
  for (const row of rows) {
    const payload = row.payload as { nextStatus?: unknown } | null;
    const nextStatus = typeof payload?.nextStatus === "string" ? payload.nextStatus : null;

    if (nextStatus && (PROJECT_STATES as readonly string[]).includes(nextStatus) && !map[nextStatus as ProjectState]) {
      map[nextStatus as ProjectState] = row.createdAt.toISOString();
    }
  }

  return map;
}

export async function getProjectSnapshot({ projectId }: SnapshotArgs) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      id: true,
      status: true,
      packageCode: true,
      createdAt: true,
      entitlements: {
        where: { key: { in: ["concepts", "revisions"] } },
        select: { key: true, limitInt: true, consumedInt: true },
      },
      concepts: {
        where: { status: { in: PUBLISHED_OR_APPROVED } },
        orderBy: [{ number: "desc" }, { createdAt: "desc" }],
        select: { id: true, number: true, status: true, notes: true, createdAt: true, updatedAt: true },
      },
      revisionRequests: {
        orderBy: [{ createdAt: "desc" }],
        take: 10,
        select: {
          id: true,
          status: true,
          body: true,
          createdAt: true,
          updatedAt: true,
          concept: { select: { id: true, number: true } },
          user: { select: { id: true, email: true, fullName: true } },
        },
      },
      messages: {
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        select: {
          id: true,
          body: true,
          createdAt: true,
          sender: { select: { id: true, email: true, fullName: true } },
        },
      },
      fileAssets: {
        where: { kind: { in: ["concept", "final_zip"] } },
        orderBy: [{ createdAt: "desc" }],
        select: { kind: true, path: true, createdAt: true },
      },
      _count: {
        select: { auditEvents: true },
      },
    },
  });

  if (!project) return null;

  const entitlements = { concepts: 0, revisions: 0 };
  for (const entitlement of project.entitlements) {
    const remaining = Math.max((entitlement.limitInt ?? 0) - entitlement.consumedInt, 0);
    if (entitlement.key === "concepts") entitlements.concepts = remaining;
    if (entitlement.key === "revisions") entitlements.revisions = remaining;
  }

  const conceptFiles = new Map<string, string>();
  for (const file of project.fileAssets) {
    if (file.kind !== "concept") continue;
    const fileName = file.path.split("/").pop() ?? "";
    const conceptId = fileName.split(".")[0];
    if (conceptId && !conceptFiles.has(conceptId)) conceptFiles.set(conceptId, file.path);
  }

  const concepts = await Promise.all(project.concepts.map(async (concept) => ({
    id: concept.id,
    number: concept.number,
    status: concept.status,
    notes: concept.notes,
    createdAt: concept.createdAt,
    imageUrl: conceptFiles.get(concept.id)
      ? await createSignedConceptAssetUrl(conceptFiles.get(concept.id) as string)
      : null,
  })));

  const finalAsset = project.fileAssets.find((f) => f.kind === "final_zip");
  const finalZip = finalAsset
    ? {
        available: true,
        url: await createSignedFinalDeliverableUrl(finalAsset.path),
      }
    : { available: false, url: null };

  const inferredTimestamps: Partial<Record<ProjectState, string>> = {
    AWAITING_BRIEF: asIso(project.createdAt),
  };

  const conceptReadyAt = project.concepts.length > 0
    ? asIso(project.concepts.reduce((min, c) => (c.createdAt < min ? c.createdAt : min), project.concepts[0].createdAt))
    : undefined;

  if (conceptReadyAt) inferredTimestamps.CONCEPTS_READY = conceptReadyAt;

  const revisionRequestedAt = project.revisionRequests.find((r) => r.status === "requested")?.createdAt;
  if (revisionRequestedAt) inferredTimestamps.REVISIONS_IN_PROGRESS = asIso(revisionRequestedAt);

  const revisionDeliveredAt = project.revisionRequests.find((r) => r.status === "delivered")?.updatedAt;
  if (revisionDeliveredAt) inferredTimestamps.CONCEPTS_READY ??= asIso(revisionDeliveredAt);

  const approvedConcept = project.concepts.find((c) => c.status === "approved");
  if (approvedConcept) inferredTimestamps.AWAITING_APPROVAL = asIso(approvedConcept.updatedAt);

  if (finalAsset?.createdAt) inferredTimestamps.FINAL_FILES_READY = asIso(finalAsset.createdAt);

  const auditTimestamps = await fetchAuditStateTimestamps(project.id);
  const timestamps = { ...inferredTimestamps, ...auditTimestamps };

  return {
    projectId: project.id,
    status: project.status,
    statusLabel: PROJECT_STATE_LABELS[project.status as ProjectState] ?? project.status,
    primaryCta: PRIMARY_CTA_BY_STATE[project.status as ProjectState] ?? null,
    timeline: buildTimeline(project.status, timestamps),
    packageCode: project.packageCode,
    entitlements,
    concepts,
    latestConcepts: concepts.slice(0, 5),
    revisionRequests: project.revisionRequests,
    latestRevisionRequests: project.revisionRequests.slice(0, 5),
    messages: project.messages,
    finalZip,
    recentAuditEventsCount: project._count.auditEvents,
  };
}
