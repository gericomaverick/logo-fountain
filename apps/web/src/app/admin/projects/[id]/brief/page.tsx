import Link from "next/link";
import { redirect } from "next/navigation";

import { BriefDocument, BriefField, BriefFieldGrid } from "@/components/brief-document";
import { HeaderNav } from "@/components/header-nav";
import { PageShell } from "@/components/page-shell";
import { requireAdmin } from "@/lib/auth/require";
import { parseBriefAnswers, briefSections } from "@/lib/brief";
import { prisma } from "@/lib/prisma";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type AdminProjectBriefPageProps = {
  params: Promise<{ id: string }>;
};

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
              {briefSections.map((section) => (
                <section key={section.id} className="rounded-xl border border-neutral-200 bg-neutral-50/70 p-4">
                  <h3 className="text-sm font-semibold text-neutral-900">{section.title}</h3>
                  <p className="mt-1 text-xs text-neutral-600">{section.description}</p>
                  <div className="mt-3 grid gap-3">
                    {section.fields.map((field) => (
                      <BriefField key={field.key} label={field.label} value={parsedAnswers[field.key]} compact />
                    ))}
                  </div>
                </section>
              ))}
            </BriefFieldGrid>
          </BriefDocument>
        )}
      </main>
    </PageShell>
  );
}
