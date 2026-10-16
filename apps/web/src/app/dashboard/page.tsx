import Link from "next/link";
import { redirect } from "next/navigation";

import { HeaderNav } from "@/components/header-nav";
import { CheckIcon, ChevronRightIcon } from "@/components/icons";
import { PageShell } from "@/components/page-shell";
import { EmptyLine, PageHeader } from "@/components/ui";
import { isAdminUser } from "@/lib/auth/admin";
import { ProjectStatusBadge } from "@/components/project-status-badge";
import { type ProjectState } from "@/lib/project-state-machine";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth/current-user";
import { deriveDisplayProjectStatus, deriveOverviewBadgeStatus } from "@/lib/project-status";
import { extractBrandNameFromBriefAnswers, getProjectDisplayTitle } from "@/lib/project-display-name";
import { NON_SYSTEM_MESSAGE_FILTER } from "@/lib/message-kind";

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
  latestBrief?: { answers: unknown } | null;
};

type DashboardSectionKey = "needs-action" | "in-progress" | "delivered";

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

function formatProjectDate(project: DashboardProject) {
  const updated = project.updatedAt.toISOString() !== project.createdAt.toISOString();
  if (updated) return `Updated ${DATE_FORMATTER.format(project.updatedAt)}`;
  return `Created ${DATE_FORMATTER.format(project.createdAt)}`;
}

const PACKAGE_LABELS: Record<string, string> = { essential: "Essential", professional: "Professional", complete: "Complete" };

function ProjectRow({ project }: { project: DashboardProject }) {
  const statusNote = getStatusNote(project.status);
  const overviewStatus = deriveOverviewBadgeStatus({
    persistedStatus: project.status,
    hasApprovedConcept: project.concepts.some((concept) => concept.status === "approved"),
    hasFinalDeliverable: (project.fileAssets?.length ?? 0) > 0,
  });
  const brandName = extractBrandNameFromBriefAnswers(project.latestBrief?.answers);
  const projectTitle = getProjectDisplayTitle({ projectId: project.id, brandName, audience: "client" });

  return (
    <li>
      {/* Always through the project overview, so clients don't bypass the hub. */}
      <Link
        href={`/project/${project.id}`}
        className="group flex items-center gap-4 border-b border-line px-4 py-4 transition-colors hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--focus)] md:px-5"
      >
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="truncate text-lg font-semibold tracking-tight text-fg">{projectTitle}</span>
            {project.hasNewConcepts ? <span className="rounded-full bg-success-soft px-2 py-0.5 text-xs font-semibold text-success">New concepts</span> : null}
            {project.hasNewMessages ? <span className="rounded-full bg-accent-soft px-2 py-0.5 text-xs font-semibold text-accent">New message</span> : null}
          </span>
          {statusNote ? (
            <span className={`mt-1 block text-base ${project.status === "FINAL_FILES_READY" ? "font-medium text-success" : "text-fg-2"}`}>{statusNote}</span>
          ) : null}
          <span className="mt-1 block text-sm text-fg-3">
            {PACKAGE_LABELS[project.packageCode] ?? project.packageCode} · {formatProjectDate(project)}
          </span>
        </span>
        <span className="hidden shrink-0 sm:block">
          <ProjectStatusBadge status={overviewStatus} />
        </span>
        <ChevronRightIcon size={18} className="shrink-0 text-fg-3 transition-transform group-hover:translate-x-0.5" />
      </Link>
    </li>
  );
}

function DashboardSection({ section, projects }: { section: DashboardSectionKey; projects: DashboardProject[] }) {
  const meta = getSectionMeta(section);

  // A client sees only the groups they have projects in; an empty "needs
  // action" is good news, so it says so.
  if (projects.length === 0 && section !== "needs-action") return null;

  return (
    <section aria-label={meta.title}>
      <div className="flex h-11 items-center gap-2.5 border-b border-line bg-surface px-4 md:px-5" title={meta.description}>
        <h2 className="text-sm font-semibold text-fg">{meta.title}</h2>
        <span className="text-sm text-fg-3">{projects.length}</span>
        <span className="hidden truncate text-sm text-fg-3 lg:inline">· {meta.description}</span>
      </div>
      {projects.length === 0 ? (
        <p className="flex items-center gap-2 border-b border-line px-4 py-4 text-base text-fg-2 md:px-5">
          <CheckIcon size={16} className="text-success" />
          Nothing needs you right now.
        </p>
      ) : (
        <ul>
          {projects.map((project) => (
            <ProjectRow key={project.id} project={project} />
          ))}
        </ul>
      )}
    </section>
  );
}

export default async function DashboardPage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
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
                orderBy: [{ createdAt: "desc" }, { id: "desc" }],
                select: { id: true },
                take: 1,
              },
              briefs: {
                orderBy: { version: "desc" },
                take: 1,
                select: { answers: true },
              },
            },
            orderBy: { createdAt: "desc" },
          },
        },
      },
    },
  });

  const projectsRaw = memberships.flatMap((membership) => membership.client.projects).map((project) => ({
    ...project,
    latestBrief: project.briefs[0] ?? null,
  })) as DashboardProject[];
  const projectIds = projectsRaw.map((p) => p.id);

  const [readStates, latestMessages, latestConcepts] = await Promise.all([
    prisma.projectReadState.findMany({
      where: { userId: user.id, projectId: { in: projectIds } },
      select: { projectId: true, lastSeenMessagesAt: true, lastSeenConceptsAt: true },
    }),
    prisma.message.groupBy({
      by: ["projectId"],
      where: { projectId: { in: projectIds }, ...NON_SYSTEM_MESSAGE_FILTER },
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

  const waiting = sectioned["needs-action"].length;

  return (
    <PageShell>
      <HeaderNav />
      <PageHeader crumbs={[{ label: "Projects" }]} />
      <main className="mx-auto w-full max-w-[1400px] px-4 pb-10 md:px-8 lg:px-10">
        <div className="pb-5 pt-8">
          <h1 className="text-3xl font-semibold tracking-tight text-fg">{greeting}</h1>
          <p className="mt-1 text-base text-fg-2">
            {projects.length === 0
              ? "Your projects will appear here."
              : waiting > 0
                ? `${waiting} project${waiting === 1 ? " needs" : "s need"} your input.`
                : "Nothing needs your input right now."}
          </p>
        </div>

        {projects.length === 0 ? (
          <EmptyLine>No projects yet.</EmptyLine>
        ) : (
          <div className="rounded-xl border border-line bg-panel [&>section:first-of-type>div]:rounded-t-xl [&>section:last-of-type_li:last-child>a]:rounded-b-xl [&>section:last-of-type_li:last-child>a]:border-b-0 [&>section:last-of-type>p]:rounded-b-xl [&>section:last-of-type>p]:border-b-0">
            <DashboardSection section="needs-action" projects={sectioned["needs-action"]} />
            <DashboardSection section="in-progress" projects={sectioned["in-progress"]} />
            <DashboardSection section="delivered" projects={sectioned.delivered} />
          </div>
        )}
      </main>
    </PageShell>
  );
}
