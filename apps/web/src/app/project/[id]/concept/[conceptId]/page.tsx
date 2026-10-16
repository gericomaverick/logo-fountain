"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

type ConceptAssetItem = { path: string; version: number; createdAt: string; url: string; notes: string | null };

import { FeatureNoticeCard } from "@/components/feature-notice-card";
import { HeaderNav } from "@/components/header-nav";
import { PageShell } from "@/components/page-shell";
import { Allowance, PanelCard, type EntitlementUsage } from "@/components/allowances";
import { PageHeader, Property } from "@/components/ui";
import { ProjectStatusBadge } from "@/components/project-status-badge";
import { buildUnifiedConceptThread } from "@/lib/concept-thread";
import { canConfirmFinalApproval, FINAL_APPROVAL_CONFIRMATION_COPY } from "@/lib/final-approval";

type Snapshot = {
  status: string;
  entitlements: { revisions: number };
  entitlementUsage?: { revisions: EntitlementUsage };
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
  const [showApprovalConfirm, setShowApprovalConfirm] = useState(false);
  const [approvalAcknowledged, setApprovalAcknowledged] = useState(false);

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
      setShowApprovalConfirm(false);
      setApprovalAcknowledged(false);
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
      <PageHeader
        crumbs={[{ label: fromAdmin ? "Admin project" : "Project", href: backHref }, { label: "Concepts", href: `/project/${projectId}/concepts` }, { label: concept ? `Concept #${concept.number}` : "Concept detail" }]}
        actions={<Link className="portal-btn-ghost" href={`/project/${projectId}/messages`}>Messages</Link>}
      />
      <div className="flex min-h-[calc(100%-3.5rem)] flex-col lg:flex-row">
      <main className="min-w-0 flex-1 px-4 py-6 md:px-8 lg:py-8">
        <div className="mx-auto max-w-[920px] space-y-10">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-fg">Concept detail</h1>
            <p className="mt-2 text-base text-fg-2">Project {projectId}</p>
          </div>

        {approvalSuccess ? (
          <FeatureNoticeCard
            variant="success"
            className="mb-4 p-4"
            kicker="Concept approved"
            title="Concept approved — thank you!"
            body={`${approvalSuccess.conceptNumber ? `Concept #${approvalSuccess.conceptNumber} is now approved.` : "Your selected concept is now approved."} We’ve updated your project status and your designer is moving to the next stage.`}
            actions={(
              <>
                <Link className="portal-btn-secondary border-line bg-panel text-fg" href={`/project/${projectId}`}>
                  Back to project overview
                </Link>
                <button
                  type="button"
                  className="portal-btn-secondary"
                  onClick={() => setApprovalSuccess(null)}
                >
                  Dismiss
                </button>
              </>
            )}
          />
        ) : null}

        {loading ? <p className="text-sm text-fg-3">Loading…</p> : null}
        {error ? <p className="text-sm text-danger">{error}</p> : null}

        {!loading && !concept ? <p className="text-sm text-fg-2">Concept not found.</p> : null}

        {concept ? (
          <section className="space-y-4">
            <p className="text-sm font-medium">Concept #{concept.number} · v{concept.revisionVersion}</p>
            {selectedAssetUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img className="mt-3 w-full rounded border border-line" src={selectedAssetUrl} alt={`Concept ${concept.number}`} />
            ) : null}

            {!isApprovedConcept && visibleAssets.length > 1 ? (
              <div className="mt-3">
                <p className="text-xs font-medium text-fg-3">Revision history</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {visibleAssets.map((asset) => (
                    <button
                      key={asset.path}
                      type="button"
                      className={`overflow-hidden rounded border transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${selectedAssetPath === asset.path ? "border-line-strong" : "border-line hover:border-line-strong"}`}
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
              <div className="mt-4 border-t border-line pt-4">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-fg-2">Designer notes for this concept</p>
                {conceptExplainer ? (
                  <div className="mt-3">
                    <p className="text-xs font-semibold text-fg-2">Concept rationale</p>
                    <p className="mt-1 whitespace-pre-wrap text-base leading-6 text-fg-2">{conceptExplainer}</p>
                  </div>
                ) : null}
                {showSelectedV1DesignerNote ? (
                  <div className="mt-3">
                    <p className="text-xs font-semibold text-fg-2">Designer note</p>
                    <p className="mt-1 whitespace-pre-wrap text-base leading-6 text-fg-2">{selectedAssetNote}</p>
                  </div>
                ) : null}
                {showSelectedAssetNote ? (
                  <div className="mt-3">
                    <p className="text-xs font-semibold text-fg-2">Revision note · v{selectedAsset?.version}</p>
                    <p className="mt-1 whitespace-pre-wrap text-base leading-6 text-fg-2">{selectedAssetNote}</p>
                  </div>
                ) : null}
              </div>
            ) : null}

            {isApprovedConcept ? (
              <FeatureNoticeCard
                variant="success"
                className="mt-4 p-4"
                kicker="Concept status"
                title="Great choice — this concept is officially approved 🎉"
                body="Your designer is now polishing the final files for delivery. We’ll send you notifications as soon as your deliverables are ready to download."
              />
            ) : null}

            {isAdminView ? (
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <Link
                  className="portal-btn-secondary bg-surface"
                  href={`/admin/projects/${projectId}/concepts/${conceptId}/revision`}
                >
                  Upload revision
                </Link>
              </div>
            ) : null}

            {!isAdminView && snapshot?.status === "CONCEPTS_READY" && concept.status === "published" ? (
              <button
                className="mt-3 portal-btn-secondary"
                disabled={busy}
                onClick={() => {
                  setApprovalAcknowledged(false);
                  setShowApprovalConfirm(true);
                }}
              >
                Approve concept
              </button>
            ) : null}
          </section>
        ) : null}

        {showApprovalConfirm ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-fg/45 px-4">
            <div className="w-full max-w-md rounded-2xl border border-line-strong bg-panel p-5 shadow-xl">
              <h2 className="text-lg font-semibold text-fg">{FINAL_APPROVAL_CONFIRMATION_COPY.title}</h2>
              <p className="mt-2 text-sm text-fg-2">{FINAL_APPROVAL_CONFIRMATION_COPY.body}</p>
              <label className="mt-4 flex items-start gap-2 text-sm text-fg">
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={approvalAcknowledged}
                  onChange={(event) => setApprovalAcknowledged(event.target.checked)}
                />
                <span>{FINAL_APPROVAL_CONFIRMATION_COPY.checkboxLabel}</span>
              </label>
              <div className="mt-5 flex flex-wrap justify-end gap-2">
                <button
                  type="button"
                  className="portal-btn-secondary"
                  onClick={() => {
                    setShowApprovalConfirm(false);
                    setApprovalAcknowledged(false);
                  }}
                >
                  {FINAL_APPROVAL_CONFIRMATION_COPY.cancelLabel}
                </button>
                <button
                  type="button"
                  className="portal-btn-primary"
                  disabled={busy || !canConfirmFinalApproval(approvalAcknowledged)}
                  onClick={() => void approveConcept()}
                >
                  {FINAL_APPROVAL_CONFIRMATION_COPY.confirmLabel}
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {concept && !isApprovedConcept ? (
          <section className="space-y-4">
            <h2 className="text-lg font-semibold tracking-tight text-fg">Feedback & revisions</h2>
            {actionError ? <p className="mt-2 text-sm text-danger">{actionError}</p> : null}
            {actionSuccess ? <p className="mt-2 text-sm text-success">{actionSuccess}</p> : null}

            <div className="mt-4 border-t border-line pt-4">
              <h3 className="text-sm font-semibold text-fg">Concept thread</h3>
              <p className="mt-1 text-xs text-fg-3">Client feedback and designer replies appear together in one timeline.</p>

              <ul className="mt-4 space-y-3">
                {unifiedThread.map((item) => (
                  <li key={item.id} className={`flex ${item.isDesignerReply ? "justify-start" : "justify-end"}`}>
                    <article
                      className={`w-full border-b border-line py-4 text-base ${
                        item.isDesignerReply
                          ? "border-line bg-surface text-fg"
                          : "border-line bg-panel text-fg"
                      }`}
                    >
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <span className={`font-semibold ${item.isDesignerReply ? "text-fg-2" : "text-fg"}`}>{item.authorLabel}</span>
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-semibold uppercase tracking-wide ${
                            item.isDesignerReply ? "bg-surface-2 text-fg-2" : "bg-surface-2 text-fg-2"
                          }`}
                        >
                          {item.roleLabel}
                        </span>
                        <span className={item.isDesignerReply ? "text-fg-2" : "text-fg-3"}>•</span>
                        <time className={item.isDesignerReply ? "text-fg-2" : "text-fg-3"} dateTime={item.createdAt}>{formatDateTime(item.createdAt)}</time>
                      </div>

                      <p className="mt-2 whitespace-pre-wrap leading-6">{item.body}</p>

                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-medium uppercase tracking-wide ${
                            item.kind === "revision"
                              ? "bg-warning-soft text-warning"
                              : item.isDesignerReply
                                ? "bg-surface-2 text-fg-2"
                                : "bg-surface-2 text-fg-2"
                          }`}
                        >
                          {item.kind === "revision" ? "Revision request" : "Reply"}
                        </span>
                        {item.kind === "revision" && item.status ? (
                          <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs font-medium uppercase tracking-wide text-fg-2">
                            {item.status}
                          </span>
                        ) : null}
                      </div>
                    </article>
                  </li>
                ))}
                {unifiedThread.length === 0 ? (
                  <li className="text-sm text-fg-3">No feedback or replies yet for this concept.</li>
                ) : null}
              </ul>
            </div>

            {session.isAdmin ? (
              <form className="mt-6" onSubmit={submitDesignerMessage}>
                <label className="block text-sm font-semibold text-fg">Post a designer reply</label>
                <p className="mt-1 text-sm text-fg-3">Your reply will appear in the same concept thread.</p>
                <textarea
                  className="mt-2 portal-field"
                  rows={4}
                  maxLength={2000}
                  value={designerReply}
                  onChange={(e) => setDesignerReply(e.target.value)}
                  placeholder="Write a quick concept-specific update…"
                />
                <button
                  className={showApprovalConfirm ? "mt-2 portal-btn-secondary" : "mt-2 portal-btn-primary"}
                  type="submit"
                  disabled={busy || !designerReply.trim()}
                >
                  Post reply
                </button>
              </form>
            ) : (
              <form className="mt-6" onSubmit={submitRevision}>
                <label className="block text-sm font-semibold text-fg">Request a revision for this concept</label>
                <p className="mt-1 text-sm text-fg-3">Once submitted, your designer will review your notes and work on the next revision.</p>
                <textarea
                  className="mt-2 portal-field"
                  rows={4}
                  maxLength={5000}
                  value={revisionBody}
                  onChange={(e) => setRevisionBody(e.target.value)}
                />
                <button
                  className={showApprovalConfirm ? "mt-2 portal-btn-secondary" : "mt-2 portal-btn-primary"}
                  type="submit"
                  disabled={busy || !revisionBody.trim() || (snapshot?.entitlements.revisions ?? 0) <= 0}
                >
                  Submit revision request
                </button>
              </form>
            )}
          </section>
        ) : null}
        </div>
      </main>
      <aside aria-label="Concept details" className="w-full shrink-0 space-y-4 border-t border-line bg-surface px-4 py-6 lg:w-[384px] lg:border-l lg:border-t-0 lg:px-5 lg:py-8">
        {concept && !isApprovedConcept ? (
          <PanelCard title="Your allowances">
            <Allowance label="Revisions" usage={snapshot?.entitlementUsage?.revisions} />
          </PanelCard>
        ) : null}
        <PanelCard title="Details">
          <dl className="-my-2">
            <Property label="Project"><Link className="portal-link" href={backHref}>{projectId}</Link></Property>
            {snapshot ? <Property label="Status"><ProjectStatusBadge status={snapshot.status} size="sm" /></Property> : null}
            {concept ? <Property label="Concept">#{concept.number}</Property> : null}
            {concept ? <Property label="Version">v{concept.revisionVersion}</Property> : null}
          </dl>
        </PanelCard>
      </aside>
      </div>
    </PageShell>
  );
}
