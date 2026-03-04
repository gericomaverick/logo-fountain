import Link from "next/link";
import { redirect } from "next/navigation";

import { HeaderNav } from "@/components/header-nav";
import { PageShell } from "@/components/page-shell";
import { prisma } from "@/lib/prisma";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import { BriefForm } from "./brief-form";

type ProjectBriefPageProps = {
  params: Promise<{ id: string }>;
};

type BriefAnswers = {
  brandName: string;
  industry: string;
  description: string;
  styleNotes: string;
};

type ParsedBrief = {
  id: string;
  version: number;
  createdAt: string;
  answers: BriefAnswers;
};

function parseBriefAnswers(value: unknown): BriefAnswers | null {
  if (typeof value !== "object" || value === null) return null;
  const raw = value as Record<string, unknown>;

  if (
    typeof raw.brandName !== "string" ||
    typeof raw.industry !== "string" ||
    typeof raw.description !== "string" ||
    typeof raw.styleNotes !== "string"
  ) {
    return null;
  }

  return {
    brandName: raw.brandName,
    industry: raw.industry,
    description: raw.description,
    styleNotes: raw.styleNotes,
  };
}

export default async function ProjectBriefPage({ params }: ProjectBriefPageProps) {
  const { id } = await params;

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

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
        <main className="mx-auto w-full max-w-[1160px] px-6 py-8 md:px-10">
          <h1 className="text-2xl font-semibold">Project brief</h1>
          <p className="mt-2 text-sm text-neutral-600">Project not found.</p>
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
      <main className="mx-auto w-full max-w-[1160px] px-6 py-8 md:px-10">
        <p className="text-sm"><Link href={`/project/${project.id}`} className="portal-link no-underline">← Back to project overview</Link></p>

        <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">Project brief</h1>
            <p className="mt-2 text-sm text-neutral-600">
              Review your brief history and resubmit updates when priorities shift.
            </p>
            <p className="mt-1 text-xs text-neutral-500">Current status: {project.status}</p>
          </div>
        </div>

        <BriefForm projectId={project.id} briefVersions={briefVersions} />
      </main>
    </PageShell>
  );
}
