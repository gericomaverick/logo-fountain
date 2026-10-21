"use client";

import { HeaderNav } from "@/components/header-nav";
import { PageShell } from "@/components/page-shell";
import { EmptyLine, PageHeader } from "@/components/ui";
import { groupMessagesByDay, resolveSenderLabel, shouldSendOnKey, sortMessagesNewestLast, type ChatMessage } from "@/lib/chat-messages";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

type Message = ChatMessage;

const CLOCK = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit" });

type SessionPayload = {
  authenticated: boolean;
  userId?: string;
  isAdmin?: boolean;
};

function readError(payload: { error?: { message?: string; details?: { nextStep?: string } } | string } | null, fallback: string): string {
  const err = payload?.error;
  const message = typeof err === "string" ? err : err?.message ?? fallback;
  const nextStep = typeof err === "string" ? undefined : err?.details?.nextStep;
  return nextStep ? `${message} — ${nextStep}` : message;
}

export default function ProjectMessagesPage() {
  const params = useParams<{ id: string }>();
  const projectId = params.id;
  const [messages, setMessages] = useState<Message[]>([]);
  const [session, setSession] = useState<SessionPayload>({ authenticated: false });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const sorted = useMemo(() => sortMessagesNewestLast(messages), [messages]);
  // One date between days beats a full date stamped on every line. The day is
  // fixed per render so the server and the browser cannot disagree about it.
  const days = useMemo(() => groupMessagesByDay(sorted, new Date()), [sorted]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [sorted.length]);

  async function refresh(id: string) {
    const [messagesRes, sessionRes] = await Promise.all([
      fetch(`/api/projects/${id}/messages`, { cache: "no-store" }),
      fetch("/api/auth/session", { cache: "no-store" }),
      fetch(`/api/projects/${id}/read-state`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ area: "messages" }),
      }),
    ]);

    const messagesPayload = await messagesRes.json().catch(() => null);
    if (!messagesRes.ok) throw new Error(readError(messagesPayload, "Failed to load messages"));

    const sessionPayload = await sessionRes.json().catch(() => null);
    setSession((sessionPayload ?? { authenticated: false }) as SessionPayload);
    setMessages((messagesPayload?.messages ?? []) as Message[]);
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

  // Called by the form and by Enter in the composer, which has no event to stop.
  async function sendMessage(e?: React.FormEvent) {
    e?.preventDefault();
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
        crumbs={[{ label: "Projects", href: "/dashboard" }, { label: "Project", href: `/project/${projectId}` }, { label: "Messages" }]}
        actions={<Link className="portal-btn-ghost" href={`/project/${projectId}`}>Back to project overview</Link>}
      />
      <main className="flex h-[calc(100%-3.5rem)] min-h-0 flex-col">
        <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-6 md:px-8">
          {/* Full width, the way a chat window is. The measure is kept by the
              bubbles, which cap at a readable line length wherever the window
              ends — not by a column down the middle of an empty page. */}
          <h1 className="sr-only">Project messages</h1>
          {loading ? <EmptyLine>Loading…</EmptyLine> : null}
          {!loading && sorted.length === 0 ? (
            <EmptyLine>No messages yet — say hello, or ask your designer anything.</EmptyLine>
          ) : null}

          {days.map((day) => (
            <section key={day.key} aria-label={day.label}>
              <h2 className="sticky top-0 z-10 -mx-4 mb-4 bg-panel/85 px-4 py-1 text-center font-mono text-xs text-fg-2 backdrop-blur md:-mx-8 md:px-8">
                {day.label}
              </h2>
              <ul className="space-y-4 pb-4" aria-label={`Messages on ${day.label}`}>
                {day.messages.map((message) => {
                  if (message.kind === "system") {
                    return (
                      <li key={message.id} className="flex justify-center">
                        <p className="max-w-[60ch] text-center text-sm text-fg-2">
                          {message.body}
                          {" "}
                          <time className="text-fg-3" dateTime={message.createdAt} title={new Date(message.createdAt).toLocaleString()}>
                            {CLOCK.format(new Date(message.createdAt))}
                          </time>
                        </p>
                      </li>
                    );
                  }

                  const isMine = Boolean(session.userId && message.sender.id === session.userId);
                  return (
                    <li key={message.id} className={`flex ${isMine ? "justify-end" : "justify-start"}`}>
                      <article className={`max-w-[min(46rem,88%)] ${isMine ? "text-right" : ""}`}>
                        <div className={`flex flex-wrap items-baseline gap-x-2 ${isMine ? "justify-end" : ""}`}>
                          <p className="text-sm font-medium text-fg">{resolveSenderLabel(message.sender, session.userId)}</p>
                          <time className="font-mono text-xs text-fg-2" dateTime={message.createdAt} title={new Date(message.createdAt).toLocaleString()}>
                            {CLOCK.format(new Date(message.createdAt))}
                          </time>
                        </div>
                        <p
                          className={`mt-1 inline-block whitespace-pre-wrap break-words rounded-2xl px-4 py-3 text-left text-base ${
                            isMine
                              ? "rounded-tr-sm bg-accent text-[var(--accent-fg)]"
                              : "rounded-tl-sm border border-line bg-surface text-fg"
                          }`}
                        >
                          {message.body}
                        </p>
                      </article>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>

        <div className="shrink-0 border-t border-line bg-surface px-4 py-4 md:px-8">
          {/* Enter sends. Anyone who has used a chat window will try it, and
              being told so under the box is cheaper than finding out. */}
          <form onSubmit={sendMessage}>
            {error ? <p role="alert" className="mb-3 text-sm text-danger">{error}</p> : null}
            <label className="sr-only" htmlFor="message-body">Write a message</label>
            <div className="flex items-end gap-3">
              <textarea
                id="message-body"
                className="portal-field min-h-20 flex-1"
                rows={2}
                maxLength={2000}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                onKeyDown={(e) => {
                  if (!shouldSendOnKey({ key: e.key, shiftKey: e.shiftKey, ctrlKey: e.ctrlKey, metaKey: e.metaKey, altKey: e.altKey, isComposing: e.nativeEvent.isComposing })) return;
                  e.preventDefault();
                  void sendMessage();
                }}
                placeholder="Type your message…"
              />
              <button className="portal-btn-primary h-11 shrink-0 px-5" type="submit" disabled={busy || !body.trim()}>
                {busy ? "Sending…" : "Send"}
              </button>
            </div>
            <p className="mt-2 font-mono text-xs text-fg-2">Enter to send · Shift + Enter for a new line</p>
          </form>
        </div>
      </main>
    </PageShell>
  );
}
