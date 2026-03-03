import Link from "next/link";

import { HeaderNav } from "@/components/header-nav";
import { PROJECT_STATE_LABELS, type ProjectState } from "@/lib/project-state-machine";
import { prisma } from "@/lib/prisma";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type DashboardProject = {
  id: string;
  status: ProjectState;
  packageCode: string;
  createdAt: Date;
  updatedAt: Date;
  concepts: Array<{ id: string; status: string; number: number }>;
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
  if (project.status === "AWAITING_BRIEF") {
    return {
      href: `/project/${project.id}/brief`,
      label: "Submit brief",
    };
  }

  if (project.status === "CONCEPTS_READY") {
    const firstPublishedConcept = project.concepts.find((concept) => concept.status === "published");
    return {
      href: firstPublishedConcept ? `/project/${project.id}/concept/${firstPublishedConcept.id}` : `/project/${project.id}`,
      label: "View concepts",
    };
  }

  if (project.status === "ON_HOLD") {
    return {
      href: `/project/${project.id}/messages`,
      label: "View messages",
    };
  }

  return {
    href: `/project/${project.id}`,
    label: "View project",
  };
}

function formatProjectDate(project: DashboardProject) {
  const updated = project.updatedAt.toISOString() !== project.createdAt.toISOString();
  if (updated) return `Updated ${DATE_FORMATTER.format(project.updatedAt)}`;
  return `Created ${DATE_FORMATTER.format(project.createdAt)}`;
}

function ProjectCard({ project }: { project: DashboardProject }) {
  const cta = getPrimaryCta(project);
  const statusLabel = PROJECT_STATE_LABELS[project.status] ?? project.status;
  const statusNote = getStatusNote(project.status);

  return (
    <article className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <span className="inline-flex rounded-full border border-neutral-300 bg-neutral-50 px-2.5 py-1 text-xs font-medium uppercase tracking-wide text-neutral-700">
            {statusLabel}
          </span>
          <h3 className="mt-3 text-base font-semibold text-neutral-900">Project {project.id.slice(0, 8)}</h3>
          <p className="mt-1 text-sm text-neutral-600">Package: {project.packageCode}</p>
          <p className="mt-1 text-xs text-neutral-500">{formatProjectDate(project)}</p>
        </div>

        <div className="flex flex-col gap-2 sm:items-end">
          <Link className="inline-flex rounded-lg bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white" href={cta.href}>
            {cta.label}
          </Link>
          <Link className="text-sm text-neutral-700 underline" href={`/project/${project.id}/messages`}>
            Messages
          </Link>
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
        <p className="rounded-xl border border-dashed border-neutral-300 bg-neutral-50 p-4 text-sm text-neutral-600">No projects in this section.</p>
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
      <>
        <HeaderNav />
        <main className="mx-auto max-w-3xl p-8">
          <h1 className="text-2xl font-semibold">Dashboard</h1>
          <p className="mt-2 text-sm text-neutral-600">
            You need to <Link className="underline" href="/login">sign in</Link> to view your projects.
          </p>
        </main>
      </>
    );
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
            },
            orderBy: { createdAt: "desc" },
          },
        },
      },
    },
  });

  const projects = memberships.flatMap((membership) => membership.client.projects) as DashboardProject[];

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
    <>
      <HeaderNav />
      <main className="mx-auto max-w-5xl px-6 py-8">
        <h1 className="text-3xl font-semibold text-neutral-900">Dashboard</h1>
        {profile?.firstName ? <p className="mt-2 text-sm text-neutral-700">Welcome back, {profile.firstName}</p> : null}

        {projects.length === 0 ? (
          <p className="mt-6 rounded-xl border border-dashed border-neutral-300 bg-neutral-50 p-4 text-sm text-neutral-600">No projects yet.</p>
        ) : (
          <>
            <DashboardSection section="needs-action" projects={sectioned["needs-action"]} />
            <DashboardSection section="in-progress" projects={sectioned["in-progress"]} />
            <DashboardSection section="delivered" projects={sectioned.delivered} />
          </>
        )}
      </main>
    </>
  );
}
