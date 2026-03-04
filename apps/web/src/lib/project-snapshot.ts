import { buildTimeline, type ProjectState, PROJECT_STATES, PROJECT_STATE_LABELS, PRIMARY_CTA_BY_STATE } from "@/lib/project-state-machine";
import { prisma } from "@/lib/prisma";
import { createSignedConceptAssetUrl, createSignedFinalDeliverableUrl } from "@/lib/supabase/storage";
import { computeEntitlementUsage } from "@/lib/entitlements";
import { computeLatestConceptActivityAt, maxDate } from "@/lib/concept-activity";
import { parseBriefAnswers } from "@/lib/brief";

const PUBLISHED_OR_APPROVED = ["published", "approved"];

type SnapshotArgs = {
  projectId: string;
  userId?: string;
};

type ClientMembershipContact = {
  role: string;
  user: {
    firstName: string | null;
    lastName: string | null;
    fullName: string | null;
    email: string;
  };
};

function asIso(value: Date | null | undefined): string | undefined {
  return value ? value.toISOString() : undefined;
}

function getPrimaryClientContact(memberships: ClientMembershipContact[]) {
  const owner = memberships.find((membership) => membership.role.toLowerCase() === "owner");
  const primary = owner ?? memberships[0];

  if (!primary) return null;

  const composedName = [primary.user.firstName, primary.user.lastName].filter(Boolean).join(" ").trim();
  const fullName = composedName || primary.user.fullName?.trim() || "";

  return {
    fullName: fullName || null,
    email: primary.user.email,
  };
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

export async function getProjectSnapshot({ projectId, userId }: SnapshotArgs) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      id: true,
      status: true,
      packageCode: true,
      createdAt: true,
      updatedAt: true,
      client: {
        select: {
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
      entitlements: {
        where: { key: { in: ["concepts", "revisions"] } },
        select: { key: true, limitInt: true, consumedInt: true, reservedInt: true },
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
      briefs: {
        orderBy: [{ version: "desc" }],
        take: 1,
        select: { version: true, answers: true, createdAt: true },
      },
      messages: {
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        select: {
          id: true,
          kind: true,
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
      orders: {
        orderBy: [{ createdAt: "desc" }],
        take: 1,
        select: { id: true, status: true, stripeCheckoutSessionId: true, createdAt: true },
      },
      _count: {
        select: { auditEvents: true },
      },
    },
  });

  if (!project) return null;

  const [readState, latestMessageAgg, latestConceptCommentAgg] = await Promise.all([
    userId
      ? prisma.projectReadState.findUnique({
          where: { userId_projectId: { userId, projectId: project.id } },
          select: { lastSeenMessagesAt: true, lastSeenConceptsAt: true },
        })
      : Promise.resolve(null),
    prisma.message.aggregate({ where: { projectId: project.id }, _max: { createdAt: true } }),
    prisma.conceptComment.aggregate({ where: { projectId: project.id }, _max: { createdAt: true } }),
  ]);

  let latestConceptAt: Date | null = null;
  const latestCommentAt = latestConceptCommentAgg._max.createdAt ?? null;
  for (const concept of project.concepts) {
    latestConceptAt = maxDate(
      latestConceptAt,
      computeLatestConceptActivityAt({
        conceptCreatedAt: concept.createdAt,
        conceptUpdatedAt: concept.updatedAt,
        latestCommentAt,
      }),
    );
  }

  const latestMessageAt = latestMessageAgg._max.createdAt ?? null;
  const hasNewMessages = Boolean(latestMessageAt && (!readState?.lastSeenMessagesAt || latestMessageAt > readState.lastSeenMessagesAt));
  const hasNewConcepts = Boolean(latestConceptAt && (!readState?.lastSeenConceptsAt || latestConceptAt > readState.lastSeenConceptsAt));

  const entitlementUsage = computeEntitlementUsage(project.entitlements, project.packageCode);

  const entitlements = {
    concepts: entitlementUsage.concepts.remaining,
    revisions: entitlementUsage.revisions.remaining,
  };

  const conceptFiles = new Map<string, string>();
  const versionByConceptId = new Map<string, number>();

  for (const file of project.fileAssets) {
    if (file.kind !== "concept") continue;

    const parts = file.path.split("/");
    const fileName = parts.at(-1) ?? "";
    const conceptId = parts.length >= 3 ? (parts[1] ?? "") : fileName.split(".")[0];
    if (!conceptId) continue;

    const versionMatch = fileName.match(/^v(\d+)\./);
    const parsedVersion = versionMatch?.[1] ? Number.parseInt(versionMatch[1], 10) : 1;
    const safeVersion = Number.isFinite(parsedVersion) && parsedVersion > 0 ? parsedVersion : 1;
    versionByConceptId.set(conceptId, Math.max(versionByConceptId.get(conceptId) ?? 0, safeVersion));

    // fileAssets are ordered DESC, so first seen is latest.
    if (!conceptFiles.has(conceptId)) conceptFiles.set(conceptId, file.path);
  }

  const concepts = await Promise.all(project.concepts.map(async (concept) => {
    const version = versionByConceptId.get(concept.id) ?? 0;

    return {
      id: concept.id,
      number: concept.number,
      status: concept.status,
      notes: concept.notes,
      createdAt: concept.createdAt,
      updatedAt: concept.updatedAt,
      revisionVersion: Math.max(version, 1),
      imageUrl: conceptFiles.get(concept.id)
        ? await createSignedConceptAssetUrl(conceptFiles.get(concept.id) as string)
        : null,
    };
  }));

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

  const latestOrder = project.orders[0] ?? null;
  const latestBriefRecord = project.briefs[0] ?? null;
  const latestBriefAnswers = parseBriefAnswers(latestBriefRecord?.answers);
  const latestBrief = latestBriefRecord && latestBriefAnswers
    ? {
        version: latestBriefRecord.version,
        createdAt: latestBriefRecord.createdAt.toISOString(),
        answers: latestBriefAnswers,
      }
    : null;

  const stuckReason = !latestOrder
    ? "Missing order record (webhook likely never fulfilled)."
    : latestOrder.status === "NEEDS_CONTACT"
      ? "Order needs contact (no purchaser email provisioned)."
      : latestOrder.status !== "FULFILLED"
        ? `Order status is ${latestOrder.status}.`
        : null;

  const primaryClientContact = getPrimaryClientContact(project.client.memberships);

  return {
    projectId: project.id,
    status: project.status,
    statusLabel: PROJECT_STATE_LABELS[project.status as ProjectState] ?? project.status,
    primaryCta: PRIMARY_CTA_BY_STATE[project.status as ProjectState] ?? null,
    timeline: buildTimeline(project.status, timestamps),
    packageCode: project.packageCode,
    clientContact: primaryClientContact,
    createdAt: project.createdAt.toISOString(),
    updatedAt: project.updatedAt.toISOString(),
    entitlements,
    entitlementUsage,
    concepts,
    latestConcepts: concepts.slice(0, 5),
    revisionRequests: project.revisionRequests,
    latestRevisionRequests: project.revisionRequests.slice(0, 5),
    messages: project.messages,
    latestBrief,
    finalZip,
    latestOrder,
    stuck: Boolean(stuckReason),
    stuckReason,
    recentAuditEventsCount: project._count.auditEvents,
    readState: {
      lastSeenMessagesAt: asIso(readState?.lastSeenMessagesAt),
      lastSeenConceptsAt: asIso(readState?.lastSeenConceptsAt),
    },
    latestMessageAt: asIso(latestMessageAt),
    latestConceptAt: asIso(latestConceptAt),
    hasNewMessages,
    hasNewConcepts,
  };
}
