"use client";

import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ProjectTimeline } from "@/app/project-timeline";
import { HeaderNav } from "@/components/header-nav";

type Snapshot = {
  status: string;
  packageCode: string;
  entitlements: { concepts: number; revisions: number };
  concepts: Array<{ id: string; number: number; status: string; notes: string | null; imageUrl: string | null }>;
  messages: Array<{ id: string; body: string; createdAt: string; sender: { id: string; email: string; fullName: string | null } }>;
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

export default function ProjectPage() {
  const params = useParams<{ id: string }>();
  const projectId = params.id;
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [messageBody, setMessageBody] = useState("");
  const [revisionBody, setRevisionBody] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);

  const latestPublishedConcept = useMemo(
    () => (snapshot?.concepts ?? []).slice().sort((a, b) => b.number - a.number)[0] ?? null,
    [snapshot?.concepts],
  );

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

  async function sendMessage(e: React.FormEvent) {
    e.preventDefault();
    if (!projectId || !messageBody.trim()) return;
    setBusy(true); setActionError(null);
    const res = await fetch(`/api/projects/${projectId}/messages`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body: messageBody.trim() }) });
    const payload = await res.json().catch(() => null);
    if (!res.ok) setActionError(readError(payload, "Failed to send message"));
    else { setMessageBody(""); await refresh(projectId); }
    setBusy(false);
  }

  async function submitRevision(e: React.FormEvent) {
    e.preventDefault();
    if (!projectId || !revisionBody.trim()) return;
    setBusy(true); setActionError(null);
    const res = await fetch(`/api/projects/${projectId}/revision-requests`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: revisionBody.trim(), conceptId: latestPublishedConcept?.id ?? null }),
    });
    const payload = await res.json().catch(() => null);
    if (!res.ok) setActionError(readError(payload, "Failed to submit revision request"));
    else { setRevisionBody(""); await refresh(projectId); }
    setBusy(false);
  }

  async function approveConcept(conceptId: string) {
    if (!projectId) return;
    setBusy(true); setActionError(null);
    const res = await fetch(`/api/projects/${projectId}/approve`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ conceptId }) });
    const payload = await res.json().catch(() => null);
    if (!res.ok) setActionError(readError(payload, "Failed to approve concept"));
    else await refresh(projectId);
    setBusy(false);
  }

  return (
    <>
      <HeaderNav />
      <main className="mx-auto max-w-4xl p-8">
        <h1 className="text-2xl font-semibold">Project concepts</h1>
      <p className="mt-2 text-sm text-neutral-600">Project {projectId}</p>
      <p className="mt-1 text-sm text-neutral-600">Status: {snapshot?.status || "—"}</p>
      <p className="mt-1 text-sm text-neutral-600">Revisions remaining: {snapshot?.entitlements.revisions ?? 0}</p>
      {loading ? <p className="mt-4 text-sm text-neutral-600">Loading…</p> : null}
      {error ? <p className="mt-4 text-sm text-red-600">{error}</p> : null}
      {actionError ? <p className="mt-3 text-sm text-red-600">{actionError}</p> : null}

      {snapshot?.timeline ? <ProjectTimeline timeline={snapshot.timeline} primaryCta={snapshot.primaryCta} /> : null}

      <ul className="mt-6 space-y-6">
        {(snapshot?.concepts ?? []).map((concept) => (
          <li key={concept.id} className="rounded border border-neutral-200 p-4">
            <p className="text-sm font-medium">Concept #{concept.number}</p>
            {concept.notes ? <p className="mt-1 text-sm text-neutral-700">{concept.notes}</p> : null}
            {concept.imageUrl ? <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className="mt-3 w-full rounded border border-neutral-200" src={concept.imageUrl} alt={`Concept ${concept.number}`} />
            </> : null}
            {snapshot?.status === "CONCEPTS_READY" && concept.status === "published" ? (
              <button className="mt-3 rounded border border-neutral-300 px-3 py-1 text-sm" disabled={busy} onClick={() => void approveConcept(concept.id)}>Approve concept</button>
            ) : null}
          </li>
        ))}
      </ul>

      {snapshot?.status === "FINAL_FILES_READY" && snapshot?.finalZip.url ? (
        <section className="mt-10 rounded border border-neutral-200 p-4">
          <h2 className="text-lg font-medium">Final files</h2>
          <p className="mt-3 text-sm"><a className="underline" href={snapshot.finalZip.url} target="_blank" rel="noreferrer">Download final ZIP</a></p>
        </section>
      ) : null}

      <section className="mt-10 rounded border border-neutral-200 p-4">
        <h2 className="text-lg font-medium">Request a revision</h2>
        <form className="mt-4" onSubmit={submitRevision}>
          <textarea className="mt-1 w-full rounded border border-neutral-300 px-2 py-1" rows={4} maxLength={5000} value={revisionBody} onChange={(e) => setRevisionBody(e.target.value)} />
          <button className="mt-2 rounded border border-neutral-300 px-3 py-1 text-sm" type="submit" disabled={busy || !revisionBody.trim() || (snapshot?.entitlements.revisions ?? 0) <= 0}>Submit revision request</button>
        </form>
      </section>

      <section className="mt-10 rounded border border-neutral-200 p-4">
        <h2 className="text-lg font-medium">Project messages</h2>
        <ul className="mt-3 space-y-3">
          {(snapshot?.messages ?? []).map((message) => (
            <li key={message.id} className="rounded border border-neutral-200 p-3 text-sm">
              <p className="text-xs text-neutral-500">{message.sender.fullName ?? message.sender.email} · {new Date(message.createdAt).toLocaleString()}</p>
              <p className="mt-1 whitespace-pre-wrap text-neutral-800">{message.body}</p>
            </li>
          ))}
        </ul>
        <form className="mt-4" onSubmit={sendMessage}>
          <textarea className="mt-1 w-full rounded border border-neutral-300 px-2 py-1" rows={3} maxLength={2000} value={messageBody} onChange={(e) => setMessageBody(e.target.value)} />
          <button className="mt-2 rounded border border-neutral-300 px-3 py-1 text-sm" type="submit" disabled={busy || !messageBody.trim()}>Send message</button>
        </form>
      </section>
      </main>
    </>
  );
}
