"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

import { HeaderNav } from "@/components/header-nav";
import { PageShell } from "@/components/page-shell";

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

  if (normalized === "approved") return "bg-emerald-100 text-emerald-800";
  if (normalized === "published") return "bg-blue-100 text-blue-800";
  if (normalized === "deleted" || normalized === "archived") return "bg-neutral-200 text-neutral-700";

  return "bg-amber-100 text-amber-900";
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
      <main className="mx-auto w-full max-w-[1160px] px-6 py-8 md:px-10">
        <div className="mb-4 flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold">Concepts gallery</h1>
            <p className="mt-1 text-sm text-neutral-600">Project {projectId}</p>
          </div>
          <div className="flex gap-4 text-sm">
            <Link className="portal-link no-underline" href={`/project/${projectId}`}>Overview</Link>
            <Link className="portal-link no-underline" href={`/project/${projectId}/messages`}>Messages</Link>
          </div>
        </div>

        {loading ? <p className="text-sm text-neutral-600">Loading…</p> : null}
        {error ? <p className="text-sm text-red-600">{error}</p> : null}

        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
                className="overflow-hidden rounded-xl border border-neutral-200 bg-white transition hover:border-neutral-300"
              >
                {concept.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={concept.imageUrl} alt={`Concept ${concept.number}`} className="h-56 w-full object-cover" />
                ) : (
                  <div className="flex h-56 items-center justify-center bg-neutral-100 text-sm text-neutral-500">No preview</div>
                )}
                <div className="p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium text-neutral-900">Concept #{concept.number} · v{concept.revisionVersion}</p>
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${getConceptStatusBadgeClass(concept.status)}`}>
                      {formatConceptStatus(concept.status)}
                    </span>
                  </div>
                  {notesPreview ? (
                    <p className="mt-2 text-xs text-neutral-700">
                      {notesPreview}
                      {showEllipsis ? "…" : null}
                    </p>
                  ) : null}
                </div>
              </Link>
            );
          })}
        </section>

        {!loading && concepts.length === 0 ? <p className="mt-4 text-sm text-neutral-600">No concepts published yet.</p> : null}
      </main>
    </PageShell>
  );
}
