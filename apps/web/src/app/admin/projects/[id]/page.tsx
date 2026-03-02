"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

type Concept = {
  id: string;
  number: number;
  status: string;
  notes: string | null;
};

type MessageItem = {
  id: string;
  body: string;
  createdAt: string;
  sender: {
    id: string;
    email: string;
    fullName: string | null;
  };
};

type RevisionRequest = {
  id: string;
  status: string;
  body: string;
  createdAt: string;
  updatedAt: string;
  concept: { id: string; number: number } | null;
  user: { id: string; email: string; fullName: string | null };
};

export default function AdminProjectPage() {
  const params = useParams<{ id: string }>();
  const projectId = params.id;

  const [concepts, setConcepts] = useState<Concept[]>([]);
  const [messages, setMessages] = useState<MessageItem[]>([]);
  const [revisionRequests, setRevisionRequests] = useState<RevisionRequest[]>([]);

  const [conceptNumber, setConceptNumber] = useState(1);
  const [notes, setNotes] = useState("");
  const [file, setFile] = useState<File | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [messageBody, setMessageBody] = useState("");
  const [messageError, setMessageError] = useState<string | null>(null);

  async function loadConcepts(id: string) {
    const response = await fetch(`/api/admin/projects/${id}/concepts`, { cache: "no-store" });
    const payload = (await response.json().catch(() => null)) as
      | { concepts?: Concept[]; error?: string }
      | null;

    if (!response.ok) throw new Error(payload?.error ?? "Failed to load concepts");
    setConcepts(payload?.concepts ?? []);
  }

  async function loadMessages(id: string) {
    const response = await fetch(`/api/projects/${id}/messages`, { cache: "no-store" });
    const payload = (await response.json().catch(() => null)) as
      | { messages?: MessageItem[]; error?: string }
      | null;

    if (!response.ok) throw new Error(payload?.error ?? "Failed to load messages");
    setMessages(payload?.messages ?? []);
  }

  async function loadRevisionRequests(id: string) {
    const response = await fetch(`/api/admin/projects/${id}/revision-requests`, { cache: "no-store" });
    const payload = (await response.json().catch(() => null)) as
      | { revisionRequests?: RevisionRequest[]; error?: string }
      | null;

    if (!response.ok) throw new Error(payload?.error ?? "Failed to load revision requests");
    setRevisionRequests(payload?.revisionRequests ?? []);
  }

  useEffect(() => {
    if (!projectId) return;

    let cancelled = false;
    async function run() {
      try {
        await Promise.all([loadConcepts(projectId), loadMessages(projectId), loadRevisionRequests(projectId)]);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  async function onUpload(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!projectId || !file) return;

    setBusy(true);
    setError(null);

    try {
      const data = new FormData();
      data.set("file", file);
      data.set("conceptNumber", String(conceptNumber));
      data.set("notes", notes);

      const response = await fetch(`/api/admin/projects/${projectId}/concepts`, {
        method: "POST",
        body: data,
      });

      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) throw new Error(payload?.error ?? "Upload failed");

      setFile(null);
      setNotes("");
      await loadConcepts(projectId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  async function publishConcept(conceptId: string) {
    if (!projectId) return;
    setBusy(true);
    setError(null);

    try {
      const response = await fetch(`/api/admin/projects/${projectId}/concepts/${conceptId}/publish`, {
        method: "POST",
      });
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) throw new Error(payload?.error ?? "Publish failed");
      await loadConcepts(projectId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Publish failed");
    } finally {
      setBusy(false);
    }
  }

  async function sendMessage(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!projectId) return;

    const body = messageBody.trim();
    if (!body) return;

    setBusy(true);
    setMessageError(null);

    try {
      const response = await fetch(`/api/projects/${projectId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body }),
      });

      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) throw new Error(payload?.error ?? "Send failed");

      setMessageBody("");
      await loadMessages(projectId);
    } catch (e) {
      setMessageError(e instanceof Error ? e.message : "Send failed");
    } finally {
      setBusy(false);
    }
  }

  async function markDelivered(revisionRequestId: string) {
    if (!projectId) return;

    setBusy(true);
    setError(null);

    try {
      const response = await fetch(`/api/admin/projects/${projectId}/revision-requests/${revisionRequestId}/delivered`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ setConceptsReady: true }),
      });

      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) throw new Error(payload?.error ?? "Failed to mark delivered");

      await loadRevisionRequests(projectId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to mark delivered");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto max-w-4xl p-8">
      <p className="text-sm"><Link href="/admin" className="underline">← Back to queue</Link></p>
      <h1 className="mt-2 text-2xl font-semibold">Admin project</h1>
      <p className="mt-1 text-sm text-neutral-600">Project {projectId}</p>

      {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}

      <form className="mt-6 rounded border border-neutral-200 p-4" onSubmit={onUpload}>
        <h2 className="text-lg font-medium">Upload concept</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="text-sm">Concept number
            <input
              className="mt-1 w-full rounded border border-neutral-300 px-2 py-1"
              type="number"
              min={1}
              value={conceptNumber}
              onChange={(e) => setConceptNumber(Number.parseInt(e.target.value || "1", 10))}
            />
          </label>
          <label className="text-sm">Image
            <input className="mt-1 w-full" type="file" accept="image/*" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </label>
        </div>
        <label className="mt-3 block text-sm">Notes
          <textarea className="mt-1 w-full rounded border border-neutral-300 px-2 py-1" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </label>
        <button className="mt-3 rounded border border-neutral-300 px-3 py-1 text-sm" type="submit" disabled={busy || !file}>Upload</button>
      </form>

      <section className="mt-6">
        <h2 className="text-lg font-medium">Concepts</h2>
        {loading ? <p className="mt-3 text-sm text-neutral-600">Loading…</p> : null}
        {!loading && concepts.length === 0 ? <p className="mt-3 text-sm text-neutral-600">No concepts yet.</p> : null}
        <ul className="mt-3 space-y-2">
          {concepts.map((concept) => (
            <li key={concept.id} className="rounded border border-neutral-200 p-3 text-sm">
              <p><span className="font-medium">#{concept.number}</span> — {concept.status}</p>
              {concept.notes ? <p className="text-neutral-700">{concept.notes}</p> : null}
              {concept.status !== "published" ? (
                <button className="mt-2 rounded border border-neutral-300 px-2 py-1" disabled={busy} onClick={() => void publishConcept(concept.id)}>
                  Publish
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-8 rounded border border-neutral-200 p-4">
        <h2 className="text-lg font-medium">Revision requests</h2>
        {!loading && revisionRequests.length === 0 ? <p className="mt-3 text-sm text-neutral-600">No revision requests yet.</p> : null}
        <ul className="mt-3 space-y-3">
          {revisionRequests.map((revisionRequest) => (
            <li key={revisionRequest.id} className="rounded border border-neutral-200 p-3 text-sm">
              <p className="text-xs text-neutral-500">
                {revisionRequest.user.fullName ?? revisionRequest.user.email} · {new Date(revisionRequest.createdAt).toLocaleString()}
              </p>
              <p className="mt-1">Status: <span className="font-medium">{revisionRequest.status}</span></p>
              {revisionRequest.concept ? <p className="mt-1 text-neutral-700">Linked concept: #{revisionRequest.concept.number}</p> : null}
              <p className="mt-2 whitespace-pre-wrap text-neutral-800">{revisionRequest.body}</p>
              {revisionRequest.status !== "delivered" ? (
                <button
                  className="mt-2 rounded border border-neutral-300 px-2 py-1"
                  disabled={busy}
                  onClick={() => void markDelivered(revisionRequest.id)}
                >
                  Mark delivered
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-8 rounded border border-neutral-200 p-4">
        <h2 className="text-lg font-medium">Project messages</h2>

        {!loading && messages.length === 0 ? (
          <p className="mt-3 text-sm text-neutral-600">No messages yet.</p>
        ) : null}

        {messages.length > 0 ? (
          <ul className="mt-3 space-y-3">
            {messages.map((message) => (
              <li key={message.id} className="rounded border border-neutral-200 p-3 text-sm">
                <p className="text-xs text-neutral-500">
                  {message.sender.fullName ?? message.sender.email} · {new Date(message.createdAt).toLocaleString()}
                </p>
                <p className="mt-1 whitespace-pre-wrap text-neutral-800">{message.body}</p>
              </li>
            ))}
          </ul>
        ) : null}

        <form className="mt-4" onSubmit={sendMessage}>
          <label className="block text-sm">Add message
            <textarea
              className="mt-1 w-full rounded border border-neutral-300 px-2 py-1"
              rows={3}
              maxLength={2000}
              value={messageBody}
              onChange={(e) => setMessageBody(e.target.value)}
            />
          </label>
          {messageError ? <p className="mt-2 text-sm text-red-600">{messageError}</p> : null}
          <button className="mt-2 rounded border border-neutral-300 px-3 py-1 text-sm" type="submit" disabled={busy || !messageBody.trim()}>
            Send message
          </button>
        </form>
      </section>
    </main>
  );
}
