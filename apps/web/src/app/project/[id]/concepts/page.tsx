"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

import { HeaderNav } from "@/components/header-nav";
import { PageShell } from "@/components/page-shell";
import { EmptyLine, PageHeader } from "@/components/ui";

type Concept = {
  id: string;
  number: number;
  revisionVersion: number;
  status: string;
  notes: string | null;
  imageUrl: string | null;
};

function formatConceptStatus(status: string) {
  return status
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function getConceptStatusBadgeClass(status: string) {
  const normalized = status.toLowerCase();

  if (normalized === "approved") return "bg-success-soft text-success";
  if (normalized === "published") return "bg-surface-2 text-fg-2";
  if (normalized === "deleted" || normalized === "archived") return "bg-surface-2 text-fg-3";

  return "bg-warning-soft text-warning";
}

function readError(payload: { error?: { message?: string; details?: { nextStep?: string } } | string } | null, fallback: string): string {
  const err = payload?.error;
  const message = typeof err === "string" ? err : err?.message ?? fallback;
  const nextStep = typeof err === "string" ? undefined : err?.details?.nextStep;
  return nextStep ? `${message} — ${nextStep}` : message;
}

export default function ProjectConceptsPage() {
  const params = useParams<{ id: string }>();
  const projectId = params.id;
  const [concepts, setConcepts] = useState<Concept[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;

    const load = async () => {
      try {
        const [conceptRes] = await Promise.all([
          fetch(`/api/projects/${projectId}/concepts`, { cache: "no-store" }),
          fetch(`/api/projects/${projectId}/read-state`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ area: "concepts" }),
          }),
        ]);

        const payload = await conceptRes.json().catch(() => null);
        if (!conceptRes.ok) throw new Error(readError(payload, "Failed to load concepts"));
        if (!cancelled) {
          setConcepts((payload?.concepts ?? []) as Concept[]);
          setError(null);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load concepts");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  return (
    <PageShell>
      <HeaderNav />
      <PageHeader
        crumbs={[{ label: "Projects", href: "/dashboard" }, { label: "Project", href: `/project/${projectId}` }, { label: "Concepts" }]}
        actions={<Link className="portal-btn-ghost" href={`/project/${projectId}/messages`}>Project messages</Link>}
      />
      <main className="mx-auto w-full max-w-[1400px] px-4 md:px-8 lg:px-10">
        <div className="pt-8 pb-5">
          <h1 className="text-3xl font-semibold tracking-tight text-fg">Concepts gallery</h1>
          <p className="mt-2 text-base text-fg-2">Project {projectId}</p>
        </div>

        {loading ? <p className="text-sm text-fg-3">Loading…</p> : null}
        {error ? <p className="text-sm text-danger">{error}</p> : null}

        <section className="mb-8 rounded-xl border border-line bg-panel">
          <div className="flex h-11 items-center gap-2 rounded-t-xl border-b border-line bg-surface px-4 text-sm font-semibold text-fg">
            Concepts <span className="font-normal text-fg-3">{concepts.length}</span>
          </div>
          {concepts.map((concept) => {
            const notesPreview = concept.notes
              ? concept.notes
                  .trim()
                  .replace(/\s+/g, " ")
                  .slice(0, 140)
              : null;

            const showEllipsis = Boolean(concept.notes && concept.notes.trim().replace(/\s+/g, " ").length > 140);

            return (
              <Link
                key={concept.id}
                href={`/project/${projectId}/concept/${concept.id}`}
                className="flex items-center gap-4 border-b border-line p-4 transition-colors last:rounded-b-xl last:border-b-0 hover:bg-surface"
              >
                {concept.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={concept.imageUrl} alt={`Concept ${concept.number}`} className="h-20 w-24 shrink-0 rounded-lg object-cover sm:h-24 sm:w-36" />
                ) : (
                  <div className="flex h-20 w-24 shrink-0 items-center justify-center rounded-lg bg-surface text-sm text-fg-3 sm:h-24 sm:w-36">No preview</div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-base font-medium text-fg">Concept #{concept.number} · v{concept.revisionVersion}</p>
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${getConceptStatusBadgeClass(concept.status)}`}>
                      {formatConceptStatus(concept.status)}
                    </span>
                  </div>
                  {notesPreview ? (
                    <p className="mt-2 text-sm text-fg-2">
                      {notesPreview}
                      {showEllipsis ? "…" : null}
                    </p>
                  ) : null}
                </div>
              </Link>
            );
          })}
          {!loading && concepts.length === 0 ? <EmptyLine>No concepts published yet.</EmptyLine> : null}
        </section>
      </main>
    </PageShell>
  );
}
