"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { HeaderNav } from "@/components/header-nav";
import { PageShell } from "@/components/page-shell";
import { EmptyLine, PageHeader } from "@/components/ui";
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
      <PageHeader
        crumbs={[{ label: "Queue", href: "/admin" }, { label: "Project", href: `/admin/projects/${projectId}` }, { label: "Messages" }]}
        actions={<Link className="portal-btn-ghost" href={`/admin/projects/${projectId}`}>Project overview</Link>}
      />
      <main className="flex h-[calc(100%-3.5rem)] min-h-0 flex-col">
        <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-6 md:px-8 lg:py-8">
          <div className="mx-auto max-w-[920px]">
            <div className="pb-5">
              <h1 className="text-2xl font-semibold tracking-tight text-fg">Admin messages</h1>
              <p className="mt-1 text-sm text-fg-2">Project {projectId}</p>
              <section className="mt-6 border-t border-line pt-5">
                <h2 className="text-lg font-semibold tracking-tight text-fg">Reply in the right thread</h2>
                <p className="mt-1 text-base text-fg-2">Use this page for project-level updates. For design-specific feedback, jump into the concept thread.</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Link className="portal-btn-ghost" href={`/admin/projects/${projectId}/concepts#pending-feedback`}>Pending feedback inbox</Link>
                  <Link className="portal-btn-secondary" href={`/admin/projects/${projectId}/upload`}>Upload concepts</Link>
                </div>
                {conceptHints.length > 0 ? (
                  <div className="mt-3 flex flex-wrap gap-2 text-sm">
                    {conceptHints.map((concept) => {
                      const pending = concept.unresolvedFeedbackCount;
                      return (
                        <Link key={concept.id} className="portal-btn-secondary" href={`/project/${projectId}/concept/${concept.id}?from=admin`}>
                          Concept #{concept.number}{pending > 0 ? ` · ${pending} pending` : ""}
                        </Link>
                      );
                    })}
                  </div>
                ) : null}
              </section>
            </div>
            {loading ? <EmptyLine>Loading…</EmptyLine> : null}
            {!loading && sorted.length === 0 ? <EmptyLine>No messages yet.</EmptyLine> : null}
            <ul className="divide-y divide-line" aria-label="Project messages">
              {sorted.map((message) => {
                if (message.kind === "system") {
                  return (
                    <li key={message.id} className="py-4">
                      <article className="border-l-2 border-line-strong pl-4">
                        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                          <p className="text-sm font-medium text-fg-2">System</p>
                          <time className="text-xs text-fg-3" dateTime={message.createdAt} title={new Date(message.createdAt).toLocaleString()}>{new Date(message.createdAt).toLocaleString()}</time>
                        </div>
                        <p className="mt-2 whitespace-pre-wrap break-words text-base text-fg-2">{message.body}</p>
                      </article>
                    </li>
                  );
                }

                const isMine = session.userId && message.sender.id === session.userId;
                return (
                  <li key={message.id} className="py-4">
                    <article className={`rounded-lg px-4 py-3 ${isMine ? "bg-surface" : "bg-panel"}`}>
                      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                        <p className="text-sm font-medium text-fg">{resolveSenderLabel(message.sender, session.userId)}</p>
                        <time className="text-xs text-fg-3" dateTime={message.createdAt} title={new Date(message.createdAt).toLocaleString()}>{new Date(message.createdAt).toLocaleString()}</time>
                      </div>
                      <p className="mt-2 whitespace-pre-wrap break-words text-base text-fg">{message.body}</p>
                    </article>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
        <div className="shrink-0 border-t border-line bg-surface px-4 py-4 md:px-8">
          {/* The composer fills the panel, as a chat composer does; the
              conversation above it keeps the reading measure. */}
          <form onSubmit={sendMessage}>
            {error ? <p role="alert" className="mb-3 text-sm text-danger">{error}</p> : null}
            <label className="text-sm font-medium text-fg" htmlFor="message-body">Write a project update</label>
            <textarea id="message-body" className="portal-field mt-2 min-h-28" rows={4} maxLength={2000} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Type your message..." />
            <div className="mt-3 flex justify-end">
              <button className="portal-btn-primary" type="submit" disabled={busy || !body.trim()}>
                {busy ? "Sending…" : "Send"}
              </button>
            </div>
          </form>
        </div>
      </main>
    </PageShell>
  );
}
