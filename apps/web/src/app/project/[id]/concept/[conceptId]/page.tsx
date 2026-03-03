"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

type ConceptAssetItem = { path: string; version: number; createdAt: string; url: string };

import { HeaderNav } from "@/components/header-nav";
import { PageShell } from "@/components/page-shell";

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
  const [selectedAssetUrl, setSelectedAssetUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  const concept = useMemo(
    () => snapshot?.concepts.find((item) => item.id === conceptId) ?? null,
    [snapshot?.concepts, conceptId],
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
      setActionSuccess("Reply posted in concept discussion.");
      await refresh(projectId);
    }

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

  const fromAdmin = searchParams.get("from") === "admin";
  const isAdminView = fromAdmin || session.isAdmin;
  const backHref = fromAdmin ? `/admin/projects/${projectId}` : `/project/${projectId}`;

  const latestAssetUrl = assets[0]?.url ?? concept?.imageUrl ?? null;

  useEffect(() => {
    if (!latestAssetUrl) return;
    setSelectedAssetUrl((prev) => prev ?? latestAssetUrl);
  }, [latestAssetUrl]);

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
            <Link className="underline" href={backHref}>{fromAdmin ? "Back to admin overview" : "Back to project overview"}</Link>
            <Link className="underline" href={`/project/${projectId}/messages`}>Messages</Link>
          </div>
        </div>

        {loading ? <p className="text-sm text-neutral-600">Loading…</p> : null}
        {error ? <p className="text-sm text-red-600">{error}</p> : null}

        {!loading && !concept ? <p className="text-sm text-neutral-700">Concept not found.</p> : null}

        {concept ? (
          <section className="mt-3 rounded-2xl border border-neutral-200 bg-white p-6 ">
            <p className="text-sm font-medium">Concept #{concept.number} · v{concept.revisionVersion}</p>
            {concept.notes ? <p className="mt-1 whitespace-pre-wrap text-sm text-neutral-700">{concept.notes}</p> : null}
            {selectedAssetUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img className="mt-3 w-full rounded border border-neutral-200" src={selectedAssetUrl} alt={`Concept ${concept.number}`} />
            ) : null}

            {assets.length > 1 ? (
              <div className="mt-3">
                <p className="text-xs font-medium text-neutral-600">Revision history</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {assets.map((asset) => (
                    <button
                      key={asset.path}
                      type="button"
                      className={`overflow-hidden rounded border ${selectedAssetUrl === asset.url ? "border-neutral-900" : "border-neutral-200"}`}
                      onClick={() => setSelectedAssetUrl(asset.url)}
                      aria-label={`View v${asset.version}`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={asset.url} alt={`Concept ${concept.number} v${asset.version}`} className="h-16 w-16 object-cover" />
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {isAdminView ? (
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <Link
                  className="rounded border border-neutral-300 bg-neutral-50 px-3 py-1 text-sm"
                  href={`/admin/projects/${projectId}/concepts/${conceptId}/revision`}
                >
                  Upload revision
                </Link>
              </div>
            ) : null}

            {snapshot?.status === "CONCEPTS_READY" && concept.status === "published" ? (
              <button className="mt-3 rounded border border-neutral-300 px-3 py-1 text-sm" disabled={busy} onClick={() => void approveConcept()}>
                Approve concept
              </button>
            ) : null}
          </section>
        ) : null}

        {concept ? (
          <section className="mt-3 rounded-2xl border border-neutral-200 bg-white p-6 ">
            <h2 className="text-lg font-medium">Feedback & revisions</h2>
            <p className="mt-1 text-sm text-neutral-600">Revisions remaining: {snapshot?.entitlements.revisions ?? 0}</p>
            {actionError ? <p className="mt-2 text-sm text-red-600">{actionError}</p> : null}
            {actionSuccess ? <p className="mt-2 text-sm text-green-700">{actionSuccess}</p> : null}

            <div className="mt-4">
              <h3 className="text-sm font-semibold text-neutral-900">Your feedback on this concept</h3>
              <ul className="mt-2 space-y-2">
                {(snapshot?.revisionRequests ?? [])
                  .filter((r) => r.concept?.id === conceptId)
                  .slice()
                  .reverse()
                  .map((r) => (
                    <li key={r.id} className="rounded-xl border border-neutral-200 bg-white p-3 text-sm">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-xs font-semibold text-neutral-700">{r.user?.fullName ?? r.user?.email ?? "Client"}</p>
                        <p className="text-xs text-neutral-500">{formatDateTime(r.createdAt)}</p>
                      </div>
                      <div className="mt-2 rounded-2xl bg-neutral-100 px-3 py-2 text-neutral-900">
                        <p className="whitespace-pre-wrap">{r.body}</p>
                      </div>
                      <p className="mt-2 inline-flex rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-medium text-neutral-700">{r.status}</p>
                    </li>
                  ))}
                {(snapshot?.revisionRequests ?? []).filter((r) => r.concept?.id === conceptId).length === 0 ? (
                  <li className="text-sm text-neutral-600">No feedback submitted yet for this concept.</li>
                ) : null}
              </ul>
            </div>

            <div className="mt-6">
              <h3 className="text-sm font-semibold text-neutral-900">Concept discussion (separate from project messages)</h3>
              <ul className="mt-2 space-y-2">
                {comments.map((comment) => (
                  <li key={comment.id} className="rounded-xl border border-neutral-200 bg-white p-3 text-sm">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-xs font-semibold text-neutral-700">{comment.author.fullName ?? comment.author.email}{comment.author.isAdmin ? " (Designer)" : ""}</p>
                      <p className="text-xs text-neutral-500">{formatDateTime(comment.createdAt)}</p>
                    </div>
                    <div className="mt-2 rounded-2xl bg-blue-50 px-3 py-2 text-neutral-900">
                      <p className="whitespace-pre-wrap">{comment.body}</p>
                    </div>
                  </li>
                ))}
                {comments.length === 0 ? <li className="text-sm text-neutral-600">No discussion replies yet.</li> : null}
              </ul>
            </div>

            {session.isAdmin ? (
              <form className="mt-6" onSubmit={submitDesignerMessage}>
                <label className="block text-sm font-semibold text-neutral-900">Post designer reply in concept discussion</label>
                <textarea
                  className="mt-2 w-full rounded border border-neutral-300 px-2 py-1"
                  rows={4}
                  maxLength={2000}
                  value={designerReply}
                  onChange={(e) => setDesignerReply(e.target.value)}
                  placeholder="Write a quick concept-specific update…"
                />
                <button
                  className="mt-2 rounded border border-neutral-300 px-3 py-1 text-sm"
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
                  className="mt-2 w-full rounded border border-neutral-300 px-2 py-1"
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
            )}
          </section>
        ) : null}
      </main>
    </PageShell>
  );
}
