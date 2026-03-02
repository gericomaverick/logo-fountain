"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { ProjectTimeline } from "@/app/project-timeline";

type Snapshot = {
  status: string;
  concepts: Array<{ id: string; number: number; status: string; notes: string | null }>;
  revisionRequests: Array<{ id: string; status: string; body: string; createdAt: string; concept: { id: string; number: number } | null; user: { email: string; fullName: string | null } }>;
  messages: Array<{ id: string; body: string; createdAt: string; sender: { email: string; fullName: string | null } }>;
  primaryCta?: string | null;
  timeline?: Array<{ state: string; label: string; completed: boolean; current: boolean; timestamp?: string }>;
};

function readError(payload: { error?: { message?: string; details?: { nextStep?: string } } | string } | null, fallback: string): string {
  const err = payload?.error;
  const message = typeof err === "string" ? err : err?.message ?? fallback;
  const nextStep = typeof err === "string" ? undefined : err?.details?.nextStep;
  return nextStep ? `${message} — ${nextStep}` : message;
}

export default function AdminProjectPage() {
  const params = useParams<{ id: string }>();
  const projectId = params.id;
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conceptNumber, setConceptNumber] = useState(1);
  const [notes, setNotes] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [finalZipFile, setFinalZipFile] = useState<File | null>(null);
  const [messageBody, setMessageBody] = useState("");

  async function refresh(id: string) {
    const response = await fetch(`/api/admin/projects/${id}`, { cache: "no-store" });
    const payload = await response.json().catch(() => null);
    if (!response.ok) throw new Error(readError(payload, "Failed to load"));
    setSnapshot(payload?.snapshot ?? null);
  }

  useEffect(() => {
    if (!projectId) return;
    const tick = async () => {
      try { await refresh(projectId); setError(null); setLoading(false); }
      catch (e) { setError(e instanceof Error ? e.message : "Failed to load"); setLoading(false); }
    };
    void tick();
    const timer = setInterval(() => void tick(), 2000);
    return () => clearInterval(timer);
  }, [projectId]);

  async function runAction(fn: () => Promise<Response>, fallback: string) {
    setBusy(true); setError(null);
    const res = await fn();
    const payload = await res.json().catch(() => null);
    if (!res.ok) setError(readError(payload, fallback));
    else if (projectId) await refresh(projectId);
    setBusy(false);
  }

  return (
    <main className="mx-auto max-w-4xl p-8">
      <p className="text-sm"><Link href="/admin" className="underline">← Back to queue</Link></p>
      <h1 className="mt-2 text-2xl font-semibold">Admin project</h1>
      <p className="mt-1 text-sm text-neutral-600">Project {projectId}</p>
      <p className="mt-1 text-sm text-neutral-600">Status: {snapshot?.status || "—"}</p>
      {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}

      {snapshot?.timeline ? <ProjectTimeline timeline={snapshot.timeline} primaryCta={snapshot.primaryCta} /> : null}

      <form className="mt-6 rounded border border-neutral-200 p-4" onSubmit={(e) => { e.preventDefault(); if (!projectId || !file) return; void runAction(async () => { const d = new FormData(); d.set("file", file); d.set("conceptNumber", String(conceptNumber)); d.set("notes", notes); return fetch(`/api/admin/projects/${projectId}/concepts`, { method: "POST", body: d }); }, "Upload failed"); }}>
        <h2 className="text-lg font-medium">Upload concept</h2>
        <input className="mt-2" type="number" min={1} value={conceptNumber} onChange={(e) => setConceptNumber(Number.parseInt(e.target.value || "1", 10))} />
        <input className="mt-2 block" type="file" accept="image/*" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        <textarea className="mt-2 w-full rounded border border-neutral-300 px-2 py-1" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
        <button className="mt-3 rounded border border-neutral-300 px-3 py-1 text-sm" type="submit" disabled={busy || !file}>Upload</button>
      </form>

      <form className="mt-6 rounded border border-neutral-200 p-4" onSubmit={(e) => { e.preventDefault(); if (!projectId || !finalZipFile) return; void runAction(async () => { const d = new FormData(); d.set("file", finalZipFile); return fetch(`/api/admin/projects/${projectId}/finals`, { method: "POST", body: d }); }, "Final ZIP upload failed"); }}>
        <h2 className="text-lg font-medium">Final ZIP delivery</h2>
        <input className="mt-2 block" type="file" accept=".zip,application/zip" onChange={(e) => setFinalZipFile(e.target.files?.[0] ?? null)} />
        <button className="mt-3 rounded border border-neutral-300 px-3 py-1 text-sm" type="submit" disabled={busy || !finalZipFile}>Upload final ZIP</button>
      </form>

      <section className="mt-6">
        <h2 className="text-lg font-medium">Concepts</h2>
        {loading ? <p className="mt-3 text-sm text-neutral-600">Loading…</p> : null}
        <ul className="mt-3 space-y-2">
          {(snapshot?.concepts ?? []).map((concept) => (
            <li key={concept.id} className="rounded border border-neutral-200 p-3 text-sm">
              <p><span className="font-medium">#{concept.number}</span> — {concept.status}</p>
              {concept.status !== "published" ? <button className="mt-2 rounded border border-neutral-300 px-2 py-1" disabled={busy} onClick={() => void runAction(() => fetch(`/api/admin/projects/${projectId}/concepts/${concept.id}/publish`, { method: "POST" }), "Publish failed")}>Publish</button> : null}
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-8 rounded border border-neutral-200 p-4">
        <h2 className="text-lg font-medium">Revision requests</h2>
        <ul className="mt-3 space-y-3">
          {(snapshot?.revisionRequests ?? []).map((r) => (
            <li key={r.id} className="rounded border border-neutral-200 p-3 text-sm">
              <p className="text-xs text-neutral-500">{r.user.fullName ?? r.user.email} · {new Date(r.createdAt).toLocaleString()}</p>
              <p className="mt-2 whitespace-pre-wrap text-neutral-800">{r.body}</p>
              {r.status !== "delivered" ? <button className="mt-2 rounded border border-neutral-300 px-2 py-1" disabled={busy} onClick={() => void runAction(() => fetch(`/api/admin/projects/${projectId}/revision-requests/${r.id}/delivered`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ setConceptsReady: true }) }), "Failed to mark delivered")}>Mark delivered</button> : null}
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-8 rounded border border-neutral-200 p-4">
        <h2 className="text-lg font-medium">Project messages</h2>
        <ul className="mt-3 space-y-3">
          {(snapshot?.messages ?? []).map((m) => <li key={m.id} className="rounded border border-neutral-200 p-3 text-sm"><p className="text-xs text-neutral-500">{m.sender.fullName ?? m.sender.email}</p><p className="mt-1 whitespace-pre-wrap text-neutral-800">{m.body}</p></li>)}
        </ul>
        <form className="mt-4" onSubmit={(e) => { e.preventDefault(); if (!projectId || !messageBody.trim()) return; void runAction(() => fetch(`/api/projects/${projectId}/messages`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body: messageBody.trim() }) }), "Send failed").then(() => setMessageBody("")); }}>
          <textarea className="mt-1 w-full rounded border border-neutral-300 px-2 py-1" rows={3} maxLength={2000} value={messageBody} onChange={(e) => setMessageBody(e.target.value)} />
          <button className="mt-2 rounded border border-neutral-300 px-3 py-1 text-sm" type="submit" disabled={busy || !messageBody.trim()}>Send message</button>
        </form>
      </section>
    </main>
  );
}
