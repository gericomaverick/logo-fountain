import { redirect } from "next/navigation";

import { HeaderNav } from "@/components/header-nav";
import { PageHeader } from "@/components/ui";
import { ProjectStatusBadge } from "@/components/project-status-badge";
import { PageShell } from "@/components/page-shell";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth/current-user";
import { parseBriefAnswers, type BriefAnswers } from "@/lib/brief";

import { BriefForm } from "./brief-form";

type ProjectBriefPageProps = {
  params: Promise<{ id: string }>;
};

type ParsedBrief = {
  id: string;
  version: number;
  createdAt: string;
  answers: BriefAnswers;
};

export default async function ProjectBriefPage({ params }: ProjectBriefPageProps) {
  const { id } = await params;

  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  const project = await prisma.project.findFirst({
    where: {
      id,
      client: {
        memberships: {
          some: {
            userId: user.id,
          },
        },
      },
    },
    select: {
      id: true,
      status: true,
      briefs: {
        orderBy: { version: "desc" },
        take: 8,
        select: { id: true, version: true, answers: true, createdAt: true },
      },
    },
  });

  if (!project) {
    return (
      <PageShell>
        <HeaderNav />
        <PageHeader crumbs={[{ label: "Projects", href: "/dashboard" }, { label: "Project overview", href: `/project/${id}` }, { label: "Brief" }]} />
        <main className="px-4 py-6 md:px-8 lg:py-8">
          <div className="mx-auto max-w-[920px]">
            <h1 className="portal-display text-2xl text-fg">Project brief</h1>
            <p className="mt-2 text-base text-fg-2">Project not found.</p>
          </div>
        </main>
      </PageShell>
    );
  }

  const briefVersions: ParsedBrief[] = project.briefs
    .map((record) => {
      const parsedAnswers = parseBriefAnswers(record.answers);
      if (!parsedAnswers) return null;
      return {
        id: record.id,
        version: record.version,
        createdAt: record.createdAt.toISOString(),
        answers: parsedAnswers,
      };
    })
    .filter((brief): brief is ParsedBrief => Boolean(brief));

  return (
    <PageShell>
      <HeaderNav />
      <PageHeader crumbs={[{ label: "Projects", href: "/dashboard" }, { label: "Project overview", href: `/project/${project.id}` }, { label: "Brief" }]} />
      <main className="px-4 py-6 md:px-8 lg:py-8">
        <div className="mx-auto max-w-[920px]">
          {/* The page's own header, set apart so it does not read as the first
              thing in the form. */}
          <header className="border-b border-line pb-4 sm:pb-6">
            <ProjectStatusBadge status={project.status} />
            <h1 className="mt-4 portal-display text-2xl text-fg">Project brief</h1>
          </header>

          <div className="mt-6 sm:mt-8">
            <BriefForm projectId={project.id} briefVersions={briefVersions} />
          </div>
        </div>
      </main>
    </PageShell>
  );
}
