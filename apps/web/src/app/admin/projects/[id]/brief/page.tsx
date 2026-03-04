import Link from "next/link";
import { redirect } from "next/navigation";

import { BriefDocument, BriefField, BriefFieldGrid } from "@/components/brief-document";
import { HeaderNav } from "@/components/header-nav";
import { PageShell } from "@/components/page-shell";
import { requireAdmin } from "@/lib/auth/require";
import { prisma } from "@/lib/prisma";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type AdminProjectBriefPageProps = {
  params: Promise<{ id: string }>;
};

type BriefAnswers = {
  brandName: string;
  industry: string;
  description: string;
  styleNotes: string;
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

function dateLabel(value: Date): string {
  return value.toLocaleString();
}

export default async function AdminProjectBriefPage({ params }: AdminProjectBriefPageProps) {
  const { id: projectId } = await params;

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");
  await requireAdmin(user);

  const brief = await prisma.projectBrief.findFirst({
    where: { projectId },
    orderBy: { version: "desc" },
    select: { id: true, version: true, answers: true, createdAt: true },
  });

  const parsedAnswers = parseBriefAnswers(brief?.answers);

  return (
    <PageShell>
      <HeaderNav />
      <main className="mx-auto w-full max-w-[1160px] px-6 py-8 md:px-10">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">Project brief</h1>
            <p className="mt-1 text-sm text-neutral-600">Project {projectId}</p>
          </div>
          <div className="flex gap-4 text-sm">
            <Link className="portal-link no-underline" href={`/admin/projects/${projectId}`}>Back to overview</Link>
            <Link className="portal-link no-underline" href={`/admin/projects/${projectId}/messages`}>Messages</Link>
          </div>
        </div>

        {!brief || !parsedAnswers ? (
          <div className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
            <p className="text-sm text-neutral-700">No brief submitted yet.</p>
            <p className="mt-1 text-sm text-neutral-600">Ask the client to submit their brief from their dashboard.</p>
          </div>
        ) : (
          <BriefDocument
            title={`Latest submitted brief (v${brief.version})`}
            subtitle="Read the same structured brief document view the client sees, while keeping admin controls separate."
            meta={<span>Submitted {dateLabel(brief.createdAt)}</span>}
          >
            <BriefFieldGrid>
              <BriefField label="Brand name" value={parsedAnswers.brandName} />
              <BriefField label="Industry" value={parsedAnswers.industry} />
              <BriefField label="Brand description" value={parsedAnswers.description} />
              <BriefField label="Style notes" value={parsedAnswers.styleNotes} />
            </BriefFieldGrid>
          </BriefDocument>
        )}
      </main>
    </PageShell>
  );
}
