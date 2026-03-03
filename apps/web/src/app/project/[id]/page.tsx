"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { ProjectTimeline } from "@/app/project-timeline";
import { HeaderNav } from "@/components/header-nav";
import { ProjectStatusBadge } from "@/components/project-status-badge";

type EntitlementUsage = {
  limit: number;
  consumed: number;
  remaining: number;
};

type Snapshot = {
  status: string;
  packageCode: string;
  createdAt?: string;
  updatedAt?: string;
  entitlements: { concepts: number; revisions: number };
  entitlementUsage?: {
    concepts?: EntitlementUsage;
    revisions?: EntitlementUsage;
  };
  concepts: Array<{ id: string; number: number; status: string; notes: string | null; imageUrl: string | null }>;
  finalZip: { available: boolean; url: string | null };
  primaryCta?: string | null;
  timeline?: Array<{ state: string; label: string; completed: boolean; current: boolean; timestamp?: string }>;
};

function readError(payload: { error?: { message?: string; details?: { nextStep?: string } } | string } | null, fallback: string): string {
  const err = payload?.error;
  const message = typeof err === "string" ? err : err?.message ?? fallback;
  const nextStep = typeof err === "string" ? undefined : err?.details?.nextStep;
  return nextStep ? `${message} — ${nextStep}` : message;
}

const DATE_TIME_FORMATTER = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

function formatDateTime(value?: string): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return DATE_TIME_FORMATTER.format(date);
}

function resolveUsage(usage: EntitlementUsage | undefined) {
  const limit = Math.max(usage?.limit ?? 0, 0);
  const consumed = Math.max(usage?.consumed ?? 0, 0);
  const used = Math.min(consumed, limit);
  const remaining = Math.max(limit - consumed, 0);
  const ratio = limit > 0 ? Math.min((used / limit) * 100, 100) : 0;

  return { limit, used, remaining, ratio };
}

function EntitlementProgress({ label, usage }: { label: string; usage: EntitlementUsage | undefined }) {
  const stats = resolveUsage(usage);

  return (
    <article className="rounded-xl border border-neutral-200 bg-white p-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-neutral-900">{label}</h3>
        <p className="text-xs text-neutral-500">{stats.remaining} left</p>
      </div>
      <p className="mt-1 text-sm text-neutral-700">
        {stats.used} of {stats.limit} used
      </p>
      <div className="mt-3 h-2 rounded-full bg-neutral-200">
        <div className="h-2 rounded-full bg-neutral-900 transition-all" style={{ width: `${stats.ratio}%` }} />
      </div>
    </article>
  );
}

export default function ProjectPage() {
  const params = useParams<{ id: string }>();
  const projectId = params.id;
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  async function refresh(id: string) {
    const response = await fetch(`/api/projects/${id}`, { cache: "no-store" });
    const payload = await response.json().catch(() => null);
    if (!response.ok) throw new Error(readError(payload, "Failed to load project"));
    setSnapshot(payload?.snapshot ?? null);
  }

  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    let timer: NodeJS.Timeout | null = null;

    const tick = async () => {
      try {
        await refresh(projectId);
        if (!cancelled) {
          setError(null);
          setLoading(false);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to load project");
          setLoading(false);
        }
      }
    };

    void tick();
    timer = setInterval(() => void tick(), 2000);
    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
    };
  }, [projectId]);

  async function approveConcept(conceptId: string) {
    if (!projectId) return;
    setBusy(true);
    setActionError(null);
    const res = await fetch(`/api/projects/${projectId}/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conceptId }),
    });
    const payload = await res.json().catch(() => null);
    if (!res.ok) setActionError(readError(payload, "Failed to approve concept"));
    else await refresh(projectId);
    setBusy(false);
  }

  const conceptUsage = useMemo(
    () => resolveUsage(snapshot?.entitlementUsage?.concepts),
    [snapshot?.entitlementUsage?.concepts],
  );
  const revisionUsage = useMemo(
    () => resolveUsage(snapshot?.entitlementUsage?.revisions),
    [snapshot?.entitlementUsage?.revisions],
  );

  return (
    <>
      <HeaderNav />
      <main className="mx-auto max-w-4xl p-8">
        <section className="rounded-2xl border border-neutral-200 bg-gradient-to-b from-white to-neutral-50 p-6 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <ProjectStatusBadge status={snapshot?.status ?? "UNKNOWN"} />
              <h1 className="mt-3 text-2xl font-semibold text-neutral-900">Project concepts</h1>
              <p className="mt-1 text-sm text-neutral-600">Project {projectId}</p>
              <p className="text-sm text-neutral-600">Package: {snapshot?.packageCode ?? "—"}</p>
            </div>
            <div className="flex flex-col gap-2 sm:items-end">
              <Link className="rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-sm" href={`/project/${projectId}/messages`}>
                Open messages
              </Link>
            </div>
          </div>

          <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
            <div className="rounded-xl border border-neutral-200 bg-white px-4 py-3">
              <p className="text-xs uppercase tracking-wide text-neutral-500">Created</p>
              <p className="mt-1 font-medium text-neutral-900">{formatDateTime(snapshot?.createdAt)}</p>
            </div>
            <div className="rounded-xl border border-neutral-200 bg-white px-4 py-3">
              <p className="text-xs uppercase tracking-wide text-neutral-500">Last updated</p>
              <p className="mt-1 font-medium text-neutral-900">{formatDateTime(snapshot?.updatedAt)}</p>
            </div>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <EntitlementProgress label="Concepts" usage={snapshot?.entitlementUsage?.concepts} />
            <EntitlementProgress label="Revisions" usage={snapshot?.entitlementUsage?.revisions} />
          </div>

          <p className="mt-2 text-xs text-neutral-500">
            {conceptUsage.remaining} concepts left · {revisionUsage.remaining} revisions left
          </p>
        </section>

        {loading ? <p className="mt-4 text-sm text-neutral-600">Loading…</p> : null}
        {error ? <p className="mt-4 text-sm text-red-600">{error}</p> : null}
        {actionError ? <p className="mt-3 text-sm text-red-600">{actionError}</p> : null}

        {snapshot?.timeline ? <ProjectTimeline timeline={snapshot.timeline} primaryCta={snapshot.primaryCta} /> : null}

        <ul className="mt-6 space-y-6">
          {(snapshot?.concepts ?? []).map((concept) => (
            <li key={concept.id} className="rounded border border-neutral-200 p-4">
              <div className="flex items-start justify-between gap-3">
                <p className="text-sm font-medium">Concept #{concept.number}</p>
                <Link className="text-sm underline" href={`/project/${projectId}/concept/${concept.id}`}>
                  View concept
                </Link>
              </div>
              {concept.notes ? <p className="mt-1 text-sm text-neutral-700">{concept.notes}</p> : null}
              {concept.imageUrl ? (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img className="mt-3 w-full rounded border border-neutral-200" src={concept.imageUrl} alt={`Concept ${concept.number}`} />
                </>
              ) : null}
              {snapshot?.status === "CONCEPTS_READY" && concept.status === "published" ? (
                <button className="mt-3 rounded border border-neutral-300 px-3 py-1 text-sm" disabled={busy} onClick={() => void approveConcept(concept.id)}>
                  Approve concept
                </button>
              ) : null}
            </li>
          ))}
        </ul>

        {snapshot?.status === "FINAL_FILES_READY" && snapshot?.finalZip.url ? (
          <section className="mt-10 rounded border border-neutral-200 p-4">
            <h2 className="text-lg font-medium">Final files</h2>
            <p className="mt-3 text-sm">
              <a className="underline" href={snapshot.finalZip.url} target="_blank" rel="noreferrer">
                Download final ZIP
              </a>
            </p>
          </section>
        ) : null}
      </main>
    </>
  );
}
