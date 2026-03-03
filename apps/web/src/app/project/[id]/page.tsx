"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { ProjectTimeline } from "@/app/project-timeline";
import { HeaderNav } from "@/components/header-nav";
import { ProjectStatusBadge } from "@/components/project-status-badge";

type EntitlementUsage = {
  limit: number;
  consumed: number;
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

type ActivityItem = {
  id: string;
  label: string;
  at: string;
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
  const used = Math.min(consumed, limit);
  const remaining = Math.max(limit - consumed, 0);
  const ratio = limit > 0 ? Math.min((used / limit) * 100, 100) : 0;

  return { limit, used, remaining, ratio };
}

function nextActionForStatus(projectId: string, status: string) {
  if (status === "AWAITING_BRIEF") return { label: "Submit project brief", href: `/project/${projectId}/brief` };
  if (status === "CONCEPTS_READY") return { label: "Review latest concepts", href: `/project/${projectId}/concepts` };
  if (status === "FINAL_FILES_READY") return { label: "Download final files", href: `#final-files` };
  if (status === "ON_HOLD") return { label: "Check project messages", href: `/project/${projectId}/messages` };
  return { label: "Open project messages", href: `/project/${projectId}/messages` };
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

  return (
    <article className="rounded-xl border border-neutral-200 bg-white p-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-neutral-900">{label}</h3>
        <p className="text-xs text-neutral-500">{stats.remaining} left</p>
      </div>
      <p className="mt-1 text-sm text-neutral-700">
        {stats.used} of {stats.limit} used
      </p>
      <div className="mt-3 h-2 rounded-full bg-neutral-200">
        <div className={`h-2 rounded-full transition-all ${fillClassName}`} style={{ width: `${stats.ratio}%` }} />
      </div>
    </article>
  );
}

function AreaCard({ title, href, hasNew, subtitle }: { title: string; href: string; hasNew?: boolean; subtitle?: string }) {
  return (
    <Link href={href} className="rounded-xl border border-neutral-200 bg-white p-4 transition hover:border-neutral-300">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-neutral-900">{title}</h3>
        {hasNew ? <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">New</span> : null}
      </div>
      <p className="mt-1 text-sm text-neutral-600">{subtitle ?? `Open ${title.toLowerCase()}`}</p>
    </Link>
  );
}

function ActivityPanel({ projectId, snapshot }: { projectId: string; snapshot: Snapshot | null }) {
  const nextAction = nextActionForStatus(projectId, snapshot?.status ?? "");

  const activity = useMemo<ActivityItem[]>(() => {
    if (!snapshot) return [];

    const systemMessages = (snapshot.messages ?? [])
      .filter((message) => message.kind === "system")
      .slice(-4)
      .reverse()
      .map((message) => ({ id: message.id, label: message.body, at: message.createdAt }));

    const statusLine = {
      id: "status",
      label: `Status is now ${snapshot.status.replaceAll("_", " ").toLowerCase()}.`,
      at: snapshot.updatedAt ?? snapshot.createdAt ?? new Date().toISOString(),
    };

    return [statusLine, ...systemMessages].slice(0, 5);
  }, [snapshot]);

  return (
    <section className="mt-8 rounded-2xl border border-neutral-200 bg-white p-5">
      <h2 className="text-lg font-semibold text-neutral-900">Activity + next action</h2>
      <p className="mt-1 text-sm text-neutral-600">Mission control for this project: what happened recently, and what to do now.</p>

      <div className="mt-4 rounded-xl border border-neutral-200 bg-neutral-50 p-4">
        <p className="text-xs uppercase tracking-wide text-neutral-500">Next action</p>
        <Link href={nextAction.href} className="mt-2 inline-flex rounded-lg bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white">
          {nextAction.label}
        </Link>
      </div>

      <ul className="mt-4 space-y-3">
        {activity.map((item) => (
          <li key={item.id} className="rounded-lg border border-neutral-200 p-3 text-sm">
            <p className="text-neutral-900">{item.label}</p>
            <p className="mt-1 text-xs text-neutral-500">{formatDateTime(item.at)}</p>
          </li>
        ))}
        {activity.length === 0 ? <li className="text-sm text-neutral-600">No activity yet.</li> : null}
      </ul>
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

  return (
    <>
      <HeaderNav />
      <main className="mx-auto w-full max-w-[1160px] px-6 py-8 md:px-10">
        <section className="rounded-2xl border border-neutral-200 bg-gradient-to-b from-white to-neutral-50 p-6 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <ProjectStatusBadge status={snapshot?.status ?? "UNKNOWN"} />
              <h1 className="mt-3 text-2xl font-semibold text-neutral-900">Project overview</h1>
              <p className="mt-1 text-sm text-neutral-600">Project {projectId}</p>
              <p className="text-sm text-neutral-600">Package: {snapshot?.packageCode ?? "—"}</p>
            </div>
          </div>

          <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
            <div className="rounded-xl border border-neutral-200 bg-white px-4 py-3">
              <p className="text-xs uppercase tracking-wide text-neutral-500">Created</p>
              <p className="mt-1 font-medium text-neutral-900">{formatDateTime(snapshot?.createdAt)}</p>
            </div>
            <div className="rounded-xl border border-neutral-200 bg-white px-4 py-3">
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
        </section>

        {loading ? <p className="mt-4 text-sm text-neutral-600">Loading…</p> : null}
        {error ? <p className="mt-4 text-sm text-red-600">{error}</p> : null}

        <ActivityPanel projectId={projectId} snapshot={snapshot} />

        {snapshot?.timeline ? <ProjectTimeline timeline={snapshot.timeline} primaryCta={snapshot.primaryCta} /> : null}

        <section className="mt-8 rounded border border-neutral-200 p-4">
          <h2 className="text-lg font-medium">Latest concepts</h2>
          <ul className="mt-3 space-y-3">
            {(snapshot?.concepts ?? []).slice(0, 3).map((concept) => (
              <li key={concept.id} className="rounded border border-neutral-200 p-3 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-medium">Concept #{concept.number}</p>
                  <Link className="underline" href={`/project/${projectId}/concept/${concept.id}`}>View concept</Link>
                </div>
              </li>
            ))}
            {(snapshot?.concepts?.length ?? 0) === 0 ? <li className="text-sm text-neutral-600">No concepts published yet.</li> : null}
          </ul>
        </section>

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
    </>
  );
}
