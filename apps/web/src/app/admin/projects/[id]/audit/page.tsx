"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

import { HeaderNav } from "@/components/header-nav";
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
    <>
      <HeaderNav />
      <main className="mx-auto w-full max-w-[1160px] px-6 py-8 md:px-10">
        <p className="text-sm">
          <Link href={`/admin/projects/${projectId}`} className="portal-link no-underline">
            ← Back to project overview
          </Link>
        </p>

        <section className="mt-3 portal-card">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-2xl font-semibold">Admin audit trail</h1>
              <p className="mt-1 text-sm text-neutral-600">Immutable activity log for this project.</p>
            </div>
            <p className="rounded-full border border-neutral-200 bg-neutral-50 px-3 py-1 text-xs font-medium text-neutral-700">
              {events.length} event{events.length === 1 ? "" : "s"}
            </p>
          </div>

          {loading ? <p className="mt-4 text-sm text-neutral-600">Loading…</p> : null}
          {error ? <p className="mt-4 text-sm text-red-600">{error}</p> : null}

          <ul className="mt-4 space-y-3">
            {events.map((event) => (
              <li key={event.id} className="rounded-xl border border-neutral-200 bg-neutral-50 p-4 text-sm">
                <p className="text-xs text-neutral-500">{new Date(event.createdAt).toLocaleString()} · {event.actor?.email ?? "System"}</p>
                <p className="mt-1 font-medium text-neutral-900">{event.type}</p>
                <p className="mt-1 text-neutral-700">{summarizeAuditPayload(event.payload)}</p>
              </li>
            ))}
            {!loading && events.length === 0 ? <li className="text-sm text-neutral-500">No audit events yet.</li> : null}
          </ul>
        </section>
      </main>
    </>
  );
}
