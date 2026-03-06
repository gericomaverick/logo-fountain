"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { HeaderNav } from "@/components/header-nav";
import { Card, PageShell, SubCard } from "@/components/page-shell";

type Concept = {
  id: string;
  number: number;
  revisionVersion: number;
  status: string;
  notes: string | null;
  imageUrl: string | null;
  pendingRevisionCount: number;
  unresolvedFeedbackCount: number;
};

type PendingRevisionRequest = {
  id: string;
  conceptId: string | null;
  body: string;
  createdAt: string;
  concept: { id: string; number: number } | null;
  user: { email: string; fullName: string | null };
};

function readError(payload: { error?: { message?: string; details?: { nextStep?: string } } | string } | null, fallback: string): string {
  const err = payload?.error;
  const message = typeof err === "string" ? err : err?.message ?? fallback;
  const nextStep = typeof err === "string" ? undefined : err?.details?.nextStep;
  return nextStep ? `${message} — ${nextStep}` : message;
}

function getConceptStatusMeta(status: string): { label: string; className: string } {
  if (status === "approved") return { label: "Approved", className: "bg-emerald-100 text-emerald-900" };
  if (status === "published") return { label: "Published", className: "bg-indigo-100 text-indigo-900" };
  if (status === "archived") return { label: "Archived", className: "bg-neutral-200 text-neutral-700" };
  return { label: status, className: "bg-neutral-100 text-neutral-700" };
}

export default function AdminProjectConceptsPage() {
  const params = useParams<{ id: string }>();
  const projectId = params.id;

  const [concepts, setConcepts] = useState<Concept[]>([]);
  const [pendingRevisionRequests, setPendingRevisionRequests] = useState<PendingRevisionRequest[]>([]);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [unassignedPendingRevisionCount, setUnassignedPendingRevisionCount] = useState(0);

  const [notes, setNotes] = useState("");
  const [file, setFile] = useState<File | null>(null);

  async function refresh(id: string) {
    const [conceptsResponse] = await Promise.all([
      fetch(`/api/admin/projects/${id}/concepts`, { cache: "no-store" }),
      fetch(`/api/projects/${id}/read-state`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ area: "concepts" }),
      }),
    ]);

    const conceptsPayload = await conceptsResponse.json().catch(() => null);

    if (!conceptsResponse.ok) throw new Error(readError(conceptsPayload, "Failed to load concepts"));

    setConcepts((conceptsPayload?.concepts ?? []) as Concept[]);
    setPendingRevisionRequests((conceptsPayload?.pendingRevisionRequests ?? []) as PendingRevisionRequest[]);
    setUnassignedPendingRevisionCount(Number(conceptsPayload?.conceptlessPendingRevisionCount ?? 0));
  }

  useEffect(() => {
    if (!projectId) return;

    const load = async () => {
      try {
        await refresh(projectId);
        setError(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load concepts");
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, [projectId]);

  async function uploadConcept(e: React.FormEvent) {
    e.preventDefault();
    if (!projectId || !file) return;

    setBusy(true);
    setError(null);
    setSuccess(null);

    const data = new FormData();
    data.set("file", file);
    data.set("notes", notes);

    const response = await fetch(`/api/admin/projects/${projectId}/concepts`, {
      method: "POST",
      body: data,
    });
    const payload = await response.json().catch(() => null);

    if (!response.ok) {
      setError(readError(payload, "Upload failed"));
    } else {
      const uploadedNumber = Number(payload?.concept?.number);
      const label = Number.isFinite(uploadedNumber) && uploadedNumber > 0 ? `Concept #${uploadedNumber}` : "Concept";
      setSuccess(`${label} uploaded and published.`);
      setFile(null);
      await refresh(projectId);
    }

    setBusy(false);
  }

  async function markDelivered(revisionRequestId: string) {
    if (!projectId) return;

    setBusy(true);
    setError(null);
    const response = await fetch(`/api/admin/projects/${projectId}/revision-requests/${revisionRequestId}/delivered`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ setConceptsReady: true }),
    });
    const payload = await response.json().catch(() => null);

    if (!response.ok) {
      setError(readError(payload, "Failed to mark delivered"));
    } else {
      setSuccess("Revision request marked as delivered.");
      await refresh(projectId);
    }

    setBusy(false);
  }

  const totalPending = useMemo(
    () => concepts.reduce((acc, concept) => acc + concept.unresolvedFeedbackCount, 0) + unassignedPendingRevisionCount,
    [concepts, unassignedPendingRevisionCount],
  );

  return (
    <PageShell>
      <HeaderNav />
      <main className="mx-auto w-full max-w-[1160px] px-6 py-8 md:px-10">
        <div className="mb-4 flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold">Concepts manager</h1>
            <p className="mt-1 text-sm text-neutral-600">Project {projectId}</p>
            <p className="mt-1 text-sm text-neutral-600">Pending feedback items: {totalPending}</p>
          </div>
          <div className="flex flex-wrap gap-4 text-sm">
            <Link className="portal-link no-underline" href={`/admin/projects/${projectId}`}>Project overview</Link>
            <Link className="portal-link no-underline" href={`/admin/projects/${projectId}/messages`}>Project messages</Link>
          </div>
        </div>

        <Card className="mt-0" id="pending-feedback">
          <h2 className="text-lg font-medium">Pending feedback inbox</h2>
          <p className="mt-1 text-sm text-neutral-600">Handle revision requests directly, then jump into concept or project threads.</p>
          {unassignedPendingRevisionCount > 0 ? (
            <p className="mt-2 text-xs text-amber-700">
              {unassignedPendingRevisionCount} pending revision request{unassignedPendingRevisionCount === 1 ? "" : "s"} are not linked to a concept yet.
            </p>
          ) : null}

          <div className="mt-4 space-y-3">
            {pendingRevisionRequests.map((request) => (
              <SubCard key={request.id} className="bg-white">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs text-neutral-500">
                      {request.user.fullName ?? request.user.email} · {new Date(request.createdAt).toLocaleString()}
                    </p>
                    <p className="mt-2 whitespace-pre-wrap text-sm text-neutral-800">{request.body}</p>
                    <p className="mt-2 text-xs text-neutral-600">
                      {request.concept ? `Concept #${request.concept.number}` : "No concept linked"}
                    </p>
                  </div>
                  <div className="flex flex-col items-start gap-2 text-sm sm:items-end">
                    {request.concept ? (
                      <>
                        <Link className="portal-link no-underline" href={`/project/${projectId}/concept/${request.concept.id}?from=admin`}>
                          Open concept thread
                        </Link>
                        <Link className="portal-link no-underline" href={`/admin/projects/${projectId}/concepts/${request.concept.id}/revision`}>
                          Upload revision
                        </Link>
                      </>
                    ) : null}
                    <Link className="portal-link no-underline" href={`/admin/projects/${projectId}/messages`}>
                      Open project thread
                    </Link>
                    <button
                      className="rounded border border-neutral-300 bg-white px-3 py-1"
                      disabled={busy}
                      onClick={() => void markDelivered(request.id)}
                      type="button"
                    >
                      Mark delivered
                    </button>
                  </div>
                </div>
              </SubCard>
            ))}
            {pendingRevisionRequests.length === 0 ? <p className="text-sm text-neutral-600">No pending revision requests.</p> : null}
          </div>
        </Card>

        <Card>
          <h2 className="text-lg font-medium">Upload and publish concept</h2>
          {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
          {success ? <p className="mt-3 text-sm text-green-700">{success}</p> : null}

          <form className="mt-4" onSubmit={uploadConcept}>
            <p className="rounded border border-neutral-200 bg-neutral-50 px-3 py-2 text-xs text-neutral-700">
              Concept uploads now auto-assign the next concept number to avoid accidental overwrites.
            </p>

            <label className="mt-4 block text-sm font-medium">Asset file</label>
            <input className="mt-1 block" type="file" accept="image/*" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />

            <label className="mt-4 block text-sm font-medium">Notes</label>
            <textarea className="mt-1 portal-field px-2 py-1" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />

            <button className="mt-4 portal-btn-secondary" type="submit" disabled={busy || !file}>
              {busy ? "Uploading…" : "Upload concept"}
            </button>
          </form>
        </Card>

        <section className="mt-8">
          <h2 className="text-lg font-medium">Published concepts</h2>
          {loading ? <p className="mt-3 text-sm text-neutral-600">Loading…</p> : null}
          <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {concepts.map((concept) => {
              const pendingFeedbackCount = concept.unresolvedFeedbackCount;

              const conceptStatus = getConceptStatusMeta(concept.status);

              return (
                <article id={`concept-${concept.id}`} key={concept.id} className="overflow-hidden rounded-xl border border-neutral-200 bg-white">
                  <Link href={`/project/${projectId}/concept/${concept.id}?from=admin`} className="block transition hover:border-neutral-300">
                    {concept.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={concept.imageUrl} alt={`Concept ${concept.number}`} className="h-56 w-full object-cover" />
                    ) : (
                      <div className="flex h-56 items-center justify-center bg-neutral-100 text-sm text-neutral-500">No preview</div>
                    )}
                    <div className="space-y-2 p-3">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-medium text-neutral-900">Concept #{concept.number} · v{concept.revisionVersion}</p>
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${conceptStatus.className}`}>{conceptStatus.label}</span>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        {pendingFeedbackCount > 0 ? (
                          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900">{pendingFeedbackCount} pending</span>
                        ) : (
                          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800">No pending feedback</span>
                        )}
                        {concept.pendingRevisionCount > 0 ? (
                          <span className="rounded-full bg-fuchsia-100 px-2 py-0.5 text-xs font-medium text-fuchsia-800">{concept.pendingRevisionCount} revisions</span>
                        ) : null}
                      </div>
                      {concept.notes ? <p className="line-clamp-2 text-xs text-neutral-500">{concept.notes}</p> : null}
                    </div>
                  </Link>

                  <div className="flex items-center justify-between gap-2 border-t border-neutral-200 p-3 text-xs">
                    <Link className="portal-link no-underline" href={`/project/${projectId}/concept/${concept.id}?from=admin`}>
                      Open concept thread
                    </Link>
                    <Link className="portal-link no-underline" href={`/admin/projects/${projectId}/concepts/${concept.id}/revision`}>
                      Upload revision
                    </Link>
                  </div>
                </article>
              );
            })}
          </div>
          {!loading && concepts.length === 0 ? <p className="mt-4 text-sm text-neutral-600">No concepts yet.</p> : null}
        </section>
      </main>
    </PageShell>
  );
}
