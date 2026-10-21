import Link from "next/link";
import { redirect } from "next/navigation";

import { BriefDocument, BriefField, BriefFieldGrid, BriefSection } from "@/components/brief-document";
import { HeaderNav } from "@/components/header-nav";
import { PageHeader } from "@/components/ui";
import { PageShell } from "@/components/page-shell";
import { requireAdmin } from "@/lib/auth/require";
import { parseBriefAnswers, briefSections } from "@/lib/brief";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth/current-user";

type AdminProjectBriefPageProps = {
  params: Promise<{ id: string }>;
};

function dateLabel(value: Date): string {
  return value.toLocaleString();
}

export default async function AdminProjectBriefPage({ params }: AdminProjectBriefPageProps) {
  const { id: projectId } = await params;

  const user = await getCurrentUser();

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
      <PageHeader
        crumbs={[{ label: "Projects", href: "/admin" }, { label: "Project overview", href: `/admin/projects/${projectId}` }, { label: "Brief" }]}
        actions={<Link className="portal-btn-ghost" href={`/admin/projects/${projectId}/messages`}>Project messages</Link>}
      />
      <main className="px-4 py-6 md:px-8 lg:py-8">
        <div className="mx-auto max-w-[920px]">
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="portal-display text-2xl text-fg">Project brief</h1>
              <p className="mt-1 text-sm text-fg-2">Project {projectId}</p>
            </div>
          </div>

          {!brief || !parsedAnswers ? (
            <div className="rounded-xl border border-line bg-surface p-6">
              <p className="text-sm text-fg-2">No brief submitted yet.</p>
              <p className="mt-1 text-sm text-fg-2">Ask the client to submit their brief from their dashboard.</p>
            </div>
          ) : (
            <BriefDocument
              title={`Latest submitted brief (v${brief.version})`}
              subtitle="Structured for quick admin scanning: clear sections, stronger question/answer hierarchy, and easier long-form reading."
              meta={<span>Submitted {dateLabel(brief.createdAt)}</span>}
            >
              <div className="mb-2 rounded-xl border border-line bg-surface px-4 py-3">
                <p className="text-sm font-semibold text-fg-2">At a glance</p>
                <p className="mt-1 text-sm text-fg-2">{briefSections.length} sections · {briefSections.reduce((total, section) => total + section.fields.length, 0)} answers</p>
              </div>

              <BriefFieldGrid className="gap-5">
                {briefSections.map((section) => (
                  <BriefSection key={section.id} title={section.title} description={section.description} tone="paper">
                    <div className="flex flex-col">
                      {section.fields.map((field) => (
                        <BriefField
                          key={field.key}
                          label={field.label}
                          value={parsedAnswers[field.key]}
                          compact
                          valueClassName="text-base leading-7"
                        />
                      ))}
                    </div>
                  </BriefSection>
                ))}
              </BriefFieldGrid>
            </BriefDocument>
          )}
        </div>
      </main>
    </PageShell>
  );
}
