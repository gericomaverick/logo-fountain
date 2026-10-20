"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { ProjectTimeline, ProjectTimelineSkeleton } from "@/app/project-timeline";
import { Allowance, PanelCard, resolveUsage, type EntitlementUsage } from "@/components/allowances";
import { FeatureNoticeCard } from "@/components/feature-notice-card";
import { HeaderNav } from "@/components/header-nav";
import { CheckIcon, ChevronRightIcon, DownloadIcon, FileTextIcon, ImageIcon, MessageIcon } from "@/components/icons";
import { PageShell } from "@/components/page-shell";
import { EmptyLine, PageHeader, Property, Section } from "@/components/ui";
import type { BriefAnswers } from "@/lib/brief";
import { getProjectDisplayTitle } from "@/lib/project-display-name";
import { UPSELL_DISPLAY_PRICES } from "@/lib/stripe-price-allowlist";
import { ProjectStatusBadge } from "@/components/project-status-badge";
import { ProjectWelcome } from "@/components/project-welcome";
import { shouldShowProjectWelcome } from "@/lib/project-journey";
import { formatClientFirstName, getAreaCardSubtitle } from "@/lib/project-overview";
import { getClientOverviewNextAction, getPendingFeedbackCountForLatestConcept } from "@/lib/project-hub";
import { deriveOverviewBadgeStatus } from "@/lib/project-status";
import { customerActionFor } from "@/lib/project-state-machine";

const SHORT_DATE = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" });

export type Snapshot = {
  status: string;
  packageCode: string;
  createdAt?: string;
  updatedAt?: string;
  entitlements: { concepts: number; revisions: number };
  hasBriefDraft?: boolean;
  entitlementUsage?: {
    concepts?: EntitlementUsage;
    revisions?: EntitlementUsage;
  };
  concepts: Array<{ id: string; number: number; status: string; notes: string | null; imageUrl: string | null }>;
  revisionRequests?: Array<{ id: string; status: string; concept?: { id: string } | null }>;
  latestBrief?: { version: number; createdAt: string; answers: BriefAnswers } | null;
  messages?: Array<{ id: string; kind?: string; body: string; createdAt: string }>;
  hasNewMessages?: boolean;
  hasNewConcepts?: boolean;
  finalZip: { available: boolean; url: string | null };
  primaryCta?: string | null;
  timeline?: Array<{ state: string; label: string; completed: boolean; current: boolean; timestamp?: string }>;
};

const DAY = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" });

function formatDay(value?: string): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : DAY.format(date);
}


function readError(payload: { error?: { message?: string; details?: { nextStep?: string } } | string } | null, fallback: string): string {
  const err = payload?.error;
  const message = typeof err === "string" ? err : err?.message ?? fallback;
  const nextStep = typeof err === "string" ? undefined : err?.details?.nextStep;
  return nextStep ? `${message} — ${nextStep}` : message;
}

/** One of the project's three places to go. Side by side once there is room. */
function AreaRow({ title, href, hasNew, subtitle, Icon }: { title: string; href: string; hasNew?: boolean; subtitle?: string; Icon: typeof MessageIcon }) {
  return (
    <li>
      <Link
        href={href}
        aria-label={`Open ${title}`}
        className="group flex h-full items-start gap-3 rounded-xl border border-line bg-panel p-4 transition-colors hover:border-line-strong hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]"
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-line bg-surface text-fg-2 group-hover:text-fg">
          <Icon size={17} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-base font-medium text-fg">{title}</span>
            {hasNew ? <span className="rounded-full bg-accent-soft px-2 py-0.5 text-xs font-semibold text-accent">New</span> : null}
          </span>
          <span className="mt-0.5 block text-sm leading-snug text-fg-3">{getAreaCardSubtitle(title, subtitle)}</span>
        </span>
      </Link>
    </li>
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
    <section className="rounded-xl border border-[color-mix(in_srgb,var(--accent)_28%,transparent)] bg-[color-mix(in_srgb,var(--accent)_7%,var(--panel))] p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-fg">Need more flexibility?</h2>
          <p className="mt-1 text-base text-fg-2">
            {shouldOfferAddon
              ? "You’re at the revision limit for this stage. Add one extra revision now, or upgrade for more headroom."
              : "You’re getting close to your revision limit. Upgrade now to avoid interruptions later."}
          </p>
        </div>
        <button
          type="button"
          className="text-sm font-medium text-fg-2 underline underline-offset-4 hover:text-fg"
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
            className="portal-btn-primary"
            onClick={() => void startPurchase({ kind: "addon", addonKey: "extra_revision" }, "addon")}
            disabled={submitting !== null}
          >
            {submitting === "addon" ? "Redirecting…" : `Buy extra revision (${UPSELL_DISPLAY_PRICES.extra_revision})`}
          </button>
        ) : null}

        {shouldOfferUpgrade && upgradeTarget ? (
          <button
            type="button"
            className="portal-btn-secondary"
            onClick={() => void startPurchase({ kind: "upgrade", toPackage: upgradeTarget }, "upgrade")}
            disabled={submitting !== null}
          >
            {submitting === "upgrade"
              ? "Redirecting…"
              : `Upgrade to ${upgradeTarget === "professional" ? "Professional" : "Complete"} (${upgradeTarget === "professional" ? UPSELL_DISPLAY_PRICES.essential_to_professional : UPSELL_DISPLAY_PRICES.professional_to_complete})`}
          </button>
        ) : null}
      </div>
      {error ? <p className="mt-3 text-sm text-danger">{error}</p> : null}
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
    <section className={`rounded-lg border px-4 py-3 text-base text-fg ${status === "fulfilled" ? "border-[color-mix(in_srgb,var(--success)_30%,transparent)] bg-success-soft" : status === "failed" ? "border-[color-mix(in_srgb,var(--danger)_30%,transparent)] bg-danger-soft" : "border-[color-mix(in_srgb,var(--warning)_30%,transparent)] bg-warning-soft"}`}>
      <p className="font-medium">
        {status === "fulfilled" ? "Purchase confirmed" : status === "failed" ? "Purchase confirmation delayed" : "Confirming your purchase"}
      </p>
      {message ? <p className="mt-1 text-fg-2">{message}</p> : null}
    </section>
  );
}

export function ProjectHub({
  initialSnapshot,
  initialFirstName,
}: {
  initialSnapshot: Snapshot | null;
  initialFirstName: string | null;
}) {
  const searchParams = useSearchParams();
  const params = useParams<{ id: string }>();
  const projectId = params.id;
  const [snapshot, setSnapshot] = useState<Snapshot | null>(initialSnapshot);
  const [loading, setLoading] = useState(initialSnapshot === null);
  const [error, setError] = useState<string | null>(null);
  const [firstName, setFirstName] = useState<string | null>(initialFirstName);
  const [downloadingFinals, setDownloadingFinals] = useState(false);

  async function refresh(id: string) {
    // Only the snapshot is re-read. A person's name does not change while they
    // watch their project, and fetching it every few seconds doubled the
    // requests this page makes for an answer that is always the same.
    const response = await fetch(`/api/projects/${id}`, { cache: "no-store" });

    const payload = await response.json().catch(() => null);
    if (!response.ok) throw new Error(readError(payload, "Failed to load project"));

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

    // The page arrived with a snapshot; the first poll is ten seconds away.
    if (initialSnapshot === null) void tick();
    const timer = setInterval(() => void tick(), 10000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [projectId, initialSnapshot]);

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
    () => getClientOverviewNextAction(projectId, snapshot, { pendingFeedbackCount }),
    [pendingFeedbackCount, projectId, snapshot],
  );
  const upsellSessionId = searchParams.get("upsell") === "1" ? searchParams.get("session_id")?.trim() ?? null : null;
  const upsellKind = useMemo(() => {
    const raw = searchParams.get("kind");
    return raw === "addon" || raw === "upgrade" ? raw : null;
  }, [searchParams]);
  const welcomeName = formatClientFirstName(firstName);
  const showWelcome = shouldShowProjectWelcome(snapshot?.status, Boolean(snapshot?.latestBrief));
  const hasApprovedConcept = (snapshot?.concepts ?? []).some((concept) => concept.status === "approved");
  const canDownloadFinals = Boolean(snapshot?.finalZip?.available) && (snapshot?.status === "FINAL_FILES_READY" || snapshot?.status === "DELIVERED");
  const showPendingDeliverablesCard = hasApprovedConcept && !canDownloadFinals;
  const overviewStatus = deriveOverviewBadgeStatus({
    persistedStatus: snapshot?.status ?? "UNKNOWN",
    hasApprovedConcept,
    hasFinalDeliverable: Boolean(snapshot?.finalZip?.available),
  });

  async function handleFinalDownload() {
    if (!projectId || downloadingFinals) return;
    setDownloadingFinals(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/finals`, { method: "POST" });
      const payload = await res.json().catch(() => null);
      if (!res.ok || !payload?.url) throw new Error(readError(payload, "Could not prepare final download"));
      window.open(payload.url as string, "_blank", "noopener,noreferrer");
      await refresh(projectId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not prepare final download");
    } finally {
      setDownloadingFinals(false);
    }
  }

  const brandName = snapshot?.latestBrief?.answers?.brandName?.trim() || null;
  const projectTitle = getProjectDisplayTitle({ projectId, brandName, audience: "client" });
  const packageLabel = snapshot?.packageCode ? `${snapshot.packageCode.slice(0, 1).toUpperCase()}${snapshot.packageCode.slice(1)}` : "—";

  return (
    <PageShell>
      <HeaderNav />
      <PageHeader
        crumbs={[{ label: "Projects", href: "/dashboard" }, { label: projectTitle }]}
        actions={
          <>
            <Link className="portal-btn-ghost relative" href={`/project/${projectId}/messages`}>
              <MessageIcon size={14} />
              <span className="hidden sm:inline">Messages</span>
              {snapshot?.hasNewMessages ? <span aria-label="New messages" className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-accent" /> : null}
            </Link>
            <Link className="portal-btn-secondary" href={`/project/${projectId}/concepts`}>
              <ImageIcon size={14} />
              <span className="hidden sm:inline">Concepts</span>
            </Link>
          </>
        }
      />

      <div className="flex min-h-[calc(100%-3.5rem)] flex-col lg:flex-row">
        <main className="min-w-0 flex-1 px-4 py-6 md:px-8 lg:py-8">
          <div className="mx-auto max-w-[920px] space-y-10">
            <div>
              <ProjectStatusBadge status={overviewStatus} />
              <h1 className="mt-4 text-2xl font-semibold tracking-tight text-fg">{projectTitle}</h1>
              <p className="mt-2 text-base text-fg-2">{welcomeName ? `Hey, ${welcomeName} — here’s where your project stands.` : "Here’s where your project stands."}</p>
            </div>

            {loading ? <p className="text-sm text-fg-3">Loading…</p> : null}
            {error ? <p className="rounded-lg bg-danger-soft px-3 py-2.5 text-sm text-danger" role="alert">{error}</p> : null}

            <UpsellPurchaseStatus sessionId={upsellSessionId} kind={upsellKind} />

            {/* Someone who has paid and not yet briefed gets the whole picture
                first; everyone else gets the one thing to do next. */}
            {showWelcome ? (
              <ProjectWelcome
                projectId={projectId}
                status={snapshot?.status}
                firstName={welcomeName || null}
                hasDraft={Boolean(snapshot?.hasBriefDraft)}
              />
            ) : nextAction ? (
              <section className="brand-sheen rounded-xl bg-brand-block p-6 sm:flex sm:items-center sm:justify-between sm:gap-8">
                <div>
                  <p className="text-xl font-semibold tracking-tight text-brand-block-fg">{nextAction.label}</p>
                  <p className="mt-2 max-w-[52ch] text-base text-brand-block-fg-2">Do this first to keep your project moving.</p>
                </div>
                <Link
                  href={nextAction.href}
                  className="mt-5 inline-flex h-11 shrink-0 items-center justify-center gap-1.5 rounded-md bg-[var(--brand-block-fg)] px-5 text-base font-semibold text-[var(--brand-block-btn-fg)] transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-block-fg)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--brand-block)] sm:mt-0"
                >
                  {nextAction.label}
                  <ChevronRightIcon size={16} />
                </Link>
              </section>
            ) : (
              <section className="flex items-start gap-4 rounded-xl bg-success-block p-5 sm:p-6">
                <span aria-hidden className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[rgba(255,255,255,0.18)]">
                  <CheckIcon size={20} className="text-success-block-fg" />
                </span>
                <div>
                  <p className="text-xl font-semibold tracking-tight text-success-block-fg">You’re all caught up</p>
                  <p className="mt-1 max-w-[52ch] text-base text-success-block-fg-2">We’ll show the next step here when something needs your attention.</p>
                </div>
              </section>
            )}

            {canDownloadFinals ? (
              <FeatureNoticeCard
                variant="celebration"
                title="Great news — your final deliverables are ready to download ✨"
                body="Everything is packed and ready for you. Huge thanks for working with us — it’s been a pleasure building your brand with you."
                signature="— Logo Fountain team"
                actions={(
                  <button type="button" onClick={() => void handleFinalDownload()} disabled={downloadingFinals} className="portal-btn-primary h-11 px-5 text-base">
                    <DownloadIcon size={16} />
                    {downloadingFinals ? "Preparing download…" : "Download final ZIP"}
                  </button>
                )}
              />
            ) : showPendingDeliverablesCard ? (
              <FeatureNoticeCard
                variant="info"
                title="Your logo files are in production"
                body="You are all set. We have started preparing your final logo files and quality checks are underway. We will update this space the moment your download is ready."
                signature="Logo Fountain team"
              />
            ) : null}

            <UpsellPanel projectId={projectId} packageCode={snapshot?.packageCode} projectStatus={snapshot?.status} revisionUsage={revisionUsage} />

            <Section title="Your project">
              <ul className="grid gap-3 sm:grid-cols-3">
                <AreaRow title="Brief" Icon={FileTextIcon} href={`/project/${projectId}/brief`} subtitle={snapshot?.latestBrief ? "Submitted — your designer has it" : "Submit your project brief"} />
                <AreaRow title="Concepts" Icon={ImageIcon} href={`/project/${projectId}/concepts`} hasNew={snapshot?.hasNewConcepts} subtitle={snapshot?.hasNewConcepts ? "New concepts/revisions available" : undefined} />
                <AreaRow title="Messages" Icon={MessageIcon} href={`/project/${projectId}/messages`} hasNew={snapshot?.hasNewMessages} subtitle={snapshot?.hasNewMessages ? "Unread updates waiting" : undefined} />
              </ul>
            </Section>

            {!canDownloadFinals && !showPendingDeliverablesCard ? (
              <Section title="Latest concept" actions={<Link className="portal-btn-ghost h-8" href={`/project/${projectId}/concepts`}>View all</Link>}>
                {latestConcept?.imageUrl ? (
                  <Link href={`/project/${projectId}/concepts`} className="block overflow-hidden rounded-xl border border-line bg-surface transition-colors hover:border-line-strong">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={latestConcept.imageUrl} alt={`Latest concept #${latestConcept.number}`} className="aspect-[16/9] w-full object-contain" />
                  </Link>
                ) : (
                  <EmptyLine>No concept preview yet. Your first concepts will appear here as soon as they’re ready.</EmptyLine>
                )}
              </Section>
            ) : null}

            {snapshot?.timeline ? <ProjectTimeline timeline={snapshot.timeline} customerAction={customerActionFor(snapshot.status)} /> : <ProjectTimelineSkeleton />}
          </div>
        </main>

        <aside aria-label="Project details" className="w-full shrink-0 space-y-4 border-t border-line bg-surface px-4 py-6 lg:w-[384px] lg:border-l lg:border-t-0 lg:px-5 lg:py-8">
          <PanelCard title="Your allowances">
            <div className="divide-y divide-line">
              <Allowance label="Concepts" usage={snapshot?.entitlementUsage?.concepts} />
              <Allowance label="Revisions" usage={snapshot?.entitlementUsage?.revisions} />
            </div>
          </PanelCard>

          <PanelCard title="Details">
            <dl className="-my-2">
              <Property label="Status"><ProjectStatusBadge status={overviewStatus} size="sm" /></Property>
              <Property label="Package">{packageLabel}</Property>
              <Property label="Brief">
                  {snapshot?.latestBrief ? (
                    <time dateTime={snapshot.latestBrief.createdAt} title={new Date(snapshot.latestBrief.createdAt).toLocaleString()}>
                      Submitted {SHORT_DATE.format(new Date(snapshot.latestBrief.createdAt))}
                    </time>
                  ) : (
                    <span className="text-fg-3">Not submitted</span>
                  )}
                </Property>
              <Property label="Started">{formatDay(snapshot?.createdAt)}</Property>
              <Property label="Updated">{formatDay(snapshot?.updatedAt)}</Property>
            </dl>
          </PanelCard>
        </aside>
      </div>
    </PageShell>
  );
}
