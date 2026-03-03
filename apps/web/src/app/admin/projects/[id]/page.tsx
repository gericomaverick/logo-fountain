"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

import { ProjectTimeline } from "@/app/project-timeline";
import { HeaderNav } from "@/components/header-nav";
import { ProjectStatusBadge } from "@/components/project-status-badge";

type EntitlementUsage = { limit: number; consumed: number; reserved?: number; remaining: number };

type Snapshot = {
  status: string;
  stuck?: boolean;
  stuckReason?: string | null;
  latestOrder?: { id: string; status: string; stripeCheckoutSessionId: string | null; createdAt: string } | null;
  concepts: Array<{ id: string; number: number; status: string; notes: string | null; imageUrl?: string | null }>;
  revisionRequests: Array<{ id: string; status: string; body: string; createdAt: string; concept: { id: string; number: number } | null; user: { email: string; fullName: string | null } }>;
  entitlements: { concepts: number; revisions: number };
  entitlementUsage?: {
    concepts?: EntitlementUsage;
    revisions?: EntitlementUsage;
  };
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

function resolveUsage(usage: EntitlementUsage | undefined) {
  const limit = Math.max(usage?.limit ?? 0, 0);
  const consumed = Math.max(usage?.consumed ?? 0, 0);
  const reserved = Math.max(usage?.reserved ?? 0, 0);
  const allocated = Math.min(consumed + reserved, limit);
  const remaining = Math.max(limit - consumed - reserved, 0);
  const ratio = limit > 0 ? Math.min((allocated / limit) * 100, 100) : 0;

  return { limit, consumed, reserved, allocated, remaining, ratio };
}

function EntitlementProgress({
  label,
  usage,
  fillClassName,
}: {
  label: string;
  usage: EntitlementUsage | undefined;
  fillClassName: string;
}) {
  const stats = resolveUsage(usage);
  const [animatedRatio, setAnimatedRatio] = useState(0);

  useEffect(() => {
    const next = stats.ratio;
    setAnimatedRatio(0);
    const raf = requestAnimationFrame(() => setAnimatedRatio(next));
    return () => cancelAnimationFrame(raf);
  }, [stats.ratio]);

  return (
    <article className="rounded-xl border border-neutral-200 bg-white p-4 text-sm">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-semibold text-neutral-900">{label}</h3>
        <p className="text-xs text-neutral-500">{stats.remaining} left</p>
      </div>
      <p className="mt-1 text-neutral-700">{stats.allocated} of {stats.limit} allocated</p>
      {stats.reserved > 0 ? <p className="mt-0.5 text-xs text-neutral-500">{stats.consumed} delivered · {stats.reserved} pending</p> : null}
      <div className="mt-2 h-2 rounded-full bg-neutral-200">
        <div className={`h-2 rounded-full transition-all duration-700 ease-out ${fillClassName}`} style={{ width: `${animatedRatio}%` }} />
      </div>
    </article>
  );
}

export default function AdminProjectPage() {
  const params = useParams<{ id: string }>();
  const projectId = params.id;
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reprocessSessionId, setReprocessSessionId] = useState("");
  const [conceptLimit, setConceptLimit] = useState("");
  const [revisionLimit, setRevisionLimit] = useState("");

  async function refresh(id: string) {
    const [snapshotResponse, auditResponse] = await Promise.all([
      fetch(`/api/admin/projects/${id}`, { cache: "no-store" }),
      fetch(`/api/admin/projects/${id}/audit`, { cache: "no-store" }),
    ]);

    const snapshotPayload = await snapshotResponse.json().catch(() => null);
    const auditPayload = await auditResponse.json().catch(() => null);

    if (!snapshotResponse.ok) throw new Error(readError(snapshotPayload, "Failed to load"));
    if (!auditResponse.ok) throw new Error(readError(auditPayload, "Failed to load audit log"));

    const nextSnapshot = snapshotPayload?.snapshot ?? null;
    setSnapshot(nextSnapshot);
    setAuditEvents(auditPayload?.events ?? []);

    if (nextSnapshot) {
      setConceptLimit(String(nextSnapshot.entitlementUsage?.concepts?.limit ?? ""));
      setRevisionLimit(String(nextSnapshot.entitlementUsage?.revisions?.limit ?? ""));
    }
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

  async function saveEntitlementOverrides() {
    if (!projectId) return;
    const concepts = conceptLimit.trim() === "" ? null : Number.parseInt(conceptLimit, 10);
    const revisions = revisionLimit.trim() === "" ? null : Number.parseInt(revisionLimit, 10);

    if ((conceptLimit.trim() !== "" && !Number.isInteger(concepts)) || (revisionLimit.trim() !== "" && !Number.isInteger(revisions))) {
      setError("Entitlement limits must be integers (or blank for null).");
      return;
    }

    await runAction(
      () =>
        fetch(`/api/admin/projects/${projectId}/entitlements`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ concepts, revisions }),
        }),
      "Failed to update entitlements",
    );
  }

  return (
    <>
      <HeaderNav />
      <main className="mx-auto w-full max-w-[1160px] px-6 py-8 md:px-10">
        <p className="text-sm"><Link href="/admin" className="underline">← Back to dashboard</Link></p>

        <section className="mt-3 rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <ProjectStatusBadge status={snapshot?.status ?? "UNKNOWN"} />
              <h1 className="mt-3 text-2xl font-semibold">Admin project</h1>
              <p className="mt-1 text-sm text-neutral-600">Project {projectId}</p>
              <p className="mt-1 text-sm text-neutral-600">Recent audit events: {snapshot?.recentAuditEventsCount ?? 0}</p>
            </div>
            <div className="flex flex-col gap-2 sm:items-end">
              <Link className="rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-sm" href={`/admin/projects/${projectId}/messages`}>
                Open messages
              </Link>
              <Link className="rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-sm" href={`/admin/projects/${projectId}/brief`}>
                View brief
              </Link>
              <Link className="rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-sm" href={`/admin/projects/${projectId}/concepts`}>
                Concepts manager
              </Link>
              <Link className="rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-sm" href={`/admin/projects/${projectId}/upload`}>
                Legacy upload
              </Link>
            </div>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <EntitlementProgress label="Concepts" usage={snapshot?.entitlementUsage?.concepts} fillClassName="bg-gradient-to-r from-indigo-600 to-sky-500" />
            <EntitlementProgress label="Revisions" usage={snapshot?.entitlementUsage?.revisions} fillClassName="bg-gradient-to-r from-fuchsia-600 to-violet-500" />
          </div>

          <div className="mt-4 rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm">
            <p className="text-xs uppercase tracking-wide text-neutral-500">Admin entitlement override</p>
            <div className="mt-2 grid gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1">
                <span className="text-xs text-neutral-600">Concept limitInt</span>
                <input className="rounded border border-neutral-300 bg-white px-2 py-1" value={conceptLimit} onChange={(e) => setConceptLimit(e.target.value)} placeholder="e.g. 3" inputMode="numeric" />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs text-neutral-600">Revision limitInt</span>
                <input className="rounded border border-neutral-300 bg-white px-2 py-1" value={revisionLimit} onChange={(e) => setRevisionLimit(e.target.value)} placeholder="e.g. 2" inputMode="numeric" />
              </label>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <button className="rounded border border-neutral-300 bg-white px-3 py-1" type="button" disabled={busy} onClick={() => void saveEntitlementOverrides()}>
                Save entitlement override
              </button>
              <button
                className="rounded border border-neutral-300 bg-white px-3 py-1"
                type="button"
                disabled={busy}
                onClick={() => {
                  if (!window.confirm("Reset concepts used to 0? This is for testing only.")) return;
                  void runAction(
                    () =>
                      fetch(`/api/admin/projects/${projectId}/entitlements/reset`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ key: "concepts" }),
                      }),
                    "Failed to reset concepts usage",
                  );
                }}
              >
                Reset concepts used → 0
              </button>
              <button
                className="rounded border border-neutral-300 bg-white px-3 py-1 text-rose-700"
                type="button"
                disabled={busy}
                onClick={() => {
                  if (!window.confirm("Reset revisions used to 0? This is for testing only.")) return;
                  void runAction(
                    () =>
                      fetch(`/api/admin/projects/${projectId}/entitlements/reset`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ key: "revisions", confirm: true }),
                      }),
                    "Failed to reset revisions usage",
                  );
                }}
              >
                Reset revisions used → 0
              </button>
              <button
                className="rounded border border-rose-300 bg-rose-50 px-3 py-1 font-medium text-rose-700"
                type="button"
                disabled={busy}
                onClick={() => {
                  if (!window.confirm("Full project reset? This deletes concepts, revisions, concept comments, and all non-system messages. This is irreversible.")) return;
                  if (!window.confirm("Final confirmation: reset this project to a clean-slate baseline?")) return;
                  void runAction(
                    () =>
                      fetch(`/api/admin/projects/${projectId}/reset`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ confirm: true, mode: "clean-slate" }),
                      }),
                    "Failed to reset project",
                  );
                }}
              >
                Reset project (clean slate)
              </button>
            </div>
          </div>

          {snapshot?.stuck ? (
            <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">⚠ Stuck: {snapshot.stuckReason ?? "Needs manual intervention."}</p>
          ) : null}
          {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
        </section>

        {snapshot?.timeline ? <ProjectTimeline timeline={snapshot.timeline} primaryCta={snapshot.primaryCta} /> : null}

        {snapshot?.stuck ? (
          <section className="mt-6 rounded border border-red-200 bg-red-50 p-4">
            <h2 className="text-lg font-medium text-red-800">Webhook recovery</h2>
            <p className="mt-1 text-sm text-red-700">Use Stripe Checkout session id to retry idempotent fulfillment.</p>
            <input className="mt-2 w-full rounded border border-red-200 bg-white px-2 py-1 text-sm" placeholder="cs_test_..." value={reprocessSessionId} onChange={(e) => setReprocessSessionId(e.target.value)} />
            {snapshot.latestOrder?.stripeCheckoutSessionId ? <p className="mt-1 text-xs text-red-700">Latest order session: {snapshot.latestOrder.stripeCheckoutSessionId}</p> : null}
            <button className="mt-3 rounded border border-red-300 bg-white px-3 py-1 text-sm" type="button" disabled={busy || !reprocessSessionId.trim()} onClick={() => void runAction(() => fetch("/api/admin/checkout/reprocess", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ session_id: reprocessSessionId.trim() }) }), "Reprocess failed")}>
              Reprocess checkout session
            </button>
          </section>
        ) : null}

        {(snapshot?.revisionRequests ?? []).some((r) => r.status !== "delivered") ? (
          <section className="mt-8 rounded border border-neutral-200 p-4">
            <h2 className="text-lg font-medium">Outstanding revision requests</h2>
            <p className="mt-1 text-sm text-neutral-600">Client feedback waiting for a designer response.</p>
            <ul className="mt-4 space-y-3">
              {(snapshot?.revisionRequests ?? [])
                .filter((r) => r.status !== "delivered")
                .map((r) => {
                  const concept = snapshot?.concepts.find((c) => c.id === r.concept?.id) ?? null;
                  return (
                    <li key={r.id} className="rounded-xl border border-neutral-200 bg-white p-4 text-sm">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="text-xs text-neutral-500">{r.user.fullName ?? r.user.email} · {new Date(r.createdAt).toLocaleString()}</p>
                          <p className="mt-2 whitespace-pre-wrap text-neutral-800">{r.body}</p>
                        </div>
                        <div className="flex items-center gap-3">
                          {concept?.imageUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img className="h-16 w-16 rounded-lg border border-neutral-200 object-cover" src={concept.imageUrl} alt={`Concept ${concept.number}`} />
                          ) : (
                            <div className="h-16 w-16 rounded-lg border border-neutral-200 bg-neutral-50" aria-hidden />
                          )}
                          <Link className="text-sm underline" href={`/admin/projects/${projectId}/concepts`}>
                            View concept #{concept?.number ?? "—"}
                          </Link>
                        </div>
                      </div>
                      <button
                        className="mt-3 rounded border border-neutral-300 px-2 py-1"
                        disabled={busy}
                        onClick={() =>
                          void runAction(
                            () =>
                              fetch(`/api/admin/projects/${projectId}/revision-requests/${r.id}/delivered`, {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ setConceptsReady: true }),
                              }),
                            "Failed to mark delivered",
                          )
                        }
                      >
                        Mark delivered
                      </button>
                    </li>
                  );
                })}
            </ul>
          </section>
        ) : null}

        <section className="mt-8 rounded border border-neutral-200 p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-medium">Concepts</h2>
              <p className="mt-1 text-sm text-neutral-600">Published concepts visible to the client.</p>
            </div>
            <Link className="text-sm underline" href={`/admin/projects/${projectId}/concepts`}>Open concepts manager + quick actions</Link>
          </div>

          {loading ? <p className="mt-3 text-sm text-neutral-600">Loading…</p> : null}
          <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {(snapshot?.concepts ?? []).map((concept) => {
              const pendingRevisionCount = (snapshot?.revisionRequests ?? []).filter((r) => r.status !== "delivered" && r.concept?.id === concept.id).length;

              return (
                <li key={concept.id} className="rounded-xl border border-neutral-200 bg-white p-3 text-sm">
                  {concept.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img className="h-36 w-full rounded-lg border border-neutral-200 object-cover" src={concept.imageUrl} alt={`Concept ${concept.number}`} />
                  ) : (
                    <div className="h-36 w-full rounded-lg border border-neutral-200 bg-neutral-50" aria-hidden />
                  )}
                  <div className="mt-3 flex items-center justify-between gap-2">
                    <p className="font-medium">#{concept.number}</p>
                    <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-medium text-neutral-700">{concept.status}</span>
                  </div>
                  {pendingRevisionCount > 0 ? (
                    <p className="mt-2 inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900">{pendingRevisionCount} pending revision request{pendingRevisionCount === 1 ? "" : "s"}</p>
                  ) : null}
                  <div className="mt-2 flex items-center justify-between gap-2 text-xs">
                    <Link className="underline" href={`/project/${projectId}/concept/${concept.id}?from=admin`}>Open discussion</Link>
                    <Link className="underline" href={`/admin/projects/${projectId}/concepts#concept-${concept.id}`}>Quick actions</Link>
                  </div>
                </li>
              );
            })}
            {!loading && (snapshot?.concepts?.length ?? 0) === 0 ? <li className="text-sm text-neutral-600">No concepts yet.</li> : null}
          </ul>
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
    </>
  );
}
