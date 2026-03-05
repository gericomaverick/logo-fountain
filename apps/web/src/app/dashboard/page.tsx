import Link from "next/link";
import { redirect } from "next/navigation";

import { HeaderNav } from "@/components/header-nav";
import { PageShell } from "@/components/page-shell";
import { isAdminUser } from "@/lib/auth/admin";
import { ProjectStatusBadge } from "@/components/project-status-badge";
import { type ProjectState } from "@/lib/project-state-machine";
import { prisma } from "@/lib/prisma";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { deriveDisplayProjectStatus, deriveOverviewBadgeStatus } from "@/lib/project-status";

type DashboardProject = {
  id: string;
  status: ProjectState;
  packageCode: string;
  createdAt: Date;
  updatedAt: Date;
  concepts: Array<{ id: string; status: string; number: number }>;
  fileAssets?: Array<{ id: string }>;
  hasNewMessages?: boolean;
  hasNewConcepts?: boolean;
};

type DashboardSectionKey = "needs-action" | "in-progress" | "delivered";

type ProjectCta = {
  href: string;
  label: string;
};

const DATE_FORMATTER = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

const NEEDS_ACTION_STATES: ProjectState[] = ["AWAITING_BRIEF", "CONCEPTS_READY", "ON_HOLD"];
const DELIVERED_STATES: ProjectState[] = ["DELIVERED", "CANCELLED", "REFUNDED"];

function getSectionKey(status: ProjectState): DashboardSectionKey {
  if (NEEDS_ACTION_STATES.includes(status)) return "needs-action";
  if (DELIVERED_STATES.includes(status)) return "delivered";
  return "in-progress";
}

function getSectionMeta(section: DashboardSectionKey) {
  if (section === "needs-action") {
    return {
      title: "Needs action",
      description: "Projects waiting on your input: submit briefs, review concepts, or resolve blocked items.",
    };
  }

  if (section === "in-progress") {
    return {
      title: "In progress",
      description: "Projects currently moving through design and production.",
    };
  }

  return {
    title: "Delivered",
    description: "Completed or closed projects.",
  };
}

function getStatusNote(status: ProjectState) {
  if (status === "BRIEF_SUBMITTED") return "Waiting for designer — your brief is in and concept work is starting.";
  if (status === "IN_DESIGN") return "Waiting for designer — concepts are in production.";
  if (status === "REVISIONS_IN_PROGRESS") return "Waiting for designer — revisions are in progress.";
  if (status === "AWAITING_APPROVAL") return "No action needed right now — we’re preparing final delivery.";
  if (status === "FINAL_FILES_READY") return "Final files are ready to review and download.";
  if (status === "ON_HOLD") return "This project is blocked. Check messages for the next required step.";
  return null;
}

function getPrimaryCta(project: DashboardProject): ProjectCta {
  // Always route through the project overview so clients don’t bypass the hub.
  return {
    href: `/project/${project.id}`,
    label: "Open project",
  };
}

function formatProjectDate(project: DashboardProject) {
  const updated = project.updatedAt.toISOString() !== project.createdAt.toISOString();
  if (updated) return `Updated ${DATE_FORMATTER.format(project.updatedAt)}`;
  return `Created ${DATE_FORMATTER.format(project.createdAt)}`;
}

function ProjectCard({ project }: { project: DashboardProject }) {
  const cta = getPrimaryCta(project);
  const statusNote = getStatusNote(project.status);
  const overviewStatus = deriveOverviewBadgeStatus({
    persistedStatus: project.status,
    hasApprovedConcept: project.concepts.some((concept) => concept.status === "approved"),
    hasFinalDeliverable: (project.fileAssets?.length ?? 0) > 0,
  });

  return (
    <article className="mt-3 portal-card">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <ProjectStatusBadge status={overviewStatus} />
            {project.hasNewConcepts ? <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800">New concepts</span> : null}
            {project.hasNewMessages ? <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900">New message</span> : null}
          </div>
          <h3 className="mt-3 text-base font-semibold text-neutral-900">Project {project.id.slice(0, 8)}</h3>
          <p className="mt-1 text-sm text-neutral-600">Package: {project.packageCode}</p>
          <p className="mt-1 text-xs text-neutral-500">{formatProjectDate(project)}</p>
        </div>

        <div className="flex flex-col gap-2 sm:items-end">
          <Link className="portal-btn-primary" href={cta.href}>
            {cta.label}
          </Link>
          <div className="flex gap-3">
            <Link className="portal-link no-underline" href={`/project/${project.id}/brief`}>
              Brief
            </Link>
            <Link className="portal-link no-underline" href={`/project/${project.id}/messages`}>
              Messages
            </Link>
          </div>
        </div>
      </div>

      {statusNote ? <p className="mt-4 rounded-lg bg-neutral-50 px-3 py-2 text-sm text-neutral-700">{statusNote}</p> : null}
    </article>
  );
}

function DashboardSection({ section, projects }: { section: DashboardSectionKey; projects: DashboardProject[] }) {
  const meta = getSectionMeta(section);

  return (
    <section className="mt-10">
      <div className="mb-4">
        <h2 className="text-xl font-semibold text-neutral-900">{meta.title}</h2>
        <p className="mt-1 text-sm text-neutral-600">{meta.description}</p>
      </div>

      {projects.length === 0 ? (
        <p className="rounded-xl border border-neutral-200 bg-white p-4 text-sm text-neutral-600">No projects in this section.</p>
      ) : (
        <div className="space-y-4">
          {projects.map((project) => (
            <ProjectCard key={project.id} project={project} />
          ))}
        </div>
      )}
    </section>
  );
}

export default async function DashboardPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <PageShell>
        <HeaderNav />
        <main className="mx-auto w-full max-w-[1160px] px-6 py-8 md:px-10">
          <h1 className="text-2xl font-semibold">Dashboard</h1>
          <p className="mt-2 text-sm text-neutral-600">
            You need to <Link className="portal-link no-underline" href="/login">sign in</Link> to view your projects.
          </p>
        </main>
      </PageShell>
    );
  }

  if (await isAdminUser(user)) {
    redirect("/admin");
  }

  const profile = await prisma.profile.findUnique({
    where: { id: user.id },
    select: { firstName: true },
  });

  const memberships = await prisma.clientMembership.findMany({
    where: { userId: user.id },
    include: {
      client: {
        include: {
          projects: {
            select: {
              id: true,
              status: true,
              packageCode: true,
              createdAt: true,
              updatedAt: true,
              concepts: {
                select: { id: true, status: true, number: true },
                orderBy: { number: "asc" },
              },
              fileAssets: {
                where: { kind: "final_zip" },
                select: { id: true },
                take: 1,
              },
            },
            orderBy: { createdAt: "desc" },
          },
        },
      },
    },
  });

  const projectsRaw = memberships.flatMap((membership) => membership.client.projects) as DashboardProject[];
  const projectIds = projectsRaw.map((p) => p.id);

  const [readStates, latestMessages, latestConcepts] = await Promise.all([
    prisma.projectReadState.findMany({
      where: { userId: user.id, projectId: { in: projectIds } },
      select: { projectId: true, lastSeenMessagesAt: true, lastSeenConceptsAt: true },
    }),
    prisma.message.groupBy({
      by: ["projectId"],
      where: { projectId: { in: projectIds } },
      _max: { createdAt: true },
    }),
    prisma.concept.groupBy({
      by: ["projectId"],
      where: { projectId: { in: projectIds }, status: { in: ["published", "approved"] } },
      _max: { createdAt: true, updatedAt: true },
    }),
  ]);

  const readStateByProject = new Map(readStates.map((r) => [r.projectId, r]));
  const latestMessageByProject = new Map(latestMessages.map((row) => [row.projectId, row._max.createdAt ?? null]));
  const latestConceptByProject = new Map(
    latestConcepts.map((row) => {
      const latest = row._max.updatedAt && row._max.createdAt
        ? (row._max.updatedAt > row._max.createdAt ? row._max.updatedAt : row._max.createdAt)
        : (row._max.updatedAt ?? row._max.createdAt ?? null);
      return [row.projectId, latest];
    }),
  );

  const normalizedFirstName = profile?.firstName?.trim()
    ? `${profile.firstName.trim().slice(0, 1).toUpperCase()}${profile.firstName.trim().slice(1)}`
    : null;
  const greeting = normalizedFirstName ? `Hey, ${normalizedFirstName}` : "Hey there";

  const projects = projectsRaw.map((p) => {
    const rs = readStateByProject.get(p.id);
    const latestMessageAt = latestMessageByProject.get(p.id) ?? null;
    const latestConceptAt = latestConceptByProject.get(p.id) ?? null;

    const hasNewMessages = Boolean(latestMessageAt && (!rs?.lastSeenMessagesAt || latestMessageAt > rs.lastSeenMessagesAt));
    const hasNewConcepts = Boolean(latestConceptAt && (!rs?.lastSeenConceptsAt || latestConceptAt > rs.lastSeenConceptsAt));

    const effectiveStatus = deriveDisplayProjectStatus({
      persistedStatus: p.status,
      hasApprovedConcept: p.concepts.some((concept) => concept.status === "approved"),
      hasFinalDeliverable: (p.fileAssets?.length ?? 0) > 0,
    }) as ProjectState;

    return { ...p, status: effectiveStatus, hasNewMessages, hasNewConcepts };
  });

  const sectioned: Record<DashboardSectionKey, DashboardProject[]> = {
    "needs-action": [],
    "in-progress": [],
    delivered: [],
  };

  for (const project of projects) {
    const section = getSectionKey(project.status);
    sectioned[section].push(project);
  }

  return (
    <PageShell>
      <HeaderNav />
      <main className="mx-auto w-full max-w-[1160px] px-6 py-8 md:px-10">
        <h1 className="portal-page-title">{greeting}</h1>

        {projects.length === 0 ? (
          <p className="mt-6 rounded-xl border border-neutral-200 bg-white p-4 text-sm text-neutral-600">No projects yet.</p>
        ) : (
          <>
            <DashboardSection section="needs-action" projects={sectioned["needs-action"]} />
            <DashboardSection section="in-progress" projects={sectioned["in-progress"]} />
            <DashboardSection section="delivered" projects={sectioned.delivered} />
          </>
        )}
      </main>
    </PageShell>
  );
}
