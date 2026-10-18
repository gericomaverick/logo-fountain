"use client";

import { conceptUploadKey } from "@/lib/concept-upload-key";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { HeaderNav } from "@/components/header-nav";
import { PageShell } from "@/components/page-shell";
import { PanelCard } from "@/components/allowances";
import { EmptyLine, PageHeader, Property, Section } from "@/components/ui";
import { FeatureNoticeCard } from "@/components/feature-notice-card";

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
  if (status === "approved") return { label: "Approved", className: "bg-success-soft text-success" };
  if (status === "published") return { label: "Published", className: "bg-surface-2 text-fg-2" };
  if (status === "archived") return { label: "Archived", className: "bg-surface-2 text-fg-2" };
  return { label: status, className: "bg-surface text-fg-2" };
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

    const retireRequestKey = await conceptUploadKey(projectId, data);
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
      retireRequestKey();
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
      <PageHeader
        crumbs={[{ label: "Queue", href: "/admin" }, { label: `Project ${projectId}`, href: `/admin/projects/${projectId}` }, { label: "Concepts manager" }]}
        actions={
          <div className="flex max-w-[55vw] items-center gap-2 overflow-x-auto text-sm">
            <Link className="portal-btn-ghost shrink-0" href={`/admin/projects/${projectId}`}>Project overview</Link>
            <Link className="portal-btn-ghost shrink-0" href={`/admin/projects/${projectId}/messages`}>Project messages</Link>
          </div>
        }
      />
      <div className="flex min-h-[calc(100%-3.5rem)] flex-col lg:flex-row">
        <main className="min-w-0 flex-1 px-4 py-6 md:px-8 lg:py-8">
          <div className="mx-auto max-w-[920px] space-y-10">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-fg">Concepts manager</h1>
              <p className="mt-2 text-sm text-fg-3">Project {projectId}</p>
            </div>

            <Section title="Pending feedback inbox" id="pending-feedback">
              <p className="mt-1 text-sm text-fg-2">Handle revision requests directly, then jump into concept or project threads.</p>
              {unassignedPendingRevisionCount > 0 ? (
                <p className="mt-2 rounded-lg bg-warning-soft p-3 text-sm text-warning">
                  {unassignedPendingRevisionCount} pending revision request{unassignedPendingRevisionCount === 1 ? "" : "s"} are not linked to a concept yet.
                </p>
              ) : null}

              <div className="mt-4 space-y-3">
                {pendingRevisionRequests.map((request) => (
                  <article key={request.id} className="border-b border-line py-4 last:border-b-0">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-xs text-fg-3">
                          {request.user.fullName ?? request.user.email} · {new Date(request.createdAt).toLocaleString()}
                        </p>
                        <p className="mt-2 whitespace-pre-wrap text-base text-fg">{request.body}</p>
                        <p className="mt-2 text-xs text-fg-2">
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
                          className="portal-btn-secondary"
                          disabled={busy}
                          onClick={() => void markDelivered(request.id)}
                          type="button"
                        >
                          Mark delivered
                        </button>
                      </div>
                    </div>
                  </article>
                ))}
                {pendingRevisionRequests.length === 0 ? <EmptyLine>No pending revision requests.</EmptyLine> : null}
              </div>
            </Section>

            <Section title="Upload and publish concept">
              {error ? <p role="alert" className="mt-3 rounded-lg bg-danger-soft p-3 text-sm text-danger">{error}</p> : null}
              {success ? <p className="mt-3 rounded-lg border border-success/30 bg-success-soft p-3 text-sm text-success">{success}</p> : null}

              <form className="mt-4" onSubmit={uploadConcept}>
                <FeatureNoticeCard variant="info" title="Concept uploads now auto-assign the next concept number to avoid accidental overwrites." />

                <label className="mt-4 block text-sm font-medium text-fg">Asset file</label>
                <input className="portal-field mt-1 block" type="file" accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
                <p className="mt-1 text-sm text-fg-3">PNG, JPEG, or WebP only; 10 MB maximum.</p>

                <label className="mt-4 block text-sm font-medium text-fg">Notes</label>
                <textarea className="mt-1 portal-field" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />

                <button className="mt-4 portal-btn-primary" type="submit" disabled={busy || !file}>
                  {busy ? "Uploading…" : "Upload concept"}
                </button>
              </form>
            </Section>

            <Section title="Published concepts" count={concepts.length}>
              {loading ? <p className="mt-3 text-sm text-fg-2">Loading…</p> : null}
              <div className="mt-3 rounded-xl border border-line bg-panel">
                {concepts.map((concept) => {
                  const pendingFeedbackCount = concept.unresolvedFeedbackCount;

                  const conceptStatus = getConceptStatusMeta(concept.status);

                  return (
                    <article id={`concept-${concept.id}`} key={concept.id} className="border-b border-line first:rounded-t-xl last:rounded-b-xl last:border-b-0">
                      <Link href={`/project/${projectId}/concept/${concept.id}?from=admin`} className="flex flex-col gap-3 p-4 transition-colors hover:bg-surface sm:flex-row sm:items-center">
                        {concept.imageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={concept.imageUrl} alt={`Concept ${concept.number}`} className="h-40 w-full rounded-lg object-contain sm:h-24 sm:w-32" />
                        ) : (
                          <div className="flex h-40 items-center justify-center rounded-lg bg-surface text-sm text-fg-3 sm:h-24 sm:w-32 sm:shrink-0">No preview</div>
                        )}
                        <div className="min-w-0 flex-1 space-y-2">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-base font-medium text-fg">Concept #{concept.number} · v{concept.revisionVersion}</p>
                            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${conceptStatus.className}`}>{conceptStatus.label}</span>
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            {pendingFeedbackCount > 0 ? (
                              <span className="rounded-full bg-warning-soft px-2 py-0.5 text-xs font-semibold text-warning">{pendingFeedbackCount} pending</span>
                            ) : (
                              <span className="rounded-full bg-success-soft px-2 py-0.5 text-xs font-semibold text-success">No pending feedback</span>
                            )}
                            {concept.pendingRevisionCount > 0 ? (
                              <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs font-medium text-fg-2">{concept.pendingRevisionCount} revisions</span>
                            ) : null}
                          </div>
                          {concept.notes ? <p className="line-clamp-2 text-base text-fg-3">{concept.notes}</p> : null}
                        </div>
                      </Link>

                      <div className="flex items-center justify-between gap-2 border-t border-line p-3 text-sm">
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
              {!loading && concepts.length === 0 ? <EmptyLine>No concepts yet.</EmptyLine> : null}
            </Section>
          </div>
        </main>
        <aside className="space-y-4 border-t border-line bg-surface p-5 lg:w-[384px] lg:shrink-0 lg:border-l lg:border-t-0">
          <PanelCard title="Feedback">
            <dl><Property label="Pending items">{totalPending}</Property></dl>
          </PanelCard>
        </aside>
      </div>
    </PageShell>
  );
}
