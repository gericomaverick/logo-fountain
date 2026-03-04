"use client";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { ProjectTimeline } from "@/app/project-timeline";
import { HeaderNav } from "@/components/header-nav";
import { PageShell } from "@/components/page-shell";
import { ProjectStatusBadge } from "@/components/project-status-badge";
import { formatClientFirstName, getAreaCardSubtitle, getRemainingLabel } from "@/lib/project-overview";
import { buildActivityGroups, getMissionControlPrimaryCta, getPendingFeedbackCountForLatestConcept } from "@/lib/project-hub";

type EntitlementUsage = {
  limit: number;
  consumed: number;
  reserved?: number;
  remaining: number;
};

type Snapshot = {
  status: string;
  packageCode: string;
  createdAt?: string;
  updatedAt?: string;
  entitlements: { concepts: number; revisions: number };
  entitlementUsage?: {
    concepts?: EntitlementUsage;
    revisions?: EntitlementUsage;
  };
  concepts: Array<{ id: string; number: number; status: string; notes: string | null; imageUrl: string | null }>;
  revisionRequests?: Array<{ id: string; status: string; concept?: { id: string } | null }>;
  latestBrief?: { version: number; createdAt: string; answers: { brandName: string; industry: string; description: string; styleNotes: string } } | null;
  messages?: Array<{ id: string; kind?: string; body: string; createdAt: string }>;
  hasNewMessages?: boolean;
  hasNewConcepts?: boolean;
  finalZip: { available: boolean; url: string | null };
  primaryCta?: string | null;
  timeline?: Array<{ state: string; label: string; completed: boolean; current: boolean; timestamp?: string }>;
};

type SessionPayload = {
  authenticated: boolean;
  isAdmin?: boolean;
};

function readError(payload: { error?: { message?: string; details?: { nextStep?: string } } | string } | null, fallback: string): string {
  const err = payload?.error;
  const message = typeof err === "string" ? err : err?.message ?? fallback;
  const nextStep = typeof err === "string" ? undefined : err?.details?.nextStep;
  return nextStep ? `${message} — ${nextStep}` : message;
}

const DATE_TIME_FORMATTER = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

function formatDateTime(value?: string): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return DATE_TIME_FORMATTER.format(date);
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
  const [animatedRatio, setAnimatedRatio] = useState(stats.ratio);

  useEffect(() => {
    const next = stats.ratio;
    const raf = requestAnimationFrame(() => setAnimatedRatio(next));
    return () => cancelAnimationFrame(raf);
  }, [stats.ratio]);

  return (
    <article className="portal-subcard">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-neutral-900">{label}</h3>
        <p className="text-xs text-neutral-500">{stats.remaining} left</p>
      </div>
      <p className="mt-1 text-sm text-neutral-700">
        {stats.allocated} of {stats.limit} allocated
      </p>
      {stats.reserved > 0 ? (
        <p className="mt-0.5 text-xs text-neutral-500">
          {stats.consumed} delivered · {stats.reserved} pending
        </p>
      ) : null}
      <div className="mt-3 h-2 rounded-full bg-neutral-200">
        <div className={`h-2 rounded-full transition-all duration-700 ease-out ${fillClassName}`} style={{ width: `${animatedRatio}%` }} />
      </div>
    </article>
  );
}

function AreaCard({ title, href, hasNew, subtitle }: { title: string; href: string; hasNew?: boolean; subtitle?: string }) {
  return (
    <Link
      href={href}
      aria-label={`Open ${title}`}
      className="group rounded-xl border border-neutral-200 bg-white p-4 shadow-sm shadow-neutral-200/70 transition-all hover:-translate-y-0.5 hover:border-neutral-300 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300 focus-visible:ring-offset-2"
    >
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-neutral-900">{title}</h3>
        <div className="flex items-center gap-2">
          {hasNew ? <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">New</span> : null}
          <span className="rounded-md border border-neutral-300 px-2 py-0.5 text-xs font-medium text-neutral-700 transition-colors group-hover:border-violet-300 group-hover:text-violet-700">Open</span>
        </div>
      </div>
      <p className="mt-1 text-sm text-neutral-600">{getAreaCardSubtitle(title, subtitle)}</p>
    </Link>
  );
}

function ActivityPanel({ projectId, snapshot, pendingFeedbackCount }: { projectId: string; snapshot: Snapshot | null; pendingFeedbackCount: number }) {
  const nextAction = getMissionControlPrimaryCta(projectId, snapshot?.status ?? "", { pendingFeedbackCount });
  const groups = useMemo(() => buildActivityGroups(snapshot, 8), [snapshot]);

  return (
    <section className="mt-6 rounded-2xl border border-neutral-200 bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-neutral-900">Mission control</h2>
          <p className="mt-1 text-sm text-neutral-600">What needs attention now, plus a clean activity timeline.</p>
        </div>
        <Link href={nextAction.href} className="portal-btn-primary">
          {nextAction.label}
        </Link>
      </div>

      <div className={`mt-4 rounded-xl border p-3 text-sm ${pendingFeedbackCount > 0 ? "border-amber-200 bg-amber-50 text-amber-900" : "border-emerald-200 bg-emerald-50 text-emerald-900"}`}>
        {pendingFeedbackCount > 0 ? (
          <>Pending feedback on latest concept: <span className="font-semibold">{pendingFeedbackCount}</span></>
        ) : (
          <>No pending feedback on latest concept.</>
        )}
      </div>

      <div className="mt-5 space-y-4">
        {groups.map((group) => (
          <div key={group.dayLabel}>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">{group.dayLabel}</p>
            <ul className="space-y-2">
              {group.items.map((item) => (
                <li key={item.id} className={`rounded-lg border p-3 text-sm ${item.tone === "attention" ? "border-amber-200 bg-amber-50" : "border-neutral-200 bg-neutral-50"}`}>
                  <p className="text-neutral-900">{item.label}</p>
                  <p className="mt-1 text-xs text-neutral-500">{formatDateTime(item.at)}</p>
                </li>
              ))}
            </ul>
          </div>
        ))}
        {groups.length === 0 ? <p className="text-sm text-neutral-600">No activity yet.</p> : null}
      </div>
    </section>
  );
}

function UpsellPanel({
  projectId,
  packageCode,
  projectStatus,
  revisionUsage,
}: {
  projectId: string;
  packageCode: string | undefined;
  projectStatus: string | undefined;
  revisionUsage: ReturnType<typeof resolveUsage>;
}) {
  const [submitting, setSubmitting] = useState<"addon" | "upgrade" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);

  const upgradeTarget = packageCode === "essential" ? "professional" : packageCode === "professional" ? "complete" : null;
  const shouldOfferAddon = revisionUsage.remaining <= 0 || revisionUsage.reserved >= Math.max(revisionUsage.remaining, 1);
  const shouldOfferUpgrade = Boolean(upgradeTarget) && (revisionUsage.remaining <= 1 || revisionUsage.limit <= 2);
  const shouldRender = shouldOfferAddon || shouldOfferUpgrade;
  const inRelevantPhase = projectStatus === "CONCEPTS_READY" || projectStatus === "REVISIONS_IN_PROGRESS" || projectStatus === "AWAITING_APPROVAL";

  useEffect(() => {
    if (typeof window === "undefined") return;
    const key = `upsell:dismissed:${projectId}:${packageCode ?? "unknown"}`;
    const raw = window.sessionStorage.getItem(key);
    if (!raw) {
      setDismissed(false);
      return;
    }

    const expiresAt = Number.parseInt(raw, 10);
    if (Number.isFinite(expiresAt) && Date.now() < expiresAt) {
      setDismissed(true);
      return;
    }

    window.sessionStorage.removeItem(key);
    setDismissed(false);
  }, [packageCode, projectId]);

  if (!inRelevantPhase || !shouldRender || dismissed) return null;

  async function startPurchase(body: Record<string, unknown>, mode: "addon" | "upgrade") {
    setSubmitting(mode);
    setError(null);

    try {
      const res = await fetch(`/api/projects/${projectId}/checkout/session`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const payload = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(readError(payload, "Unable to start checkout"));
      }

      if (!payload?.url) throw new Error("Checkout URL missing");
      window.location.assign(payload.url as string);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to start checkout");
      setSubmitting(null);
    }
  }

  return (
    <section className="mt-6 rounded-2xl border border-violet-200 bg-violet-50 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-violet-950">Need more flexibility?</h2>
          <p className="mt-1 text-sm text-violet-900">
            {shouldOfferAddon
              ? "You’re at the revision limit for this stage. Add one extra revision now, or upgrade for more headroom."
              : "You’re getting close to your revision limit. Upgrade now to avoid interruptions later."}
          </p>
        </div>
        <button
          type="button"
          className="text-xs font-medium text-violet-900 underline underline-offset-2"
          onClick={() => {
            if (typeof window !== "undefined") {
              const key = `upsell:dismissed:${projectId}:${packageCode ?? "unknown"}`;
              window.sessionStorage.setItem(key, String(Date.now() + 1000 * 60 * 60 * 24));
            }
            setDismissed(true);
          }}
        >
          Not now
        </button>
      </div>
      <div className="mt-4 flex flex-wrap gap-3">
        {shouldOfferAddon ? (
          <button
            type="button"
            className="rounded-lg bg-violet-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
            onClick={() => void startPurchase({ kind: "addon", addonKey: "extra_revision" }, "addon")}
            disabled={submitting !== null}
          >
            {submitting === "addon" ? "Redirecting…" : "Buy extra revision (£49)"}
          </button>
        ) : null}

        {shouldOfferUpgrade && upgradeTarget ? (
          <button
            type="button"
            className="portal-btn-secondary border-violet-400 text-violet-900"
            onClick={() => void startPurchase({ kind: "upgrade", toPackage: upgradeTarget }, "upgrade")}
            disabled={submitting !== null}
          >
            {submitting === "upgrade"
              ? "Redirecting…"
              : `Upgrade to ${upgradeTarget === "professional" ? "Professional" : "Complete"} (${upgradeTarget === "professional" ? "£180" : "£225"})`}
          </button>
        ) : null}
      </div>
      {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
    </section>
  );
}

function UpsellPurchaseStatus({
  sessionId,
  kind,
}: {
  sessionId: string | null;
  kind: "addon" | "upgrade" | null;
}) {
  const [status, setStatus] = useState<"idle" | "pending" | "fulfilled" | "failed">("idle");
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!sessionId) {
      setStatus("idle");
      setMessage(null);
      return;
    }

    let cancelled = false;
    let timer: number | null = null;

    const poll = async (slow = false) => {
      if (cancelled) return;
      setStatus((prev) => (prev === "fulfilled" ? prev : "pending"));

      try {
        const res = await fetch(`/api/checkout/status?session_id=${encodeURIComponent(sessionId)}`, { cache: "no-store" });
        const payload = (await res.json().catch(() => null)) as { fulfilled?: boolean; status?: string } | null;

        if (!res.ok) throw new Error("Could not confirm purchase status.");

        if (payload?.fulfilled) {
          setStatus("fulfilled");
          setMessage(kind === "upgrade" ? "Upgrade confirmed. Your package and limits are updated." : "Add-on confirmed. Your extra revision is now available.");
          return;
        }

        setStatus("pending");
        setMessage("Payment received. We’re still waiting for confirmation from the webhook.");
        timer = window.setTimeout(() => void poll(true), slow ? 7000 : 2500);
      } catch {
        setStatus("failed");
        setMessage("Could not confirm purchase yet. Refresh the page in a moment.");
      }
    };

    void poll();

    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [kind, sessionId]);

  if (!sessionId || status === "idle") return null;

  return (
    <section className={`mt-4 rounded-xl border px-4 py-3 text-sm ${status === "fulfilled" ? "border-emerald-200 bg-emerald-50 text-emerald-900" : status === "failed" ? "border-rose-200 bg-rose-50 text-rose-900" : "border-amber-200 bg-amber-50 text-amber-900"}`}>
      <p className="font-medium">
        {status === "fulfilled" ? "Purchase confirmed" : status === "failed" ? "Purchase confirmation delayed" : "Confirming your purchase"}
      </p>
      {message ? <p className="mt-1">{message}</p> : null}
    </section>
  );
}

export default function ProjectPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const params = useParams<{ id: string }>();
  const projectId = params.id;
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [session, setSession] = useState<SessionPayload>({ authenticated: false });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [firstName, setFirstName] = useState<string | null>(null);

  async function refresh(id: string) {
    const [response, sessionRes, profileRes] = await Promise.all([
      fetch(`/api/projects/${id}`, { cache: "no-store" }),
      fetch("/api/auth/session", { cache: "no-store" }),
      fetch("/api/profile", { cache: "no-store" }),
    ]);

    const payload = await response.json().catch(() => null);
    if (!response.ok) throw new Error(readError(payload, "Failed to load project"));

    const sessionPayload = (await sessionRes.json().catch(() => null)) as SessionPayload | null;
    setSession(sessionPayload ?? { authenticated: false });
    setSnapshot(payload?.snapshot ?? null);

    if (profileRes.ok) {
      const profilePayload = (await profileRes.json().catch(() => null)) as { profile?: { firstName?: string | null } } | null;
      setFirstName(profilePayload?.profile?.firstName ?? null);
    }
  }

  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;

    const tick = async () => {
      try {
        await refresh(projectId);
        if (!cancelled) {
          setError(null);
          setLoading(false);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to load project");
          setLoading(false);
        }
      }
    };

    void tick();
    const timer = setInterval(() => void tick(), 3000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [projectId]);

  useEffect(() => {
    if (!snapshot) return;
    if (session.isAdmin) return;

    if (snapshot.status === "AWAITING_BRIEF") {
      router.replace(`/project/${projectId}/brief`);
    }
  }, [projectId, router, session.isAdmin, snapshot]);

  const conceptUsage = useMemo(
    () => resolveUsage(snapshot?.entitlementUsage?.concepts),
    [snapshot?.entitlementUsage?.concepts],
  );
  const revisionUsage = useMemo(
    () => resolveUsage(snapshot?.entitlementUsage?.revisions),
    [snapshot?.entitlementUsage?.revisions],
  );
  const latestConcept = snapshot?.concepts?.[0] ?? null;
  const pendingFeedbackCount = useMemo(
    () => getPendingFeedbackCountForLatestConcept(snapshot?.concepts ?? [], snapshot?.revisionRequests ?? []),
    [snapshot?.concepts, snapshot?.revisionRequests],
  );
  const nextAction = useMemo(
    () => getMissionControlPrimaryCta(projectId, snapshot?.status ?? "", { pendingFeedbackCount }),
    [pendingFeedbackCount, projectId, snapshot?.status],
  );
  const upsellSessionId = searchParams.get("upsell") === "1" ? searchParams.get("session_id")?.trim() ?? null : null;
  const upsellKind = useMemo(() => {
    const raw = searchParams.get("kind");
    return raw === "addon" || raw === "upgrade" ? raw : null;
  }, [searchParams]);
  const welcomeName = formatClientFirstName(firstName);

  return (
    <PageShell>
      <HeaderNav />
      <main className="mx-auto w-full max-w-[1160px] px-6 py-8 md:px-10">
        <section className="mt-3 portal-card">
          <div className="grid gap-4 lg:grid-cols-12">
            <div className="lg:col-span-12 rounded-xl border border-neutral-200 bg-neutral-50/60 p-4">
              <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
                <div>
                  <ProjectStatusBadge status={snapshot?.status ?? "UNKNOWN"} />
                  <h1 className="mt-3 text-2xl font-semibold text-neutral-900">Hey{welcomeName ? `, ${welcomeName}` : ""}</h1>
                  <p className="mt-1 text-sm text-neutral-600">Project overview · {projectId}</p>

                  <div className="mt-4 grid gap-2 text-sm text-neutral-700 sm:grid-cols-3">
                    <div className="rounded-lg border border-neutral-200 bg-white/80 px-3 py-2">
                      <p className="text-[11px] uppercase tracking-wide text-neutral-500">Package</p>
                      <p className="mt-1 font-medium text-neutral-900">{snapshot?.packageCode ?? "—"}</p>
                    </div>
                    <div className="rounded-lg border border-neutral-200 bg-white/80 px-3 py-2">
                      <p className="text-[11px] uppercase tracking-wide text-neutral-500">Created</p>
                      <p className="mt-1 font-medium text-neutral-900">{formatDateTime(snapshot?.createdAt)}</p>
                    </div>
                    <div className="rounded-lg border border-neutral-200 bg-white/80 px-3 py-2">
                      <p className="text-[11px] uppercase tracking-wide text-neutral-500">Last updated</p>
                      <p className="mt-1 font-medium text-neutral-900">{formatDateTime(snapshot?.updatedAt)}</p>
                    </div>
                  </div>
                </div>

                <div className="w-full rounded-lg border border-violet-200 bg-violet-50 px-4 py-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-violet-800">Next action</p>
                  <p className="mt-1 text-sm text-violet-950">Do this first to keep your project moving.</p>
                  <Link href={nextAction.href} className="mt-3 inline-flex w-full items-center justify-center rounded-lg bg-violet-700 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-violet-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300 focus-visible:ring-offset-2">
                    {nextAction.label}
                  </Link>
                  <div className={`mt-3 rounded-lg border px-3 py-2 text-xs ${pendingFeedbackCount > 0 ? "border-amber-200 bg-amber-50 text-amber-900" : "border-emerald-200 bg-emerald-50 text-emerald-900"}`}>
                    Pending feedback: <span className="font-semibold">{pendingFeedbackCount}</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3 lg:col-span-12">
              <AreaCard title="Brief" href={`/project/${projectId}/brief`} subtitle={snapshot?.latestBrief ? `Latest: v${snapshot.latestBrief.version}` : "Submit your project brief"} />
              <AreaCard title="Concepts" href={`/project/${projectId}/concepts`} hasNew={snapshot?.hasNewConcepts} subtitle={snapshot?.hasNewConcepts ? "New concepts/revisions available" : undefined} />
              <AreaCard title="Messages" href={`/project/${projectId}/messages`} hasNew={snapshot?.hasNewMessages} subtitle={snapshot?.hasNewMessages ? "Unread updates waiting" : undefined} />
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:col-span-8">
              <EntitlementProgress label="Concepts" usage={snapshot?.entitlementUsage?.concepts} fillClassName="bg-gradient-to-r from-indigo-600 to-sky-500" />
              <EntitlementProgress label="Revisions" usage={snapshot?.entitlementUsage?.revisions} fillClassName="bg-gradient-to-r from-fuchsia-600 to-violet-500" />
            </div>

            <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-3 lg:col-span-4">
              <div className="flex items-center justify-between">
                <p className="text-xs uppercase tracking-wide text-neutral-500">Latest concept</p>
                <Link className="text-xs font-medium text-neutral-700 portal-link no-underline" href={`/project/${projectId}/concepts`}>View all</Link>
              </div>

              <div className="mt-2 grid gap-2 sm:grid-cols-[minmax(0,1fr)_164px]">
                {latestConcept?.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={latestConcept.imageUrl} alt={`Latest concept #${latestConcept.number}`} className="h-36 w-full rounded-lg border border-neutral-200 object-cover" />
                ) : (
                  <div className="flex h-36 items-center justify-center rounded-lg border border-dashed border-neutral-300 text-xs text-neutral-500">
                    No concept preview yet
                  </div>
                )}

                <div className="rounded-lg border border-neutral-200 bg-white px-3 py-2">
                  <p className="text-[11px] uppercase tracking-wide text-neutral-500">Usage status</p>
                  <div className="mt-2 space-y-2 text-sm text-neutral-900">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-neutral-600">Concepts</span>
                      <span className="font-semibold">{getRemainingLabel(conceptUsage.remaining, "concept")}</span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-neutral-600">Revisions</span>
                      <span className="font-semibold">{getRemainingLabel(revisionUsage.remaining, "revision")}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <UpsellPurchaseStatus sessionId={upsellSessionId} kind={upsellKind} />
          <UpsellPanel projectId={projectId} packageCode={snapshot?.packageCode} projectStatus={snapshot?.status} revisionUsage={revisionUsage} />
        </section>

        {loading ? <p className="mt-4 text-sm text-neutral-600">Loading…</p> : null}
        {error ? <p className="mt-4 text-sm text-red-600">{error}</p> : null}

        <ActivityPanel projectId={projectId} snapshot={snapshot} pendingFeedbackCount={pendingFeedbackCount} />

        {snapshot?.timeline ? <ProjectTimeline timeline={snapshot.timeline} primaryCta={snapshot.primaryCta} /> : null}

        {snapshot?.status === "FINAL_FILES_READY" && snapshot?.finalZip.url ? (
          <section id="final-files" className="mt-10 rounded border border-neutral-200 p-4">
            <h2 className="text-lg font-medium">Final files</h2>
            <p className="mt-3 text-sm">
              <a className="portal-link no-underline" href={snapshot.finalZip.url} target="_blank" rel="noreferrer">
                Download final ZIP
              </a>
            </p>
          </section>
        ) : null}
      </main>
    </PageShell>
  );
}
