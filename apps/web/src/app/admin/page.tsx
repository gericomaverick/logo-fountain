import Link from "next/link";

import { HeaderNav } from "@/components/header-nav";
import { Card, PageShell, SubCard } from "@/components/page-shell";
import { ProjectStatusBadge } from "@/components/project-status-badge";
import { deriveProjectBadgeState, type AdminSectionKey } from "@/lib/admin-dashboard";
import { computeLatestConceptActivityAt } from "@/lib/concept-activity";
import { prisma } from "@/lib/prisma";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/require";

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

function AdminSection({
  title,
  description,
  projects,
}: {
  title: string;
  description: string;
  projects: AdminProjectRow[];
}) {
  return (
    <section className="mt-8">
      <div className="mb-4">
        <h2 className="text-xl font-semibold text-neutral-900">{title}</h2>
        <p className="mt-1 text-sm text-neutral-600">{description}</p>
      </div>

      {projects.length === 0 ? (
        <SubCard>
          <p className="text-sm text-neutral-600">No projects in this section.</p>
        </SubCard>
      ) : (
        <div className="space-y-4">
          {projects.map((project) => {
            const latestOrder = project.orders[0] ?? null;
            const stuckReason = getStuckReason(latestOrder);
            const primaryClientContact = project.client ? getPrimaryClientContact(project.client.memberships) : null;
            const clientName = project.client?.name ?? "Unknown client";
            const clientRecordMissing = !project.client;
            const needsFeedback = project.pendingFeedbackCount > 0;
            const overviewStatus = project.hasApprovedConcept ? "APPROVED" : project.status;

            return (
              <Card key={project.id} className="mt-0">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <ProjectStatusBadge status={overviewStatus} />
                    <h3 className="mt-3 text-base font-semibold text-neutral-900">Project {project.id.slice(0, 8)}</h3>
                    <p className="mt-1 text-sm text-neutral-600">
                      Client: {clientName}
                      {clientRecordMissing ? <span className="text-amber-700"> (record missing)</span> : null}
                    </p>
                    {clientRecordMissing ? (
                      <p className="text-sm text-amber-700">Client row was deleted after this project was created.</p>
                    ) : null}
                    {primaryClientContact ? (
                      <p className="text-sm text-neutral-600">
                        Contact: {primaryClientContact.name} <span className="text-neutral-500">({primaryClientContact.email})</span>
                      </p>
                    ) : null}
                    <p className="text-sm text-neutral-600">Package: {project.packageCode}</p>
                  </div>

                  <div className="flex flex-col gap-2 sm:items-end">
                    {needsFeedback ? (
                      <Link className="portal-btn-primary" href={`/admin/projects/${project.id}/concepts#pending-feedback`}>
                        Resolve pending feedback
                      </Link>
                    ) : (
                      <Link className="portal-btn-primary" href={`/admin/projects/${project.id}`}>
                        Open project
                      </Link>
                    )}
                    <div className="flex flex-wrap gap-2 sm:justify-end">
                      {project.hasNewMessages ? <span className="inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900">New messages</span> : null}
                      {project.pendingFeedbackCount > 0 ? <span className="inline-flex rounded-full bg-rose-100 px-2 py-0.5 text-xs font-semibold text-rose-900">Pending feedback ({project.pendingFeedbackCount})</span> : null}
                      {project.hasNewConcepts ? <span className="inline-flex rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-900">New concepts</span> : null}
                    </div>
                    <div className="flex flex-wrap gap-3 text-sm text-neutral-700">
                      <Link className="portal-link no-underline" href={`/admin/projects/${project.id}/messages`}>
                        Project messages
                      </Link>
                      <Link className="portal-link no-underline" href={`/admin/projects/${project.id}/concepts`}>
                        Concept threads
                      </Link>
                    </div>
                  </div>
                </div>

                {stuckReason ? <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">⚠ {stuckReason}</p> : null}
              </Card>
            );
          })}
        </div>
      )}
    </section>
  );
}

export default async function AdminHomePage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

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
    },
    orderBy: { createdAt: "desc" },
  });

  const [latestMessages, latestConcepts, latestConceptComments] = await Promise.all([
    prisma.message.groupBy({ by: ["projectId"], _max: { createdAt: true } }),
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

    return {
      ...p,
      pendingFeedbackCount: p.revisionRequests.length,
      latestMessageAt,
      hasNewMessages,
      latestConceptAt,
      hasNewConcepts,
      hasApprovedConcept: p.concepts.length > 0,
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

  return (
    <PageShell>
      <HeaderNav />
      <main className="mx-auto w-full max-w-[1160px] px-6 py-8 md:px-10">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="portal-page-title">Admin dashboard</h1>
          <Link className="portal-link no-underline" href="/admin/health">Health checks</Link>
        </div>

        <AdminSection {...getSectionMeta("needs-action")} projects={sectioned["needs-action"]} />
        <AdminSection {...getSectionMeta("in-progress")} projects={sectioned["in-progress"]} />
        <AdminSection {...getSectionMeta("delivered")} projects={sectioned.delivered} />
      </main>
    </PageShell>
  );
}
