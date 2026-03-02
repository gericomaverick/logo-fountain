"use client";

import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

type ConceptItem = {
  id: string;
  number: number;
  status: string;
  notes: string | null;
  imageUrl: string | null;
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

type Entitlements = {
  concepts: number;
  revisions: number;
};

export default function ProjectPage() {
  const params = useParams<{ id: string }>();
  const projectId = params.id;

  const [concepts, setConcepts] = useState<ConceptItem[]>([]);
  const [messages, setMessages] = useState<MessageItem[]>([]);
  const [entitlements, setEntitlements] = useState<Entitlements>({ concepts: 0, revisions: 0 });
  const [projectStatus, setProjectStatus] = useState<string>("");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [messageBody, setMessageBody] = useState("");
  const [sending, setSending] = useState(false);
  const [messageError, setMessageError] = useState<string | null>(null);

  const [revisionBody, setRevisionBody] = useState("");
  const [submittingRevision, setSubmittingRevision] = useState(false);
  const [revisionError, setRevisionError] = useState<string | null>(null);
  const [approveError, setApproveError] = useState<string | null>(null);
  const [approvingConceptId, setApprovingConceptId] = useState<string | null>(null);
  const [finalUrl, setFinalUrl] = useState<string | null>(null);
  const [finalError, setFinalError] = useState<string | null>(null);
  const [loadingFinal, setLoadingFinal] = useState(false);

  const latestPublishedConcept = useMemo(
    () => concepts.slice().sort((a, b) => b.number - a.number)[0] ?? null,
    [concepts],
  );

  async function loadMessages(id: string) {
    const response = await fetch(`/api/projects/${id}/messages`, { cache: "no-store" });
    const payload = (await response.json().catch(() => null)) as
      | { messages?: MessageItem[]; error?: string }
      | null;

    if (!response.ok) throw new Error(payload?.error ?? "Failed to load messages");
    setMessages(payload?.messages ?? []);
  }

  async function loadEntitlements(id: string) {
    const response = await fetch(`/api/projects/${id}/entitlements`, { cache: "no-store" });
    const payload = (await response.json().catch(() => null)) as
      | { entitlements?: Entitlements; error?: string }
      | null;

    if (!response.ok) throw new Error(payload?.error ?? "Failed to load entitlements");
    setEntitlements(payload?.entitlements ?? { concepts: 0, revisions: 0 });
  }

  useEffect(() => {
    if (!projectId) return;

    let cancelled = false;

    async function run() {
      try {
        const conceptsResponse = await fetch(`/api/projects/${projectId}/concepts`, { cache: "no-store" });
        const conceptsPayload = (await conceptsResponse.json().catch(() => null)) as
          | { concepts?: ConceptItem[]; projectStatus?: string; error?: string }
          | null;

        if (!conceptsResponse.ok) {
          throw new Error(conceptsPayload?.error ?? "Failed to load concepts");
        }

        if (!cancelled) {
          setConcepts(conceptsPayload?.concepts ?? []);
          setProjectStatus(conceptsPayload?.projectStatus ?? "");
          await Promise.all([loadMessages(projectId), loadEntitlements(projectId)]);
          setError(null);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Failed to load concepts");
          setConcepts([]);
          setMessages([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  async function sendMessage(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!projectId) return;

    const body = messageBody.trim();
    if (!body) return;

    setSending(true);
    setMessageError(null);

    try {
      const response = await fetch(`/api/projects/${projectId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body }),
      });

      const payload = (await response.json().catch(() => null)) as
        | { error?: string }
        | null;

      if (!response.ok) throw new Error(payload?.error ?? "Failed to send message");

      setMessageBody("");
      await loadMessages(projectId);
    } catch (sendError) {
      setMessageError(sendError instanceof Error ? sendError.message : "Failed to send message");
    } finally {
      setSending(false);
    }
  }

  async function reloadConcepts(id: string) {
    const conceptsResponse = await fetch(`/api/projects/${id}/concepts`, { cache: "no-store" });
    const conceptsPayload = (await conceptsResponse.json().catch(() => null)) as
      | { concepts?: ConceptItem[]; projectStatus?: string; error?: string }
      | null;

    if (!conceptsResponse.ok) throw new Error(conceptsPayload?.error ?? "Failed to load concepts");
    setConcepts(conceptsPayload?.concepts ?? []);
    setProjectStatus(conceptsPayload?.projectStatus ?? "");
  }

  async function submitRevisionRequest(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!projectId) return;

    const body = revisionBody.trim();
    if (!body) return;

    setSubmittingRevision(true);
    setRevisionError(null);

    try {
      const response = await fetch(`/api/projects/${projectId}/revision-requests`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body, conceptId: latestPublishedConcept?.id ?? null }),
      });

      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) throw new Error(payload?.error ?? "Failed to submit revision request");

      setRevisionBody("");
      await loadEntitlements(projectId);
    } catch (submitError) {
      setRevisionError(submitError instanceof Error ? submitError.message : "Failed to submit revision request");
    } finally {
      setSubmittingRevision(false);
    }
  }

  async function approveConcept(conceptId: string) {
    if (!projectId) return;

    setApprovingConceptId(conceptId);
    setApproveError(null);

    try {
      const response = await fetch(`/api/projects/${projectId}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conceptId }),
      });

      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) throw new Error(payload?.error ?? "Failed to approve concept");

      await reloadConcepts(projectId);
    } catch (approveErr) {
      setApproveError(approveErr instanceof Error ? approveErr.message : "Failed to approve concept");
    } finally {
      setApprovingConceptId(null);
    }
  }

  async function fetchFinalZip() {
    if (!projectId) return;

    setLoadingFinal(true);
    setFinalError(null);

    try {
      const response = await fetch(`/api/projects/${projectId}/finals`, { cache: "no-store" });
      const payload = (await response.json().catch(() => null)) as { url?: string; error?: string } | null;
      if (!response.ok || !payload?.url) throw new Error(payload?.error ?? "Final ZIP is not available");
      setFinalUrl(payload.url);
    } catch (finalErr) {
      setFinalError(finalErr instanceof Error ? finalErr.message : "Failed to load final ZIP");
    } finally {
      setLoadingFinal(false);
    }
  }

  return (
    <main className="mx-auto max-w-4xl p-8">
      <h1 className="text-2xl font-semibold">Project concepts</h1>
      <p className="mt-2 text-sm text-neutral-600">Project {projectId}</p>
      <p className="mt-1 text-sm text-neutral-600">Status: {projectStatus || "—"}</p>
      <p className="mt-1 text-sm text-neutral-600">Revisions remaining: {entitlements.revisions}</p>

      {loading ? <p className="mt-4 text-sm text-neutral-600">Loading…</p> : null}
      {error ? <p className="mt-4 text-sm text-red-600">{error}</p> : null}

      {!loading && !error && concepts.length === 0 ? (
        <p className="mt-4 text-sm text-neutral-600">No published concepts yet.</p>
      ) : null}

      {!loading && !error && concepts.length > 0 ? (
        <ul className="mt-6 space-y-6">
          {concepts.map((concept) => (
            <li key={concept.id} className="rounded border border-neutral-200 p-4">
              <p className="text-sm font-medium">Concept #{concept.number}</p>
              {concept.notes ? <p className="mt-1 text-sm text-neutral-700">{concept.notes}</p> : null}
              {concept.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img className="mt-3 w-full rounded border border-neutral-200" src={concept.imageUrl} alt={`Concept ${concept.number}`} />
              ) : (
                <p className="mt-3 text-sm text-neutral-500">No image available.</p>
              )}
              {projectStatus === "CONCEPTS_READY" && concept.status === "published" ? (
                <button
                  className="mt-3 rounded border border-neutral-300 px-3 py-1 text-sm"
                  onClick={() => void approveConcept(concept.id)}
                  disabled={approvingConceptId === concept.id}
                >
                  {approvingConceptId === concept.id ? "Approving…" : "Approve concept"}
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      {approveError ? <p className="mt-3 text-sm text-red-600">{approveError}</p> : null}

      {projectStatus === "FINAL_FILES_READY" ? (
        <section className="mt-10 rounded border border-neutral-200 p-4">
          <h2 className="text-lg font-medium">Final files</h2>
          <button className="mt-3 rounded border border-neutral-300 px-3 py-1 text-sm" onClick={() => void fetchFinalZip()} disabled={loadingFinal}>
            {loadingFinal ? "Loading…" : "Get download link"}
          </button>
          {finalUrl ? <p className="mt-3 text-sm"><a className="underline" href={finalUrl} target="_blank" rel="noreferrer">Download final ZIP</a></p> : null}
          {finalError ? <p className="mt-2 text-sm text-red-600">{finalError}</p> : null}
        </section>
      ) : null}

      <section className="mt-10 rounded border border-neutral-200 p-4">
        <h2 className="text-lg font-medium">Request a revision</h2>
        <p className="mt-1 text-sm text-neutral-600">
          {latestPublishedConcept
            ? `This request will be linked to Concept #${latestPublishedConcept.number}.`
            : "No published concept selected. Request will be project-level."}
        </p>
        <form className="mt-4" onSubmit={submitRevisionRequest}>
          <label className="block text-sm">What should change?
            <textarea
              className="mt-1 w-full rounded border border-neutral-300 px-2 py-1"
              rows={4}
              maxLength={5000}
              value={revisionBody}
              onChange={(e) => setRevisionBody(e.target.value)}
            />
          </label>
          {revisionError ? <p className="mt-2 text-sm text-red-600">{revisionError}</p> : null}
          <button
            className="mt-2 rounded border border-neutral-300 px-3 py-1 text-sm"
            type="submit"
            disabled={submittingRevision || !revisionBody.trim() || entitlements.revisions <= 0}
          >
            {submittingRevision ? "Submitting…" : "Submit revision request"}
          </button>
        </form>
      </section>

      <section className="mt-10 rounded border border-neutral-200 p-4">
        <h2 className="text-lg font-medium">Project messages</h2>

        {!loading && !error && messages.length === 0 ? (
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
          <button className="mt-2 rounded border border-neutral-300 px-3 py-1 text-sm" type="submit" disabled={sending || !messageBody.trim()}>
            {sending ? "Sending…" : "Send message"}
          </button>
        </form>
      </section>
    </main>
  );
}
