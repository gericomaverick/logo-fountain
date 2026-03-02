"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { ProjectTimeline } from "@/app/project-timeline";

type Snapshot = {
  status: string;
  stuck?: boolean;
  stuckReason?: string | null;
  latestOrder?: { id: string; status: string; stripeCheckoutSessionId: string | null; createdAt: string } | null;
  concepts: Array<{ id: string; number: number; status: string; notes: string | null }>;
  revisionRequests: Array<{ id: string; status: string; body: string; createdAt: string; concept: { id: string; number: number } | null; user: { email: string; fullName: string | null } }>;
  messages: Array<{ id: string; body: string; createdAt: string; sender: { email: string; fullName: string | null } }>;
  primaryCta?: string | null;
  timeline?: Array<{ state: string; label: string; completed: boolean; current: boolean; timestamp?: string }>;
  recentAuditEventsCount?: number;
};

type AuditEvent = {
  id: string;
  type: string;
  payload: unknown;
  createdAt: string;
  actor: { email: string; fullName: string | null } | null;
};

function readError(payload: { error?: { message?: string; details?: { nextStep?: string } } | string } | null, fallback: string): string {
  const err = payload?.error;
  const message = typeof err === "string" ? err : err?.message ?? fallback;
  const nextStep = typeof err === "string" ? undefined : err?.details?.nextStep;
  return nextStep ? `${message} — ${nextStep}` : message;
}

function summarizePayload(payload: unknown): string {
  if (payload == null) return "—";
  if (typeof payload === "string" || typeof payload === "number" || typeof payload === "boolean") return String(payload);
  if (Array.isArray(payload)) return `${payload.length} item${payload.length === 1 ? "" : "s"}`;
  if (typeof payload !== "object") return "—";

  const entries = Object.entries(payload as Record<string, unknown>).slice(0, 3);
  if (entries.length === 0) return "{}";

  return entries
    .map(([key, value]) => {
      if (value == null) return `${key}=null`;
      if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return `${key}=${String(value)}`;
      if (Array.isArray(value)) return `${key}=[${value.length}]`;
      if (typeof value === "object") return `${key}={…}`;
      return `${key}=…`;
    })
    .join(", ");
}

export default function AdminProjectPage() {
  const params = useParams<{ id: string }>();
  const projectId = params.id;
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conceptNumber, setConceptNumber] = useState(1);
  const [notes, setNotes] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [finalZipFile, setFinalZipFile] = useState<File | null>(null);
  const [messageBody, setMessageBody] = useState("");
  const [reprocessSessionId, setReprocessSessionId] = useState("");

  async function refresh(id: string) {
    const [snapshotResponse, auditResponse] = await Promise.all([
      fetch(`/api/admin/projects/${id}`, { cache: "no-store" }),
      fetch(`/api/admin/projects/${id}/audit`, { cache: "no-store" }),
    ]);

    const snapshotPayload = await snapshotResponse.json().catch(() => null);
    const auditPayload = await auditResponse.json().catch(() => null);

    if (!snapshotResponse.ok) throw new Error(readError(snapshotPayload, "Failed to load"));
    if (!auditResponse.ok) throw new Error(readError(auditPayload, "Failed to load audit log"));

    setSnapshot(snapshotPayload?.snapshot ?? null);
    setAuditEvents(auditPayload?.events ?? []);
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
      <p className="mt-1 text-sm text-neutral-600">Recent audit events: {snapshot?.recentAuditEventsCount ?? 0}</p>
      {snapshot?.stuck ? (
        <p className="mt-1 text-sm text-red-700">⚠ Stuck: {snapshot.stuckReason ?? "Needs manual intervention."}</p>
      ) : null}
      {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}

      {snapshot?.timeline ? <ProjectTimeline timeline={snapshot.timeline} primaryCta={snapshot.primaryCta} /> : null}

      {snapshot?.stuck ? (
        <section className="mt-6 rounded border border-red-200 bg-red-50 p-4">
          <h2 className="text-lg font-medium text-red-800">Webhook recovery</h2>
          <p className="mt-1 text-sm text-red-700">Use Stripe Checkout session id to retry idempotent fulfillment.</p>
          <input
            className="mt-2 w-full rounded border border-red-200 bg-white px-2 py-1 text-sm"
            placeholder="cs_test_..."
            value={reprocessSessionId}
            onChange={(e) => setReprocessSessionId(e.target.value)}
          />
          {snapshot.latestOrder?.stripeCheckoutSessionId ? (
            <p className="mt-1 text-xs text-red-700">Latest order session: {snapshot.latestOrder.stripeCheckoutSessionId}</p>
          ) : null}
          <button
            className="mt-3 rounded border border-red-300 bg-white px-3 py-1 text-sm"
            type="button"
            disabled={busy || !reprocessSessionId.trim()}
            onClick={() => void runAction(
              () => fetch("/api/admin/checkout/reprocess", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ session_id: reprocessSessionId.trim() }),
              }),
              "Reprocess failed"
            )}
          >
            Reprocess checkout session
          </button>
        </section>
      ) : null}

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

      <section className="mt-8 rounded border border-neutral-200 p-4">
        <h2 className="text-lg font-medium">Audit log</h2>
        <ul className="mt-3 space-y-3">
          {auditEvents.map((event) => (
            <li key={event.id} className="rounded border border-neutral-200 p-3 text-sm">
              <p className="text-xs text-neutral-500">{new Date(event.createdAt).toLocaleString()} · {event.actor?.email ?? "System"}</p>
              <p className="mt-1"><span className="font-medium">{event.type}</span></p>
              <p className="mt-1 text-neutral-700">{summarizePayload(event.payload)}</p>
            </li>
          ))}
          {auditEvents.length === 0 ? <li className="text-sm text-neutral-500">No audit events yet.</li> : null}
        </ul>
      </section>
    </main>
  );
}
