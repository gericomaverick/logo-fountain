"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { HeaderNav } from "@/components/header-nav";

type Snapshot = {
  status: string;
  entitlements: { revisions: number };
  concepts: Array<{ id: string; number: number; status: string; notes: string | null; imageUrl: string | null }>;
};

function readError(payload: { error?: { message?: string; details?: { nextStep?: string } } | string } | null, fallback: string): string {
  const err = payload?.error;
  const message = typeof err === "string" ? err : err?.message ?? fallback;
  const nextStep = typeof err === "string" ? undefined : err?.details?.nextStep;
  return nextStep ? `${message} — ${nextStep}` : message;
}

export default function ConceptDetailPage() {
  const params = useParams<{ id: string; conceptId: string }>();
  const projectId = params.id;
  const conceptId = params.conceptId;

  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [revisionBody, setRevisionBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const concept = useMemo(
    () => snapshot?.concepts.find((item) => item.id === conceptId) ?? null,
    [snapshot?.concepts, conceptId],
  );

  async function refresh(id: string) {
    const res = await fetch(`/api/projects/${id}`, { cache: "no-store" });
    const payload = await res.json().catch(() => null);
    if (!res.ok) throw new Error(readError(payload, "Failed to load concept"));
    setSnapshot(payload?.snapshot ?? null);
  }

  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;

    const load = async () => {
      try {
        const res = await fetch(`/api/projects/${projectId}`, { cache: "no-store" });
        const payload = await res.json().catch(() => null);
        if (!res.ok) throw new Error(readError(payload, "Failed to load concept"));

        if (!cancelled) {
          setSnapshot(payload?.snapshot ?? null);
          setError(null);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load concept");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [projectId]);

  async function submitRevision(e: React.FormEvent) {
    e.preventDefault();
    if (!projectId || !conceptId || !revisionBody.trim()) return;

    setBusy(true);
    setActionError(null);

    const res = await fetch(`/api/projects/${projectId}/revision-requests`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: revisionBody.trim(), conceptId }),
    });

    const payload = await res.json().catch(() => null);
    if (!res.ok) setActionError(readError(payload, "Failed to submit revision request"));
    else setRevisionBody("");

    setBusy(false);
  }

  async function approveConcept() {
    if (!projectId || !conceptId) return;

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

  return (
    <>
      <HeaderNav />
      <main className="mx-auto w-full max-w-[1160px] px-6 py-8 md:px-10">
        <div className="mb-4 flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold">Concept detail</h1>
            <p className="mt-1 text-sm text-neutral-600">Project {projectId}</p>
          </div>
          <div className="flex gap-4 text-sm">
            <Link className="underline" href={`/project/${projectId}`}>Back to concepts</Link>
            <Link className="underline" href={`/project/${projectId}/messages`}>Messages</Link>
          </div>
        </div>

        {loading ? <p className="text-sm text-neutral-600">Loading…</p> : null}
        {error ? <p className="text-sm text-red-600">{error}</p> : null}

        {!loading && !concept ? <p className="text-sm text-neutral-700">Concept not found.</p> : null}

        {concept ? (
          <section className="rounded border border-neutral-200 p-4">
            <p className="text-sm font-medium">Concept #{concept.number}</p>
            {concept.notes ? <p className="mt-1 text-sm text-neutral-700">{concept.notes}</p> : null}
            {concept.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img className="mt-3 w-full rounded border border-neutral-200" src={concept.imageUrl} alt={`Concept ${concept.number}`} />
            ) : null}

            {snapshot?.status === "CONCEPTS_READY" && concept.status === "published" ? (
              <button className="mt-3 rounded border border-neutral-300 px-3 py-1 text-sm" disabled={busy} onClick={() => void approveConcept()}>
                Approve concept
              </button>
            ) : null}
          </section>
        ) : null}

        {concept ? (
          <section className="mt-8 rounded border border-neutral-200 p-4">
            <h2 className="text-lg font-medium">Request a revision for this concept</h2>
            <p className="mt-1 text-sm text-neutral-600">Revisions remaining: {snapshot?.entitlements.revisions ?? 0}</p>
            {actionError ? <p className="mt-2 text-sm text-red-600">{actionError}</p> : null}

            <form className="mt-4" onSubmit={submitRevision}>
              <textarea
                className="mt-1 w-full rounded border border-neutral-300 px-2 py-1"
                rows={4}
                maxLength={5000}
                value={revisionBody}
                onChange={(e) => setRevisionBody(e.target.value)}
              />
              <button
                className="mt-2 rounded border border-neutral-300 px-3 py-1 text-sm"
                type="submit"
                disabled={busy || !revisionBody.trim() || (snapshot?.entitlements.revisions ?? 0) <= 0}
              >
                Submit revision request
              </button>
            </form>
          </section>
        ) : null}
      </main>
    </>
  );
}
