"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { ProjectTimeline } from "@/app/project-timeline";
import { HeaderNav } from "@/components/header-nav";
import { PageShell } from "@/components/page-shell";
import { ProjectStatusBadge } from "@/components/project-status-badge";
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
  const [animatedRatio, setAnimatedRatio] = useState(0);

  useEffect(() => {
    const next = stats.ratio;
    setAnimatedRatio(0);
    const raf = requestAnimationFrame(() => setAnimatedRatio(next));
    return () => cancelAnimationFrame(raf);
  }, [stats.ratio]);

  return (
    <article className="rounded-xl border border-neutral-200 bg-neutral-50 p-4">
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
    <Link href={href} className="rounded-xl border border-neutral-200 bg-neutral-50 p-4 transition hover:border-neutral-300 hover:bg-white">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-neutral-900">{title}</h3>
        {hasNew ? <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">New</span> : null}
      </div>
      <p className="mt-1 text-sm text-neutral-600">{subtitle ?? `Open ${title.toLowerCase()}`}</p>
    </Link>
  );
}

function ActivityPanel({ projectId, snapshot, pendingFeedbackCount }: { projectId: string; snapshot: Snapshot | null; pendingFeedbackCount: number }) {
  const nextAction = getMissionControlPrimaryCta(projectId, snapshot?.status ?? "", { pendingFeedbackCount });
  const groups = useMemo(() => buildActivityGroups(snapshot, 6), [snapshot]);

  return (
    <section className="mt-8 rounded-2xl border border-neutral-200 bg-white p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-neutral-900">Mission control</h2>
          <p className="mt-1 text-sm text-neutral-600">Recent milestones, latest system updates, and the next best action.</p>
        </div>
        <Link href={nextAction.href} className="inline-flex rounded-lg bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white">
          {nextAction.label}
        </Link>
      </div>

      <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
        Pending feedback on latest concept: <span className="font-semibold">{pendingFeedbackCount}</span>
      </div>

      <div className="mt-5 space-y-4">
        {groups.map((group) => (
          <div key={group.dayLabel}>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">{group.dayLabel}</p>
            <ul className="space-y-2">
              {group.items.map((item) => (
                <li key={item.id} className="rounded-lg border border-neutral-200 bg-neutral-50 p-3 text-sm">
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
  revisionUsage,
}: {
  projectId: string;
  packageCode: string | undefined;
  revisionUsage: ReturnType<typeof resolveUsage>;
}) {
  const [submitting, setSubmitting] = useState<"addon" | "upgrade" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isLow = revisionUsage.remaining <= 1 || revisionUsage.reserved >= Math.max(revisionUsage.limit - 1, 1);
  const upgradeTarget = packageCode === "essential" ? "professional" : packageCode === "professional" ? "complete" : null;

  if (!isLow && !upgradeTarget) return null;

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
      <h2 className="text-lg font-semibold text-violet-950">Need more flexibility?</h2>
      <p className="mt-1 text-sm text-violet-900">
        You’re running low on revision capacity. Buy an extra revision for £49, or upgrade your package.
      </p>
      <div className="mt-4 flex flex-wrap gap-3">
        {isLow ? (
          <button
            type="button"
            className="rounded-lg bg-violet-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
            onClick={() => void startPurchase({ kind: "addon", addonKey: "extra_revision" }, "addon")}
            disabled={submitting !== null}
          >
            {submitting === "addon" ? "Redirecting…" : "Buy extra revision (£49)"}
          </button>
        ) : null}

        {upgradeTarget ? (
          <button
            type="button"
            className="rounded-lg border border-violet-400 bg-white px-3 py-2 text-sm font-medium text-violet-900 disabled:opacity-60"
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

export default function ProjectPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const projectId = params.id;
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [session, setSession] = useState<SessionPayload>({ authenticated: false });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function refresh(id: string) {
    const [response, sessionRes] = await Promise.all([
      fetch(`/api/projects/${id}`, { cache: "no-store" }),
      fetch("/api/auth/session", { cache: "no-store" }),
    ]);

    const payload = await response.json().catch(() => null);
    if (!response.ok) throw new Error(readError(payload, "Failed to load project"));

    const sessionPayload = (await sessionRes.json().catch(() => null)) as SessionPayload | null;
    setSession(sessionPayload ?? { authenticated: false });
    setSnapshot(payload?.snapshot ?? null);
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

  return (
    <PageShell>
      <HeaderNav />
      <main className="mx-auto w-full max-w-[1160px] px-6 py-8 md:px-10">
        <section className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
          <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
            <div>
              <ProjectStatusBadge status={snapshot?.status ?? "UNKNOWN"} />
              <h1 className="mt-3 text-2xl font-semibold text-neutral-900">Project overview</h1>
              <p className="mt-1 text-sm text-neutral-600">Project {projectId}</p>
              <p className="text-sm text-neutral-600">Package: {snapshot?.packageCode ?? "—"}</p>
            </div>

            <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-3">
              <div className="flex items-center justify-between">
                <p className="text-xs uppercase tracking-wide text-neutral-500">Latest concept</p>
                <Link className="text-xs font-medium text-neutral-700 underline" href={`/project/${projectId}/concepts`}>View all</Link>
              </div>
              {latestConcept?.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={latestConcept.imageUrl} alt={`Latest concept #${latestConcept.number}`} className="mt-2 h-36 w-full rounded-lg border border-neutral-200 object-cover" />
              ) : (
                <div className="mt-2 flex h-36 items-center justify-center rounded-lg border border-dashed border-neutral-300 text-xs text-neutral-500">
                  No concept preview yet
                </div>
              )}
              <p className="mt-2 text-xs text-neutral-600">Pending feedback: <span className="font-semibold text-neutral-900">{pendingFeedbackCount}</span></p>
            </div>
          </div>

          <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
            <div className="rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3">
              <p className="text-xs uppercase tracking-wide text-neutral-500">Created</p>
              <p className="mt-1 font-medium text-neutral-900">{formatDateTime(snapshot?.createdAt)}</p>
            </div>
            <div className="rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3">
              <p className="text-xs uppercase tracking-wide text-neutral-500">Last updated</p>
              <p className="mt-1 font-medium text-neutral-900">{formatDateTime(snapshot?.updatedAt)}</p>
            </div>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <AreaCard title="Brief" href={`/project/${projectId}/brief`} subtitle={snapshot?.latestBrief ? `Latest: v${snapshot.latestBrief.version}` : "Submit your project brief"} />
            <AreaCard title="Concepts" href={`/project/${projectId}/concepts`} hasNew={snapshot?.hasNewConcepts} subtitle={snapshot?.hasNewConcepts ? "New concepts/revisions available" : undefined} />
            <AreaCard title="Messages" href={`/project/${projectId}/messages`} hasNew={snapshot?.hasNewMessages} />
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <EntitlementProgress label="Concepts" usage={snapshot?.entitlementUsage?.concepts} fillClassName="bg-gradient-to-r from-indigo-600 to-sky-500" />
            <EntitlementProgress label="Revisions" usage={snapshot?.entitlementUsage?.revisions} fillClassName="bg-gradient-to-r from-fuchsia-600 to-violet-500" />
          </div>

          <p className="mt-2 text-xs text-neutral-500">
            {conceptUsage.remaining} concepts left · {revisionUsage.remaining} revisions left
          </p>

          <UpsellPanel projectId={projectId} packageCode={snapshot?.packageCode} revisionUsage={revisionUsage} />
        </section>

        {loading ? <p className="mt-4 text-sm text-neutral-600">Loading…</p> : null}
        {error ? <p className="mt-4 text-sm text-red-600">{error}</p> : null}

        <ActivityPanel projectId={projectId} snapshot={snapshot} pendingFeedbackCount={pendingFeedbackCount} />

        {snapshot?.timeline ? <ProjectTimeline timeline={snapshot.timeline} primaryCta={snapshot.primaryCta} /> : null}

        {snapshot?.status === "FINAL_FILES_READY" && snapshot?.finalZip.url ? (
          <section id="final-files" className="mt-10 rounded border border-neutral-200 p-4">
            <h2 className="text-lg font-medium">Final files</h2>
            <p className="mt-3 text-sm">
              <a className="underline" href={snapshot.finalZip.url} target="_blank" rel="noreferrer">
                Download final ZIP
              </a>
            </p>
          </section>
        ) : null}
      </main>
    </PageShell>
  );
}
