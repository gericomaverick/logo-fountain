import Link from "next/link";

import { HeaderNav } from "@/components/header-nav";
import { ActivityIcon, AlertIcon, ImageIcon, MessageIcon } from "@/components/icons";
import { PageShell } from "@/components/page-shell";
import { getProjectStatusLabel, StatusIcon } from "@/components/project-status-badge";
import { PageHeader, relativeTime } from "@/components/ui";
import { deriveProjectBadgeState, type AdminSectionKey } from "@/lib/admin-dashboard";
import { computeLatestConceptActivityAt } from "@/lib/concept-activity";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth/current-user";
import { requireAdmin } from "@/lib/auth/require";
import { deriveDisplayProjectStatus, deriveOverviewBadgeStatus } from "@/lib/project-status";
import { extractBrandNameFromBriefAnswers, getProjectDisplayTitle } from "@/lib/project-display-name";
import { NON_SYSTEM_MESSAGE_FILTER } from "@/lib/message-kind";

export const dynamic = "force-dynamic";

type AdminProjectRow = {
  id: string;
  status: string;
  packageCode: string;
  createdAt: Date;
  updatedAt: Date;
  client: {
    name: string | null;
    memberships: Array<{
      role: string;
      user: {
        firstName: string | null;
        lastName: string | null;
        email: string;
      };
    }>;
  } | null;
  orders: Array<{ status: string; stripeCheckoutSessionId: string | null }>;
  pendingFeedbackCount: number;
  latestMessageAt: Date | null;
  hasNewMessages: boolean;
  latestConceptAt: Date | null;
  hasNewConcepts: boolean;
  hasApprovedConcept: boolean;
  hasFinalDeliverable: boolean;
  latestBrief?: { answers: unknown } | null;
};

function getSectionMeta(section: AdminSectionKey) {
  if (section === "needs-action") {
    return {
      title: "Needs action",
      description: "Projects that likely need admin intervention or client nudges.",
    };
  }

  if (section === "in-progress") {
    return {
      title: "In progress",
      description: "Active projects moving through design, revisions, or production.",
    };
  }

  return {
    title: "Delivered",
    description: "Completed or closed work.",
  };
}

function getStuckReason(order: { status: string; stripeCheckoutSessionId: string | null } | null): string | null {
  if (!order) return "Missing order record (webhook likely never fulfilled).";
  if (order.status === "NEEDS_CONTACT") return "Order needs contact (no purchaser email provisioned).";
  if (order.status !== "FULFILLED") return `Order status is ${order.status}.`;
  return null;
}

function getPrimaryClientContact(
  memberships?: Array<{
    role: string;
    user: { firstName: string | null; lastName: string | null; email: string };
  }> | null,
) {
  if (!memberships || memberships.length === 0) return null;
  const owner = memberships.find((membership) => membership.role.toLowerCase() === "owner");
  const primary = owner ?? memberships[0];

  if (!primary) return null;

  const fullName = [primary.user.firstName, primary.user.lastName].filter(Boolean).join(" ").trim();

  return {
    name: fullName || primary.user.email,
    email: primary.user.email,
  };
}

function computeActionPriority(project: AdminProjectRow): number {
  let score = 0;
  score += project.pendingFeedbackCount * 100;
  if (project.hasNewMessages) score += 60;
  if (project.hasNewConcepts) score += 20;
  const stuckReason = getStuckReason(project.orders[0] ?? null);
  if (stuckReason) score += 50;
  return score;
}

function compareByUrgency(a: AdminProjectRow, b: AdminProjectRow): number {
  const scoreDiff = computeActionPriority(b) - computeActionPriority(a);
  if (scoreDiff !== 0) return scoreDiff;

  const aLatest = Math.max(a.updatedAt.getTime(), a.latestMessageAt?.getTime() ?? 0, a.latestConceptAt?.getTime() ?? 0);
  const bLatest = Math.max(b.updatedAt.getTime(), b.latestMessageAt?.getTime() ?? 0, b.latestConceptAt?.getTime() ?? 0);
  return bLatest - aLatest;
}

function latestActivityAt(project: AdminProjectRow): Date {
  return new Date(Math.max(project.updatedAt.getTime(), project.latestMessageAt?.getTime() ?? 0, project.latestConceptAt?.getTime() ?? 0));
}

const PACKAGE_LABELS: Record<string, string> = { essential: "Essential", professional: "Professional", complete: "Complete" };

function AdminSection({
  title,
  description,
  projects,
  now,
}: {
  title: string;
  description: string;
  projects: AdminProjectRow[];
  now: Date;
}) {
  return (
    <section aria-label={title}>
      <div className="sticky top-12 z-[5] flex h-9 items-center gap-2 border-b border-line bg-surface px-4 md:px-6" title={description}>
        <h2 className="text-[13px] font-medium text-fg">{title}</h2>
        <span className="text-[13px] text-fg-3">{projects.length}</span>
        <span className="hidden truncate text-[12px] text-fg-3 lg:inline">· {description}</span>
      </div>

      {projects.length === 0 ? (
        <p className="border-b border-line px-4 py-3 text-[13px] text-fg-3 md:px-6">No projects in this section.</p>
      ) : (
        <ul>
          {projects.map((project) => {
            const latestOrder = project.orders[0] ?? null;
            const stuckReason = getStuckReason(latestOrder);
            const primaryClientContact = project.client ? getPrimaryClientContact(project.client.memberships) : null;
            const clientName = project.client?.name ?? "Unknown client";
            const clientRecordMissing = !project.client;
            const needsFeedback = project.pendingFeedbackCount > 0;
            const overviewStatus = deriveOverviewBadgeStatus({
              persistedStatus: project.status,
              hasApprovedConcept: project.hasApprovedConcept,
              hasFinalDeliverable: project.hasFinalDeliverable,
            });

            const brandName = extractBrandNameFromBriefAnswers(project.latestBrief?.answers);
            const projectTitle = getProjectDisplayTitle({ projectId: project.id, brandName, audience: "admin" });
            const activity = latestActivityAt(project);
            const href = needsFeedback ? `/admin/projects/${project.id}/concepts#pending-feedback` : `/admin/projects/${project.id}`;

            return (
              <li key={project.id} className="group relative flex min-h-11 items-center gap-3 border-b border-line px-4 py-2 transition-colors hover:bg-surface md:px-6">
                {/* The whole row opens the project; the small links sit above it. */}
                <Link href={href} className="absolute inset-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--focus)]" aria-label={needsFeedback ? `Resolve pending feedback: ${projectTitle}` : `Open ${projectTitle}`} />
                <span title={getProjectStatusLabel(overviewStatus)}>
                  <StatusIcon status={overviewStatus} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="flex min-w-0 items-center gap-2 text-[13px]">
                    <span className="truncate font-medium text-fg">{projectTitle}</span>
                    <span className="hidden shrink-0 text-fg-3 sm:inline">{getProjectStatusLabel(overviewStatus)}</span>
                  </p>
                  <p className="truncate text-[12px] text-fg-3">
                    {clientName}
                    {clientRecordMissing ? <span className="text-warning"> · client record missing (deleted after the project was created)</span> : null}
                    {primaryClientContact ? <> · {primaryClientContact.name === primaryClientContact.email ? primaryClientContact.email : `${primaryClientContact.name} (${primaryClientContact.email})`}</> : null}
                  </p>
                  {stuckReason ? (
                    <p className="mt-0.5 flex items-center gap-1 text-[12px] text-danger">
                      <AlertIcon size={12} />
                      {stuckReason}
                    </p>
                  ) : null}
                </div>

                <div className="flex shrink-0 items-center gap-1.5">
                  {needsFeedback ? (
                    <span className="inline-flex h-5 items-center rounded-full bg-warning-soft px-2 text-[11px] font-medium text-warning">
                      {project.pendingFeedbackCount} feedback
                    </span>
                  ) : null}
                  {project.hasNewMessages ? (
                    <span className="inline-flex h-5 items-center gap-1 rounded-full bg-accent-soft px-2 text-[11px] font-medium text-accent">
                      <MessageIcon size={11} />
                      New
                    </span>
                  ) : null}
                  {project.hasNewConcepts ? (
                    <span className="inline-flex h-5 items-center gap-1 rounded-full bg-success-soft px-2 text-[11px] font-medium text-success">
                      <ImageIcon size={11} />
                      New
                    </span>
                  ) : null}
                </div>

                <div className="relative z-[1] hidden shrink-0 items-center gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100 md:flex">
                  <Link className="portal-btn-ghost h-7 w-7 px-0" href={`/admin/projects/${project.id}/messages`} aria-label="Project messages" title="Project messages">
                    <MessageIcon size={14} />
                  </Link>
                  <Link className="portal-btn-ghost h-7 w-7 px-0" href={`/admin/projects/${project.id}/concepts`} aria-label="Concept threads" title="Concept threads">
                    <ImageIcon size={14} />
                  </Link>
                </div>

                <span className="hidden w-24 shrink-0 text-[12px] text-fg-2 lg:block">{PACKAGE_LABELS[project.packageCode] ?? project.packageCode}</span>
                <time className="w-24 shrink-0 text-right text-[12px] text-fg-3" dateTime={activity.toISOString()} title={activity.toLocaleString("en-GB")}>
                  {relativeTime(activity, now)}
                </time>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

export default async function AdminHomePage() {
  const user = await getCurrentUser();

  if (!user) {
    return (
      <PageShell>
        <HeaderNav />
        <main className="mx-auto w-full max-w-[1160px] px-6 py-8 md:px-10">
          <p className="text-sm text-neutral-700">Unauthorized.</p>
        </main>
      </PageShell>
    );
  }

  await requireAdmin(user);

  const projects = await prisma.project.findMany({
    select: {
      id: true,
      status: true,
      packageCode: true,
      createdAt: true,
      updatedAt: true,
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
                  email: true,
                },
              },
            },
          },
        },
      },
      orders: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { status: true, stripeCheckoutSessionId: true },
      },
      revisionRequests: {
        where: { status: { not: "delivered" } },
        select: { id: true },
      },
      concepts: {
        where: { status: "approved" },
        take: 1,
        select: { id: true },
      },
      fileAssets: {
        where: { kind: "final_zip" },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 1,
        select: { id: true },
      },
      briefs: {
        orderBy: { version: "desc" },
        take: 1,
        select: { answers: true },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  const [latestMessages, latestConcepts, latestConceptComments] = await Promise.all([
    prisma.message.groupBy({ by: ["projectId"], where: NON_SYSTEM_MESSAGE_FILTER, _max: { createdAt: true } }),
    prisma.concept.groupBy({
      by: ["projectId"],
      where: { status: { in: ["published", "approved"] } },
      _max: { createdAt: true, updatedAt: true },
    }),
    prisma.conceptComment.groupBy({ by: ["projectId"], _max: { createdAt: true } }),
  ]);

  const latestMessageByProject = new Map(latestMessages.map((row) => [row.projectId, row._max.createdAt ?? null]));
  const latestConceptByProject = new Map(
    latestConcepts.map((row) => [
      row.projectId,
      computeLatestConceptActivityAt({
        conceptCreatedAt: row._max.createdAt ?? null,
        conceptUpdatedAt: row._max.updatedAt ?? null,
      }),
    ]),
  );
  const latestConceptCommentByProject = new Map(latestConceptComments.map((row) => [row.projectId, row._max.createdAt ?? null]));

  const readStates = await prisma.projectReadState.findMany({
    where: { userId: user.id },
    select: { projectId: true, lastSeenMessagesAt: true, lastSeenConceptsAt: true },
  });
  const lastSeenMessagesByProject = new Map(readStates.map((r) => [r.projectId, r.lastSeenMessagesAt ?? null]));
  const lastSeenConceptsByProject = new Map(readStates.map((r) => [r.projectId, r.lastSeenConceptsAt ?? null]));

  const enriched: AdminProjectRow[] = projects.map((p) => {
    const latestMessageAt = latestMessageByProject.get(p.id) ?? null;
    const lastSeenMessagesAt = lastSeenMessagesByProject.get(p.id) ?? null;
    const hasNewMessages = Boolean(latestMessageAt && (!lastSeenMessagesAt || latestMessageAt > lastSeenMessagesAt));

    const latestConceptAt = computeLatestConceptActivityAt({
      conceptCreatedAt: latestConceptByProject.get(p.id) ?? null,
      conceptUpdatedAt: null,
      latestCommentAt: latestConceptCommentByProject.get(p.id) ?? null,
    });
    const lastSeenConceptsAt = lastSeenConceptsByProject.get(p.id) ?? null;
    const hasNewConcepts = Boolean(latestConceptAt && (!lastSeenConceptsAt || latestConceptAt > lastSeenConceptsAt));

    const hasApprovedConcept = p.concepts.length > 0;
    const hasFinalDeliverable = p.fileAssets.length > 0;

    return {
      ...p,
      status: deriveDisplayProjectStatus({
        persistedStatus: p.status,
        hasApprovedConcept,
        hasFinalDeliverable,
      }),
      pendingFeedbackCount: p.revisionRequests.length,
      latestMessageAt,
      hasNewMessages,
      latestConceptAt,
      hasNewConcepts,
      hasApprovedConcept,
      hasFinalDeliverable,
      latestBrief: p.briefs[0] ?? null,
    };
  });

  const sectioned: Record<AdminSectionKey, AdminProjectRow[]> = {
    "needs-action": [],
    "in-progress": [],
    delivered: [],
  };

  for (const project of enriched) {
    const badgeState = deriveProjectBadgeState({
      status: project.status,
      pendingFeedbackCount: project.pendingFeedbackCount,
      hasNewMessages: project.hasNewMessages,
      hasNewConcepts: project.hasNewConcepts,
    });

    sectioned[badgeState.section].push(project);
  }

  sectioned["needs-action"].sort(compareByUrgency);
  sectioned["in-progress"].sort(compareByUrgency);
  sectioned.delivered.sort(compareByUrgency);

  const now = new Date();
  const active = sectioned["needs-action"].length + sectioned["in-progress"].length;

  return (
    <PageShell>
      <HeaderNav />
      <PageHeader
        crumbs={[{ label: "Queue" }]}
        actions={
          <Link className="portal-btn-ghost" href="/admin/health">
            <ActivityIcon size={14} />
            Health checks
          </Link>
        }
      />
      <main>
        <div className="flex items-end justify-between gap-4 px-4 pb-4 pt-6 md:px-6">
          <div>
            <h1 className="text-[20px] font-semibold tracking-tight text-fg">Queue</h1>
            <p className="mt-0.5 text-[13px] text-fg-2">
              {active} active · {sectioned["needs-action"].length} need{sectioned["needs-action"].length === 1 ? "s" : ""} action
            </p>
          </div>
        </div>
        <div className="border-t border-line">
          <AdminSection {...getSectionMeta("needs-action")} projects={sectioned["needs-action"]} now={now} />
          <AdminSection {...getSectionMeta("in-progress")} projects={sectioned["in-progress"]} now={now} />
          <AdminSection {...getSectionMeta("delivered")} projects={sectioned.delivered} now={now} />
        </div>
      </main>
    </PageShell>
  );
}
