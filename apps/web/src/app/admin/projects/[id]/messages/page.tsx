"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { HeaderNav } from "@/components/header-nav";
import { Card, PageShell, SubCard } from "@/components/page-shell";
import { resolveSenderLabel, sortMessagesNewestLast, type ChatMessage } from "@/lib/chat-messages";

type Message = ChatMessage;

type SessionPayload = {
  authenticated: boolean;
  userId?: string;
  isAdmin?: boolean;
};

type ConceptThreadHint = {
  id: string;
  number: number;
  pendingRevisionCount: number;
  unresolvedFeedbackCount: number;
};

function readError(payload: { error?: { message?: string; details?: { nextStep?: string } } | string } | null, fallback: string): string {
  const err = payload?.error;
  const message = typeof err === "string" ? err : err?.message ?? fallback;
  const nextStep = typeof err === "string" ? undefined : err?.details?.nextStep;
  return nextStep ? `${message} — ${nextStep}` : message;
}

export default function AdminProjectMessagesPage() {
  const params = useParams<{ id: string }>();
  const projectId = params.id;
  const [messages, setMessages] = useState<Message[]>([]);
  const [session, setSession] = useState<SessionPayload>({ authenticated: false });
  const [conceptHints, setConceptHints] = useState<ConceptThreadHint[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const sorted = useMemo(() => sortMessagesNewestLast(messages), [messages]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [sorted.length]);

  async function refresh(id: string) {
    const [messagesRes, sessionRes, conceptsRes] = await Promise.all([
      fetch(`/api/projects/${id}/messages`, { cache: "no-store" }),
      fetch("/api/auth/session", { cache: "no-store" }),
      fetch(`/api/admin/projects/${id}/concepts`, { cache: "no-store" }),
      fetch(`/api/projects/${id}/read-state`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ area: "messages" }),
      }),
    ]);

    const messagesPayload = await messagesRes.json().catch(() => null);
    if (!messagesRes.ok) throw new Error(readError(messagesPayload, "Failed to load messages"));

    const sessionPayload = await sessionRes.json().catch(() => null);
    const conceptsPayload = await conceptsRes.json().catch(() => null);

    setSession((sessionPayload ?? { authenticated: false }) as SessionPayload);
    setMessages((messagesPayload?.messages ?? []) as Message[]);
    setConceptHints(((conceptsPayload?.concepts ?? []) as ConceptThreadHint[]).slice(0, 5));
  }

  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;

    const load = async () => {
      try {
        await refresh(projectId);

        if (!cancelled) setError(null);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load messages");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [projectId]);

  async function sendMessage(e: React.FormEvent) {
    e.preventDefault();
    if (!projectId || !body.trim()) return;

    setBusy(true);
    setError(null);

    const res = await fetch(`/api/projects/${projectId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: body.trim() }),
    });
    const payload = await res.json().catch(() => null);

    if (!res.ok) {
      setError(readError(payload, "Failed to send message"));
    } else {
      setBody("");
      await refresh(projectId);
    }

    setBusy(false);
  }

  return (
    <PageShell>
      <HeaderNav />
      <main className="mx-auto w-full max-w-[1160px] px-6 py-8 md:px-10">
        <div className="mb-4 flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold">Admin messages</h1>
            <p className="mt-1 text-sm text-neutral-600">Project {projectId}</p>
          </div>
          <div className="flex flex-wrap gap-4 text-sm">
            <Link className="portal-link no-underline" href={`/admin/projects/${projectId}`}>Project overview</Link>
            <Link className="portal-link no-underline" href={`/admin/projects/${projectId}/concepts#pending-feedback`}>Pending feedback inbox</Link>
            <Link className="portal-link no-underline" href={`/admin/projects/${projectId}/upload`}>Upload concepts</Link>
          </div>
        </div>

        <Card className="mt-0">
          <h2 className="text-lg font-medium">Reply in the right thread</h2>
          <p className="mt-1 text-sm text-neutral-600">Use this page for project-level updates. For design-specific feedback, jump into the concept thread.</p>
          {conceptHints.length > 0 ? (
            <div className="mt-3 flex flex-wrap gap-2 text-xs">
              {conceptHints.map((concept) => {
                const pending = concept.unresolvedFeedbackCount;
                return (
                  <Link key={concept.id} className="rounded-full border border-neutral-300 bg-white px-2 py-1 text-neutral-700" href={`/project/${projectId}/concept/${concept.id}?from=admin`}>
                    Concept #{concept.number}{pending > 0 ? ` · ${pending} pending` : ""}
                  </Link>
                );
              })}
            </div>
          ) : null}
        </Card>

        <SubCard className="mt-3">
          <div ref={scrollRef} className="h-[28rem] overflow-y-auto rounded-lg border border-neutral-200 bg-white p-4">
            {loading ? <p className="text-sm text-neutral-600">Loading…</p> : null}
            {!loading && sorted.length === 0 ? <p className="text-sm text-neutral-600">No messages yet.</p> : null}

            <ul className="space-y-3">
              {sorted.map((message) => {
                if (message.kind === "system") {
                  return (
                    <li key={message.id} className="flex justify-center">
                      <article className="max-w-[85%] rounded-full bg-neutral-100 px-4 py-2 text-xs font-medium text-neutral-700">
                        {message.body}
                      </article>
                    </li>
                  );
                }

                const isMine = session.userId && message.sender.id === session.userId;
                return (
                  <li key={message.id} className={`flex ${isMine ? "justify-end" : "justify-start"}`}>
                    <article className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm shadow-sm ${isMine ? "bg-neutral-900 text-white" : "bg-neutral-100 text-neutral-900"}`}>
                      <p className={`text-xs ${isMine ? "text-neutral-300" : "text-neutral-500"}`}>
                        {resolveSenderLabel(message.sender)}
                      </p>
                      <p className="mt-1 whitespace-pre-wrap">{message.body}</p>
                      <p className={`mt-2 text-right text-[11px] ${isMine ? "text-neutral-300" : "text-neutral-500"}`}>{new Date(message.createdAt).toLocaleString()}</p>
                    </article>
                  </li>
                );
              })}
            </ul>
          </div>

          {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}

          <form className="mt-4" onSubmit={sendMessage}>
            <label className="text-sm font-medium" htmlFor="message-body">Write a project update</label>
            <textarea id="message-body" className="mt-1 portal-field" rows={3} maxLength={2000} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Type your message..." />
            <button className="mt-2 portal-btn-secondary" type="submit" disabled={busy || !body.trim()}>
              {busy ? "Sending…" : "Send"}
            </button>
          </form>
        </SubCard>
      </main>
    </PageShell>
  );
}
