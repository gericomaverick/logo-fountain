"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

import { HeaderNav } from "@/components/header-nav";
import { PageShell } from "@/components/page-shell";
import { EmptyLine, PageHeader, relativeTime } from "@/components/ui";
import { summarizeAuditPayload } from "@/lib/admin-audit";

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

export default function AdminProjectAuditPage() {
  const params = useParams<{ id: string }>();
  const projectId = params.id;

  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!projectId) return;

    let cancelled = false;
    const tick = async () => {
      try {
        const res = await fetch(`/api/admin/projects/${projectId}/audit`, { cache: "no-store" });
        const payload = await res.json().catch(() => null);
        if (!res.ok) throw new Error(readError(payload, "Failed to load audit trail"));
        if (!cancelled) {
          setEvents(payload?.events ?? []);
          setError(null);
          setLoading(false);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to load audit trail");
          setLoading(false);
        }
      }
    };

    void tick();
    const timer = setInterval(() => void tick(), 2500);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [projectId]);

  return (
    <PageShell>
      <HeaderNav />
      <PageHeader crumbs={[{ label: "Queue", href: "/admin" }, { label: "Project overview", href: `/admin/projects/${projectId}` }, { label: "Audit trail" }]} />
      <main className="mx-auto w-full max-w-[1400px] px-4 pb-10 md:px-8 lg:px-10">
        <div className="pb-5 pt-8">
          <h1 className="text-3xl font-semibold tracking-tight text-fg">Admin audit trail</h1>
          <p className="mt-1 text-base text-fg-2">Immutable activity log for this project.</p>
        </div>
        {error ? <p role="alert" className="mb-4 text-sm text-danger">{error}</p> : null}
        <section aria-label="Audit events" className="rounded-xl border border-line bg-panel">
          <div className="flex h-11 items-center justify-between gap-3 rounded-t-xl border-b border-line bg-surface px-4 text-sm font-semibold text-fg">
            <h2>Activity</h2>
            <span className="font-normal tabular-nums text-fg-3">{events.length} event{events.length === 1 ? "" : "s"}</span>
          </div>
          {loading ? <div className="p-4"><EmptyLine>Loading…</EmptyLine></div> : null}
          <ul>
            {events.map((event) => (
              <li key={event.id} className="border-b border-line px-4 py-4 transition-colors last:rounded-b-xl last:border-b-0 hover:bg-surface">
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <p className="break-all text-base font-medium text-fg">{event.type}</p>
                  <time className="text-xs text-fg-3" dateTime={event.createdAt} title={new Date(event.createdAt).toLocaleString()}>{relativeTime(new Date(event.createdAt))}</time>
                </div>
                <p className="mt-1 break-words text-base text-fg-2">{summarizeAuditPayload(event.payload)}</p>
                <p className="mt-2 break-all text-sm text-fg-3">{event.actor?.email ?? "System"}</p>
              </li>
            ))}
          </ul>
          {!loading && events.length === 0 ? <div className="p-4"><EmptyLine>No audit events yet.</EmptyLine></div> : null}
        </section>
      </main>
    </PageShell>
  );
}
