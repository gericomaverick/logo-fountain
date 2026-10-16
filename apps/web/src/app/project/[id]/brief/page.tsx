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
          <div className="mx-auto max-w-[720px]">
            <h1 className="text-3xl font-semibold tracking-tight text-fg">Project brief</h1>
            <p className="mt-2 text-sm text-fg-2">Project not found.</p>
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
        <div className="mx-auto max-w-[720px]">
          <div className="mb-8">
            <div>
              <h1 className="text-3xl font-semibold tracking-tight text-fg">Project brief</h1>
              <p className="mt-2 text-sm text-fg-2">
                Submit your brief once. After submission, the brief is locked and view-only.
              </p>
              <div className="mt-3"><ProjectStatusBadge status={project.status} /></div>
            </div>
          </div>

          <BriefForm projectId={project.id} briefVersions={briefVersions} />
        </div>
      </main>
    </PageShell>
  );
}
