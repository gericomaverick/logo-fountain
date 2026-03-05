"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

type ConceptAssetItem = { path: string; version: number; createdAt: string; url: string; notes: string | null };

import { HeaderNav } from "@/components/header-nav";
import { PageShell } from "@/components/page-shell";
import { buildUnifiedConceptThread } from "@/lib/concept-thread";

type Snapshot = {
  status: string;
  entitlements: { revisions: number };
  concepts: Array<{ id: string; number: number; revisionVersion: number; status: string; notes: string | null; imageUrl: string | null }>;
  revisionRequests?: Array<{ id: string; status: string; body: string; createdAt: string; concept?: { id: string; number: number } | null; user?: { email: string; fullName: string | null } | null }>;
};

type SessionPayload = { authenticated: boolean; isAdmin?: boolean; email?: string; fullName?: string | null };
type ConceptComment = { id: string; body: string; createdAt: string; author: { id: string; email: string; fullName: string | null; isAdmin: boolean } };

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

export default function ConceptDetailPage() {
  const params = useParams<{ id: string; conceptId: string }>();
  const searchParams = useSearchParams();
  const projectId = params.id;
  const conceptId = params.conceptId;

  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [session, setSession] = useState<SessionPayload>({ authenticated: false });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [revisionBody, setRevisionBody] = useState("");
  const [designerReply, setDesignerReply] = useState("");
  const [comments, setComments] = useState<ConceptComment[]>([]);
  const [assets, setAssets] = useState<ConceptAssetItem[]>([]);
  const [selectedAssetPath, setSelectedAssetPath] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [approvalSuccess, setApprovalSuccess] = useState<{ conceptNumber?: number } | null>(null);

  const concept = useMemo(
    () => snapshot?.concepts.find((item) => item.id === conceptId) ?? null,
    [snapshot?.concepts, conceptId],
  );

  const conceptRevisionRequests = useMemo(
    () => (snapshot?.revisionRequests ?? []).filter((r) => r.concept?.id === conceptId),
    [snapshot?.revisionRequests, conceptId],
  );

  const unifiedThread = useMemo(
    () => buildUnifiedConceptThread(conceptRevisionRequests, comments),
    [comments, conceptRevisionRequests],
  );

  const refresh = useCallback(async (id: string) => {
    const [res, sessionRes, commentRes, assetsRes] = await Promise.all([
      fetch(`/api/projects/${id}`, { cache: "no-store" }),
      fetch("/api/auth/session", { cache: "no-store" }),
      fetch(`/api/projects/${id}/concepts/${conceptId}/comments`, { cache: "no-store" }),
      fetch(`/api/projects/${id}/concepts/${conceptId}/assets`, { cache: "no-store" }),
    ]);

    const payload = await res.json().catch(() => null);
    if (!res.ok) throw new Error(readError(payload, "Failed to load concept"));

    const commentPayload = await commentRes.json().catch(() => null);
    if (!commentRes.ok) throw new Error(readError(commentPayload, "Failed to load discussion"));

    const assetsPayload = await assetsRes.json().catch(() => null);
    if (!assetsRes.ok) throw new Error(readError(assetsPayload, "Failed to load concept assets"));

    const sessionPayload = (await sessionRes.json().catch(() => null)) as SessionPayload | null;
    setSession(sessionPayload ?? { authenticated: false });
    setSnapshot(payload?.snapshot ?? null);
    setComments((commentPayload?.comments ?? []) as ConceptComment[]);
    setAssets((assetsPayload?.assets ?? []) as ConceptAssetItem[]);
  }, [conceptId]);

  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;

    const load = async () => {
      try {
        await refresh(projectId);

        if (!cancelled) {
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
  }, [projectId, refresh]);

  async function submitRevision(e: React.FormEvent) {
    e.preventDefault();
    if (!projectId || !conceptId || !revisionBody.trim()) return;

    setBusy(true);
    setActionError(null);
    setActionSuccess(null);

    const res = await fetch(`/api/projects/${projectId}/revision-requests`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: revisionBody.trim(), conceptId }),
    });

    const payload = await res.json().catch(() => null);
    if (!res.ok) {
      setActionError(readError(payload, "Failed to submit revision request"));
    } else {
      setRevisionBody("");
      setActionSuccess("Feedback sent. Your designer will review it and work on the next revision.");
      await refresh(projectId);
    }

    setBusy(false);
  }

  async function submitDesignerMessage(e: React.FormEvent) {
    e.preventDefault();
    if (!projectId || !conceptId || !designerReply.trim()) return;

    setBusy(true);
    setActionError(null);
    setActionSuccess(null);

    const res = await fetch(`/api/projects/${projectId}/concepts/${conceptId}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: designerReply.trim() }),
    });

    const payload = await res.json().catch(() => null);
    if (!res.ok) {
      setActionError(readError(payload, "Failed to send message"));
    } else {
      setDesignerReply("");
      setActionSuccess("Reply posted in concept thread.");
      await refresh(projectId);
    }

    setBusy(false);
  }

  async function approveConcept() {
    if (!projectId || !conceptId) return;

    setBusy(true);
    setActionError(null);
    setActionSuccess(null);

    const res = await fetch(`/api/projects/${projectId}/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conceptId }),
    });

    const payload = await res.json().catch(() => null);
    if (!res.ok) {
      setActionError(readError(payload, "Failed to approve concept"));
    } else {
      const approvedConceptId = typeof payload?.concept?.id === "string" ? payload.concept.id : conceptId;
      const approvedConceptStatus = typeof payload?.concept?.status === "string" ? payload.concept.status : "approved";
      const approvedProjectStatus = typeof payload?.project?.status === "string" ? payload.project.status : "AWAITING_APPROVAL";
      const approvedConceptNumber = typeof payload?.concept?.number === "number" ? payload.concept.number : concept?.number;

      setSnapshot((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          status: approvedProjectStatus,
          concepts: prev.concepts.map((item) => {
            if (item.id === approvedConceptId) return { ...item, status: approvedConceptStatus };
            if (item.status === "published" || item.status === "approved") return { ...item, status: "archived" };
            return item;
          }),
        };
      });

      setApprovalSuccess({ conceptNumber: approvedConceptNumber });
      setActionSuccess("Concept approved. We’ve updated your project status.");
      await refresh(projectId);
    }

    setBusy(false);
  }

  const fromAdmin = searchParams.get("from") === "admin";
  const isAdminView = fromAdmin || session.isAdmin;
  const backHref = fromAdmin ? `/admin/projects/${projectId}` : `/project/${projectId}`;

  const isApprovedConcept = concept?.status === "approved";
  const visibleAssets = isApprovedConcept ? assets.slice(0, 1) : assets;

  const selectedAsset = useMemo(() => {
    if (selectedAssetPath) return visibleAssets.find((asset) => asset.path === selectedAssetPath) ?? null;
    return visibleAssets[0] ?? null;
  }, [visibleAssets, selectedAssetPath]);

  const selectedAssetUrl = selectedAsset?.url ?? concept?.imageUrl ?? null;
  const conceptExplainer = concept?.notes?.trim() ?? "";
  const selectedAssetNote = selectedAsset?.notes?.trim() ?? "";
  const selectedAssetNoteMatchesConcept = selectedAssetNote.length > 0
    && conceptExplainer.length > 0
    && selectedAssetNote.localeCompare(conceptExplainer, undefined, { sensitivity: "base" }) === 0;
  const showSelectedAssetNote = selectedAssetNote.length > 0
    && !selectedAssetNoteMatchesConcept
    && (selectedAsset?.version ?? 0) > 1;
  const showSelectedV1DesignerNote = selectedAssetNote.length > 0
    && !selectedAssetNoteMatchesConcept
    && (selectedAsset?.version ?? 0) === 1
    && !conceptExplainer;

  useEffect(() => {
    if (selectedAssetPath) return;
    if (!visibleAssets[0]?.path) return;
    setSelectedAssetPath(visibleAssets[0].path);
  }, [visibleAssets, selectedAssetPath]);

  return (
    <PageShell>
      <HeaderNav />
      <main className="mx-auto w-full max-w-[1160px] px-6 py-8 md:px-10">
        <div className="mb-4 flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold">Concept detail</h1>
            <p className="mt-1 text-sm text-neutral-600">Project {projectId}</p>
          </div>
          <div className="flex gap-4 text-sm">
            <Link className="portal-link no-underline" href={backHref}>{fromAdmin ? "Back to admin overview" : "Back to project overview"}</Link>
            <Link className="portal-link no-underline" href={`/project/${projectId}/messages`}>Messages</Link>
          </div>
        </div>

        {approvalSuccess ? (
          <section className="mb-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-900">
            <h2 className="text-base font-semibold">Concept approved — thank you!</h2>
            <p className="mt-1 text-sm">
              {approvalSuccess.conceptNumber ? `Concept #${approvalSuccess.conceptNumber} is now approved.` : "Your selected concept is now approved."} We’ve updated your project status and your designer is moving to the next stage.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Link className="portal-btn-secondary border-emerald-300 bg-white text-emerald-900" href={`/project/${projectId}`}>
                Back to project overview
              </Link>
              <button
                type="button"
                className="portal-btn-secondary"
                onClick={() => setApprovalSuccess(null)}
              >
                Dismiss
              </button>
            </div>
          </section>
        ) : null}

        {loading ? <p className="text-sm text-neutral-600">Loading…</p> : null}
        {error ? <p className="text-sm text-red-600">{error}</p> : null}

        {!loading && !concept ? <p className="text-sm text-neutral-700">Concept not found.</p> : null}

        {concept ? (
          <section className="mt-3 portal-card">
            <p className="text-sm font-medium">Concept #{concept.number} · v{concept.revisionVersion}</p>
            {selectedAssetUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img className="mt-3 w-full rounded border border-neutral-200" src={selectedAssetUrl} alt={`Concept ${concept.number}`} />
            ) : null}

            {!isApprovedConcept && visibleAssets.length > 1 ? (
              <div className="mt-3">
                <p className="text-xs font-medium text-neutral-600">Revision history</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {visibleAssets.map((asset) => (
                    <button
                      key={asset.path}
                      type="button"
                      className={`overflow-hidden rounded border transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-900 ${selectedAssetPath === asset.path ? "border-neutral-900" : "border-neutral-200 hover:border-neutral-400"}`}
                      onClick={() => setSelectedAssetPath(asset.path)}
                      aria-label={`View v${asset.version}`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={asset.url} alt={`Concept ${concept.number} v${asset.version}`} className="h-16 w-16 object-cover" />
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {(conceptExplainer || showSelectedV1DesignerNote || showSelectedAssetNote) ? (
              <div className="mt-4 rounded-2xl border border-blue-200 bg-gradient-to-br from-blue-50 to-white p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-blue-900">Designer notes for displayed concept</p>
                {conceptExplainer ? (
                  <div className="mt-2 rounded-xl border border-blue-100 bg-white/70 px-4 py-3">
                    <p className="text-xs font-semibold text-blue-900">Concept rationale</p>
                    <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-blue-950">{conceptExplainer}</p>
                  </div>
                ) : null}
                {showSelectedV1DesignerNote ? (
                  <div className="mt-2 rounded-xl border border-blue-100 bg-white/70 px-4 py-3">
                    <p className="text-xs font-semibold text-blue-900">Designer note</p>
                    <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-blue-950">{selectedAssetNote}</p>
                  </div>
                ) : null}
                {showSelectedAssetNote ? (
                  <div className="mt-2 rounded-xl border border-blue-100 bg-white/70 px-4 py-3">
                    <p className="text-xs font-semibold text-blue-900">Revision note · v{selectedAsset?.version}</p>
                    <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-blue-950">{selectedAssetNote}</p>
                  </div>
                ) : null}
              </div>
            ) : null}

            {isApprovedConcept ? (
              <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
                <p className="font-semibold">Great choice — this concept is officially approved 🎉</p>
                <p className="mt-1">Your designer is now polishing the final files for delivery. We’ll send you notifications as soon as your deliverables are ready to download.</p>
              </div>
            ) : null}

            {isAdminView ? (
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <Link
                  className="portal-btn-secondary bg-neutral-50"
                  href={`/admin/projects/${projectId}/concepts/${conceptId}/revision`}
                >
                  Upload revision
                </Link>
              </div>
            ) : null}

            {!isAdminView && snapshot?.status === "CONCEPTS_READY" && concept.status === "published" ? (
              <button className="mt-3 portal-btn-secondary" disabled={busy} onClick={() => void approveConcept()}>
                Approve concept
              </button>
            ) : null}
          </section>
        ) : null}

        {concept && !isApprovedConcept ? (
          <section className="mt-3 portal-card">
            <h2 className="text-lg font-medium">Feedback & revisions</h2>
            <p className="mt-1 text-sm text-neutral-600">Revisions remaining: {snapshot?.entitlements.revisions ?? 0}</p>
            {actionError ? <p className="mt-2 text-sm text-red-600">{actionError}</p> : null}
            {actionSuccess ? <p className="mt-2 text-sm text-green-700">{actionSuccess}</p> : null}

            <div className="mt-4 rounded-2xl border border-neutral-200 bg-neutral-50 p-4">
              <h3 className="text-sm font-semibold text-neutral-900">Concept thread</h3>
              <p className="mt-1 text-xs text-neutral-600">Client feedback and designer replies appear together in one timeline.</p>

              <ul className="mt-4 space-y-3">
                {unifiedThread.map((item) => (
                  <li key={item.id} className={`flex ${item.isDesignerReply ? "justify-start" : "justify-end"}`}>
                    <article
                      className={`max-w-[92%] rounded-2xl border px-4 py-3 text-sm shadow-sm md:max-w-[85%] ${
                        item.isDesignerReply
                          ? "border-blue-200 bg-blue-50 text-blue-950"
                          : "border-neutral-200 bg-white text-neutral-900"
                      }`}
                    >
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <span className={`font-semibold ${item.isDesignerReply ? "text-blue-900" : "text-neutral-800"}`}>{item.authorLabel}</span>
                        <span
                          className={`rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${
                            item.isDesignerReply ? "bg-blue-100 text-blue-900" : "bg-neutral-100 text-neutral-700"
                          }`}
                        >
                          {item.roleLabel}
                        </span>
                        <span className={item.isDesignerReply ? "text-blue-700" : "text-neutral-500"}>•</span>
                        <time className={item.isDesignerReply ? "text-blue-800" : "text-neutral-500"} dateTime={item.createdAt}>{formatDateTime(item.createdAt)}</time>
                      </div>

                      <p className="mt-2 whitespace-pre-wrap leading-6">{item.body}</p>

                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <span
                          className={`rounded-full px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide ${
                            item.kind === "revision"
                              ? "bg-amber-100 text-amber-800"
                              : item.isDesignerReply
                                ? "bg-blue-100 text-blue-900"
                                : "bg-neutral-100 text-neutral-700"
                          }`}
                        >
                          {item.kind === "revision" ? "Revision request" : "Reply"}
                        </span>
                        {item.kind === "revision" && item.status ? (
                          <span className="rounded-full bg-neutral-200 px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-neutral-700">
                            {item.status}
                          </span>
                        ) : null}
                      </div>
                    </article>
                  </li>
                ))}
                {unifiedThread.length === 0 ? (
                  <li className="text-sm text-neutral-600">No feedback or replies yet for this concept.</li>
                ) : null}
              </ul>
            </div>

            {session.isAdmin ? (
              <form className="mt-6" onSubmit={submitDesignerMessage}>
                <label className="block text-sm font-semibold text-neutral-900">Post a designer reply</label>
                <p className="mt-1 text-sm text-neutral-600">Your reply will appear in the same concept thread.</p>
                <textarea
                  className="mt-2 portal-field px-2 py-1"
                  rows={4}
                  maxLength={2000}
                  value={designerReply}
                  onChange={(e) => setDesignerReply(e.target.value)}
                  placeholder="Write a quick concept-specific update…"
                />
                <button
                  className="mt-2 portal-btn-secondary"
                  type="submit"
                  disabled={busy || !designerReply.trim()}
                >
                  Post reply
                </button>
              </form>
            ) : (
              <form className="mt-6" onSubmit={submitRevision}>
                <label className="block text-sm font-semibold text-neutral-900">Request a revision for this concept</label>
                <p className="mt-1 text-sm text-neutral-600">Once submitted, your designer will review your notes and work on the next revision.</p>
                <textarea
                  className="mt-2 portal-field px-2 py-1"
                  rows={4}
                  maxLength={5000}
                  value={revisionBody}
                  onChange={(e) => setRevisionBody(e.target.value)}
                />
                <button
                  className="mt-2 portal-btn-secondary"
                  type="submit"
                  disabled={busy || !revisionBody.trim() || (snapshot?.entitlements.revisions ?? 0) <= 0}
                >
                  Submit revision request
                </button>
              </form>
            )}
          </section>
        ) : null}
      </main>
    </PageShell>
  );
}
