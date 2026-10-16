"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { refreshOverrideInputs } from "@/lib/admin-override-inputs";

import { ProjectTimeline } from "@/app/project-timeline";
import { FeatureNoticeCard } from "@/components/feature-notice-card";
import { HeaderNav } from "@/components/header-nav";
import { AlertIcon, CheckIcon, ChevronDownIcon, CopyIcon, DownloadIcon, FileTextIcon, HistoryIcon, ImageIcon, MessageIcon, UploadIcon } from "@/components/icons";
import { PageShell } from "@/components/page-shell";
import { EmptyLine, Meter, PageHeader, Property, Section } from "@/components/ui";
import { getProjectDisplayTitle } from "@/lib/project-display-name";
import { ProjectStatusBadge } from "@/components/project-status-badge";
import {
  resolveFinalNotificationRetryUi,
  resolveFinalPublicationUi,
  shouldOfferFinalNotificationRetry,
} from "@/lib/admin-final-publication";
import { getPendingFeedbackCountForLatestConcept } from "@/lib/project-hub";

type EntitlementUsage = { limit: number; consumed: number; reserved?: number; remaining: number; unlimited?: boolean; configured?: boolean };

type ProjectInvoice = {
  id: string;
  projectName: string;
  amountCents: number;
  currency: string;
  status: string;
  date: string;
  invoicePdfUrl: string | null;
  hostedInvoiceUrl: string | null;
  receiptUrl: string | null;
};

type Snapshot = {
  status: string;
  overviewStatus?: string;
  createdAt?: string;
  updatedAt?: string;
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
  finalZip?: { available: boolean; url: string | null; assetId?: string | null };
  clientContact?: {
    fullName: string | null;
    email: string;
  } | null;
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

function getConceptStatusMeta(status: string): { label: string; className: string } {
  if (status === "approved") return { label: "Approved", className: "bg-success-soft text-success" };
  if (status === "published") return { label: "Published", className: "bg-accent-soft text-accent" };
  if (status === "archived") return { label: "Archived", className: "bg-surface-2 text-fg-3" };
  return { label: status, className: "bg-surface-2 text-fg-2" };
}

function getInvoiceAction(invoice: ProjectInvoice): { href: string | null; label: "Download PDF" | "View invoice" | "View receipt"; download: boolean } {
  if (invoice.invoicePdfUrl) {
    return { href: invoice.invoicePdfUrl, label: "Download PDF", download: true };
  }

  if (invoice.hostedInvoiceUrl) {
    const hostedIsPdf = invoice.hostedInvoiceUrl.toLowerCase().includes(".pdf");
    return { href: invoice.hostedInvoiceUrl, label: hostedIsPdf ? "Download PDF" : "View invoice", download: hostedIsPdf };
  }

  if (invoice.receiptUrl) {
    return { href: invoice.receiptUrl, label: "View receipt", download: false };
  }

  return { href: null, label: "View invoice", download: false };
}

type AllowanceTone = "plenty" | "last" | "out" | "neutral";

function allowanceTone(usage: EntitlementUsage | undefined, remaining: number): AllowanceTone {
  if (!usage || usage.configured === false || usage.unlimited) return "neutral";
  if (remaining <= 0) return "out";
  // "Last one" only once some have gone: a one-concept package isn't a warning.
  if (remaining === 1 && (usage.limit ?? 0) > 1) return "last";
  return "plenty";
}

const TONE_STYLE: Record<AllowanceTone, { label: string; chip: string; used: string }> = {
  plenty: { label: "Available", chip: "bg-success-soft text-success", used: "bg-accent" },
  last: { label: "Last one", chip: "bg-warning-soft text-warning", used: "bg-warning" },
  out: { label: "Used up", chip: "bg-danger-soft text-danger", used: "bg-danger" },
  neutral: { label: "", chip: "bg-surface-2 text-fg-2", used: "bg-accent" },
};

/** One allowance, sized to be read at a glance: what's left, of how many, and what's pending. */
function EntitlementProgress({ label, usage }: { label: string; usage: EntitlementUsage | undefined }) {
  const stats = resolveUsage(usage);
  const tone = allowanceTone(usage, stats.remaining);
  const style = TONE_STYLE[tone];
  const segmented = !usage?.unlimited && stats.limit > 0 && stats.limit <= 12;
  return (
    <div className="py-3 first:pt-0 last:pb-0">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium text-fg-2">{label}</span>
        {usage?.configured === false ? (
          <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs font-medium text-fg-3">Not configured</span>
        ) : usage?.unlimited ? (
          <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs font-medium text-fg-2">Unlimited</span>
        ) : (
          <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${style.chip}`}>{style.label}</span>
        )}
      </div>
      <p className="mt-1 flex items-baseline gap-1.5">
        <span className="text-3xl font-semibold tabular-nums tracking-tight text-fg">{usage?.unlimited ? stats.consumed : stats.remaining}</span>
        <span className="text-sm text-fg-2">{usage?.unlimited ? "used" : `left of ${stats.limit}`}</span>
      </p>
      {segmented ? (
        <div className="mt-2 flex gap-1" role="meter" aria-label={`${label}: ${stats.consumed} used, ${stats.reserved} pending, ${stats.remaining} left`} aria-valuemin={0} aria-valuemax={stats.limit} aria-valuenow={stats.allocated}>
          {Array.from({ length: stats.limit }, (_, index) => {
            const state = index < stats.consumed ? "used" : index < stats.consumed + stats.reserved ? "pending" : "free";
            return (
              <span
                key={index}
                className={`h-2 flex-1 rounded-full ${state === "used" ? style.used : state === "pending" ? "bg-[repeating-linear-gradient(135deg,var(--accent)_0_3px,var(--accent-soft)_3px_6px)]" : "bg-surface-2 shadow-[inset_0_0_0_1px_var(--line)]"}`}
              />
            );
          })}
        </div>
      ) : (
        <div className="mt-2">
          <Meter ratio={stats.limit > 0 ? stats.allocated / stats.limit : 0} label={`${label} allocated`} />
        </div>
      )}
      <p className="mt-1.5 text-sm text-fg-3">
        {stats.consumed} used{stats.reserved > 0 ? ` · ${stats.reserved} pending` : ""}
        {!usage?.unlimited && stats.limit > 0 ? ` · ${stats.limit} in package` : ""}
      </p>
    </div>
  );
}

/** A defined block of the properties column. */
function PanelCard({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-line bg-panel p-4 shadow-[var(--shadow-card)]">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="portal-label">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

function CopyId({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="group inline-flex max-w-full items-center gap-1.5 rounded px-1 py-0.5 font-mono text-sm text-fg-2 hover:bg-surface-2 hover:text-fg"
      title="Copy project ID"
      onClick={() => {
        void navigator.clipboard?.writeText(value).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        });
      }}
    >
      <span className="truncate">{value}</span>
      {copied ? <CheckIcon size={12} className="shrink-0 text-success" /> : <CopyIcon size={12} className="shrink-0 opacity-0 group-hover:opacity-100" />}
    </button>
  );
}

export default function AdminProjectPage() {
  const params = useParams<{ id: string }>();
  const projectId = params.id;
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reprocessSessionId, setReprocessSessionId] = useState("");
  const [conceptDirty, setConceptDirty] = useState(false);
  const [revisionDirty, setRevisionDirty] = useState(false);
  const [conceptLimit, setConceptLimit] = useState("");
  const [revisionLimit, setRevisionLimit] = useState("");
  const [entitlementOverrideReason, setEntitlementOverrideReason] = useState("");
  const overrideDirty = useRef({ concepts: false, revisions: false });
  const [finalZipFile, setFinalZipFile] = useState<File | null>(null);
  const [invoices, setInvoices] = useState<ProjectInvoice[]>([]);
  const [invoiceError, setInvoiceError] = useState<string | null>(null);
  const [finalUploadSuccess, setFinalUploadSuccess] = useState<string | null>(null);

  async function refresh(id: string) {
    const [snapshotResponse, invoicesResponse] = await Promise.all([
      fetch(`/api/admin/projects/${id}`, { cache: "no-store" }),
      fetch(`/api/admin/projects/${id}/invoices`, { cache: "no-store" }),
    ]);

    const snapshotPayload = await snapshotResponse.json().catch(() => null);

    if (!snapshotResponse.ok) throw new Error(readError(snapshotPayload, "Failed to load"));

    const invoicesPayload = await invoicesResponse.json().catch(() => null);

    const nextSnapshot = snapshotPayload?.snapshot ?? null;
    setSnapshot(nextSnapshot);
    setInvoices(Array.isArray(invoicesPayload?.invoices) ? invoicesPayload.invoices : []);
    setInvoiceError(invoicesResponse.ok ? null : readError(invoicesPayload, "Failed to load invoices"));

    if (nextSnapshot) {
      refreshOverrideInputs(overrideDirty, nextSnapshot.entitlementUsage, setConceptLimit, setRevisionLimit);
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
    const reason = entitlementOverrideReason.trim();
    if (!reason) {
      setError("A reason is required for every entitlement override.");
      return;
    }

    setBusy(true);
    setError(null);

    const response = await fetch(`/api/admin/projects/${projectId}/entitlements`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...(conceptDirty ? { concepts } : {}), ...(revisionDirty ? { revisions } : {}), reason }),
    });

    const payload = await response.json().catch(() => null);

    if (!response.ok) {
      setError(readError(payload, "Failed to update entitlements"));
    } else {
      overrideDirty.current = { concepts: false, revisions: false };
      setConceptDirty(false);
      setRevisionDirty(false);
      setEntitlementOverrideReason("");
      await refresh(projectId);
    }

    setBusy(false);
  }

  async function downloadCurrentFinal() {
    if (!projectId || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/projects/${projectId}/finals/download`, { method: "POST" });
      const payload = await res.json().catch(() => null);
      if (!res.ok || !payload?.url) throw new Error(readError(payload, "Failed to prepare final ZIP"));
      window.open(payload.url as string, "_blank", "noopener,noreferrer");
    } catch (downloadError) {
      setError(downloadError instanceof Error ? downloadError.message : "Failed to prepare final ZIP");
    } finally {
      setBusy(false);
    }
  }

  async function uploadFinalDeliverable(e: React.FormEvent) {
    e.preventDefault();
    if (!projectId || !finalZipFile) return;

    setBusy(true);
    setError(null);

    const data = new FormData();
    data.set("file", finalZipFile);

    const res = await fetch(`/api/admin/projects/${projectId}/finals`, {
      method: "POST",
      body: data,
    });

    const payload = await res.json().catch(() => null);
    const outcome = resolveFinalPublicationUi(res.ok, payload);
    setError(outcome.errorMessage);
    setFinalUploadSuccess(outcome.successMessage);
    if (outcome.committed) setFinalZipFile(null);
    if (outcome.refreshProject) await refresh(projectId);

    setBusy(false);
  }

  async function retryFinalNotification() {
    if (!projectId || busy) return;
    setBusy(true);
    setError(null);
    // Never carry a prior "live" success claim into a new guarded retry.
    setFinalUploadSuccess(null);
    const res = await fetch(`/api/admin/projects/${projectId}/finals/notify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        assetId: snapshot?.finalZip?.assetId,
        projectUpdatedAt: snapshot?.updatedAt,
      }),
    });
    const payload = await res.json().catch(() => null);
    const outcome = resolveFinalNotificationRetryUi(res.status, res.ok, payload);
    setFinalUploadSuccess(outcome.successMessage);
    setError(outcome.errorMessage);
    if (outcome.refreshProject) await refresh(projectId);
    setBusy(false);
  }

  const pendingFeedbackCount = useMemo(
    () => getPendingFeedbackCountForLatestConcept(snapshot?.concepts ?? [], snapshot?.revisionRequests ?? []),
    [snapshot?.concepts, snapshot?.revisionRequests],
  );
  const hasApprovedConcept = useMemo(
    () => (snapshot?.concepts ?? []).some((concept) => concept.status === "approved"),
    [snapshot?.concepts],
  );

  const overviewStatus = snapshot?.overviewStatus ?? snapshot?.status ?? "UNKNOWN";
  const projectTitle = getProjectDisplayTitle({ projectId, brandName: null, audience: "admin" });
  const outstanding = (snapshot?.revisionRequests ?? []).filter((r) => r.status !== "delivered");
  const concepts = snapshot?.concepts ?? [];

  return (
    <PageShell>
      <HeaderNav />
      <PageHeader
        crumbs={[{ label: "Queue", href: "/admin" }, { label: projectTitle }]}
        actions={
          <>
            <Link className="portal-btn-ghost" href={`/admin/projects/${projectId}/messages`}>
              <MessageIcon size={14} />
              <span className="hidden sm:inline">Messages</span>
            </Link>
            <Link className="portal-btn-ghost" href={`/admin/projects/${projectId}/brief`}>
              <FileTextIcon size={14} />
              <span className="hidden sm:inline">Brief</span>
            </Link>
            <Link className="portal-btn-secondary" href={`/admin/projects/${projectId}/concepts`}>
              <ImageIcon size={14} />
              <span className="hidden sm:inline">Concepts manager</span>
            </Link>
            {hasApprovedConcept ? (
              <a className="portal-btn-primary" href="#final-deliverables-upload">
                <UploadIcon size={14} />
                <span className="hidden sm:inline">Upload final deliverables</span>
              </a>
            ) : null}
          </>
        }
      />

      <div className="flex min-h-[calc(100%-3.5rem)] flex-col lg:flex-row">
        <main className="min-w-0 flex-1 px-4 py-6 md:px-8 lg:py-8">
          <div className="mx-auto max-w-[920px] space-y-10">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <ProjectStatusBadge status={overviewStatus} />
                {snapshot?.primaryCta ? <span className="text-sm text-fg-3">Next: {snapshot.primaryCta}</span> : null}
              </div>
              <h1 className="mt-4 text-3xl font-semibold tracking-tight text-fg">{projectTitle}</h1>
              <p className="mt-2 text-base text-fg-2">Operational overview and high-confidence controls for this project.</p>
            </div>

            {pendingFeedbackCount > 0 || snapshot?.stuck || error || snapshot?.status === "ON_HOLD" ? (
              <div className="space-y-2">
                {pendingFeedbackCount > 0 ? (
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[color-mix(in_srgb,var(--warning)_30%,transparent)] bg-warning-soft px-3 py-2.5 text-base text-fg">
                    <p>
                      Latest concept has <span className="font-semibold">{pendingFeedbackCount}</span> pending feedback request{pendingFeedbackCount === 1 ? "" : "s"}.
                    </p>
                    <Link className="portal-btn-secondary h-7" href={`/admin/projects/${projectId}/concepts`}>Open concepts manager</Link>
                  </div>
                ) : null}
                {snapshot?.stuck ? (
                  <p className="flex items-center gap-2 rounded-lg border border-[color-mix(in_srgb,var(--danger)_30%,transparent)] bg-danger-soft px-3 py-2.5 text-base text-danger">
                    <AlertIcon size={14} />
                    Stuck: {snapshot.stuckReason ?? "Needs manual intervention."}
                  </p>
                ) : null}
                {error ? <p className="rounded-lg bg-danger-soft px-3 py-2.5 text-base text-danger" role="alert">{error}</p> : null}
                {snapshot?.status === "ON_HOLD" ? (
                  <div className="flex items-center justify-between gap-3 rounded-lg border border-line bg-surface px-3 py-2.5 text-base">
                    <span className="text-fg-2">This project is on hold.</span>
                    <button className="portal-btn-secondary h-7" type="button" disabled={busy} onClick={() => {
                      const reason = window.prompt("Reason for restoring the recorded pre-hold phase (no usage reset):");
                      if (!reason?.trim()) return;
                      void runAction(() => fetch(`/api/admin/projects/${projectId}/status`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "RESUME", reason }) }), "Cannot safely resume project");
                    }}>Resume recorded phase</button>
                  </div>
                ) : null}
              </div>
            ) : null}

            {outstanding.length > 0 ? (
              <Section title="Outstanding revision requests" count={outstanding.length}>
                <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line">
                  {outstanding.map((r) => {
                    const concept = snapshot?.concepts.find((c) => c.id === r.concept?.id) ?? null;
                    return (
                      <li key={r.id} className="flex gap-3 bg-panel p-3 text-base">
                        {concept?.imageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img className="h-14 w-14 shrink-0 rounded-md border border-line object-cover" src={concept.imageUrl} alt={`Concept ${concept.number}`} />
                        ) : (
                          <div className="h-14 w-14 shrink-0 rounded-md border border-line bg-surface" aria-hidden />
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="text-sm text-fg-3">{r.user.fullName ?? r.user.email} · {new Date(r.createdAt).toLocaleString("en-GB")} · concept #{concept?.number ?? "—"}</p>
                          <p className="mt-1 whitespace-pre-wrap text-fg">{r.body}</p>
                          <div className="mt-2 flex items-center gap-1.5">
                            <button
                              className="portal-btn-secondary h-7"
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
                            <Link className="portal-btn-ghost h-7" href={`/admin/projects/${projectId}/concepts`}>View concept #{concept?.number ?? "—"}</Link>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </Section>
            ) : null}

            <Section
              title="Concepts"
              count={concepts.length}
              actions={<Link className="portal-btn-ghost h-7" href={`/admin/projects/${projectId}/concepts`}>Open concepts manager</Link>}
            >
              {loading ? <p className="text-base text-fg-3">Loading…</p> : null}
              {!loading && concepts.length === 0 ? <EmptyLine>No concepts yet. Published concepts appear here once the client can see them.</EmptyLine> : null}
              {concepts.length > 0 ? (
                <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {concepts.map((concept) => {
                    const pendingRevisionCount = (snapshot?.revisionRequests ?? []).filter((r) => r.status !== "delivered" && r.concept?.id === concept.id).length;
                    const conceptStatus = getConceptStatusMeta(concept.status);
                    return (
                      <li key={concept.id} className="overflow-hidden rounded-lg border border-line bg-panel text-base transition-colors hover:border-line-strong">
                        {concept.imageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img className="aspect-[4/3] w-full bg-surface object-cover" src={concept.imageUrl} alt={`Concept ${concept.number}`} />
                        ) : (
                          <div className="aspect-[4/3] w-full bg-surface" aria-hidden />
                        )}
                        <div className="border-t border-line p-3">
                          <div className="flex items-center justify-between gap-2">
                            <p className="font-medium text-fg">Concept #{concept.number}</p>
                            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${conceptStatus.className}`}>{conceptStatus.label}</span>
                          </div>
                          {pendingRevisionCount > 0 ? (
                            <p className="mt-1 text-sm text-warning">{pendingRevisionCount} pending revision request{pendingRevisionCount === 1 ? "" : "s"}</p>
                          ) : null}
                          <div className="mt-2 flex items-center gap-3 text-sm">
                            <Link className="text-fg-2 hover:text-fg" href={`/project/${projectId}/concept/${concept.id}?from=admin`}>Open discussion</Link>
                            <Link className="text-fg-2 hover:text-fg" href={`/admin/projects/${projectId}/concepts#concept-${concept.id}`}>Quick actions</Link>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              ) : null}
            </Section>

            <Section
              id="final-deliverables-upload"
              title="Final deliverables"
              actions={
                snapshot?.finalZip?.available ? (
                  <button className="portal-btn-ghost h-7" type="button" disabled={busy} onClick={() => void downloadCurrentFinal()}>
                    <DownloadIcon size={14} />
                    Download current ZIP
                  </button>
                ) : null
              }
            >
              {hasApprovedConcept ? (
                <div className="space-y-3">
                  {finalUploadSuccess ? (
                    <FeatureNoticeCard variant="success" className="p-4" kicker="Upload complete" title="Final deliverables published" body={finalUploadSuccess} />
                  ) : null}
                  {snapshot?.finalZip?.available ? (
                    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[color-mix(in_srgb,var(--success)_30%,transparent)] bg-success-soft px-3 py-2.5 text-base text-fg">
                      <p>Current final ZIP is published and visible to the client.</p>
                      {shouldOfferFinalNotificationRetry(snapshot) ? (
                        <button className="portal-btn-secondary h-7" type="button" disabled={busy} onClick={() => void retryFinalNotification()}>
                          {busy ? "Sending…" : "Send/retry client notification"}
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                  <form className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-3 sm:flex-row sm:items-end" onSubmit={uploadFinalDeliverable}>
                    <label className="flex min-w-0 flex-1 flex-col gap-1.5 text-base">
                      <span className="font-medium text-fg">Final ZIP file</span>
                      <input
                        className="portal-field file:mr-3 file:rounded file:border-0 file:bg-surface-2 file:px-2 file:py-1 file:text-sm file:text-fg"
                        type="file"
                        accept=".zip,application/zip,application/x-zip-compressed"
                        onChange={(event) => setFinalZipFile(event.target.files?.[0] ?? null)}
                      />
                      <span className="text-sm text-fg-3">Standard ZIP only; 100 MB compressed / 500 MB expanded maximum.</span>
                    </label>
                    <button className="portal-btn-primary" type="submit" disabled={busy || !finalZipFile}>
                      {busy ? "Uploading…" : "Upload and publish"}
                    </button>
                  </form>
                </div>
              ) : (
                <EmptyLine>Final upload unlocks after concept approval. Approve a concept first to enable final deliverables upload.</EmptyLine>
              )}
            </Section>

            {snapshot?.stuck ? (
              <Section title="Webhook recovery">
                <div className="space-y-2 rounded-lg border border-[color-mix(in_srgb,var(--danger)_30%,transparent)] bg-danger-soft p-3 text-base">
                  <p className="text-fg-2">Use Stripe Checkout session id to retry idempotent fulfillment.</p>
                  <input className="portal-field" placeholder="cs_test_..." value={reprocessSessionId} onChange={(e) => setReprocessSessionId(e.target.value)} />
                  {snapshot.latestOrder?.stripeCheckoutSessionId ? <p className="text-sm text-fg-3">Latest order session: {snapshot.latestOrder.stripeCheckoutSessionId}</p> : null}
                  <button className="portal-btn-secondary" type="button" disabled={busy || !reprocessSessionId.trim()} onClick={() => void runAction(() => fetch("/api/admin/checkout/reprocess", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ session_id: reprocessSessionId.trim() }) }), "Reprocess failed")}>
                    Reprocess checkout session
                  </button>
                </div>
              </Section>
            ) : null}

            {snapshot?.timeline ? <ProjectTimeline timeline={snapshot.timeline} /> : null}
          </div>
        </main>

        <aside aria-label="Project properties" className="w-full shrink-0 space-y-4 border-t border-line bg-surface px-4 py-6 lg:w-[384px] lg:border-l lg:border-t-0 lg:px-5 lg:py-8">
          <PanelCard title="Allowances">
            <div className="divide-y divide-line">
              <EntitlementProgress label="Concepts" usage={snapshot?.entitlementUsage?.concepts} />
              <EntitlementProgress label="Revisions" usage={snapshot?.entitlementUsage?.revisions} />
            </div>
          </PanelCard>

          <PanelCard title="Details">
            <dl className="-my-2">
              <Property label="Status"><ProjectStatusBadge status={overviewStatus} /></Property>
              <Property label="Client">{snapshot?.clientContact?.fullName ?? <span className="text-fg-3">Name unavailable</span>}</Property>
              <Property label="Email">{snapshot?.clientContact?.email ? <span className="block truncate" title={snapshot.clientContact.email}>{snapshot.clientContact.email}</span> : <span className="text-fg-3">Email unavailable</span>}</Property>
              <Property label="Order">{snapshot?.latestOrder ? <span className="capitalize">{snapshot.latestOrder.status.toLowerCase().replace(/_/g, " ")}</span> : <span className="text-fg-3">None</span>}</Property>
              <Property label="Created">{formatDateTime(snapshot?.createdAt)}</Property>
              <Property label="Updated">{formatDateTime(snapshot?.updatedAt)}</Property>
              <Property label="Audit trail">
                <Link className="inline-flex items-center gap-1.5 text-fg underline decoration-line-strong underline-offset-4 hover:decoration-fg-3" href={`/admin/projects/${projectId}/audit`}>
                  <HistoryIcon size={14} className="text-fg-3" />
                  {snapshot?.recentAuditEventsCount ?? 0} recent events
                </Link>
              </Property>
              <Property label="Project ID"><CopyId value={projectId} /></Property>
            </dl>
          </PanelCard>

          <PanelCard title="Billing & invoices">
            {invoiceError ? <p className="text-sm text-danger">{invoiceError}</p> : null}
            {!loading && !invoiceError && invoices.length === 0 ? <p className="text-sm text-fg-3">No invoice documents available for this project yet.</p> : null}
            {!loading && invoices.length > 0 ? (
              <ul className="divide-y divide-line">
                {invoices.map((invoice) => {
                  const action = getInvoiceAction(invoice);
                  return (
                    <li key={invoice.id} className="flex items-start justify-between gap-3 py-2 first:pt-0 last:pb-0">
                      <div className="min-w-0">
                        <p className="text-base font-semibold tabular-nums text-fg">{new Intl.NumberFormat("en-GB", { style: "currency", currency: invoice.currency.toUpperCase() }).format(invoice.amountCents / 100)}</p>
                        <p className="text-sm text-fg-3"><span className="capitalize">{invoice.status}</span> · {new Date(invoice.date).toLocaleDateString("en-GB")}</p>
                      </div>
                      {action.href ? (
                        <a className="portal-btn-ghost h-8 shrink-0" href={action.href} target="_blank" rel="noreferrer" download={action.download ? "invoice.pdf" : undefined}>
                          {action.label}
                        </a>
                      ) : (
                        <span className="shrink-0 pt-1 text-sm text-fg-3">No document</span>
                      )}
                    </li>
                  );
                })}
              </ul>
            ) : null}
          </PanelCard>

          <details className="group rounded-xl border border-line bg-panel shadow-[var(--shadow-card)]">
            <summary className="flex cursor-pointer list-none items-center justify-between rounded-xl p-4 hover:bg-surface">
              <span className="portal-label">Admin tools</span>
              <ChevronDownIcon size={16} className="text-fg-3 transition-transform group-open:rotate-180" />
            </summary>
            <div className="space-y-3 border-t border-line p-4">
              <p className="text-sm font-medium text-fg">Admin entitlement override</p>
              <div className="grid grid-cols-2 gap-2">
                <label className="flex flex-col gap-1">
                  <span className="text-sm text-fg-2">Concept limit</span>
                  <input className="portal-field" value={conceptLimit} onChange={(e) => { setConceptLimit(e.target.value); setConceptDirty(true); overrideDirty.current.concepts = true; }} placeholder="e.g. 3" inputMode="numeric" />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-sm text-fg-2">Revision limit</span>
                  <input className="portal-field" value={revisionLimit} onChange={(e) => { setRevisionLimit(e.target.value); setRevisionDirty(true); overrideDirty.current.revisions = true; }} placeholder="e.g. 2" inputMode="numeric" />
                </label>
              </div>
              <label className="flex flex-col gap-1">
                <span className="text-sm text-fg-2">Reason (required and recorded in the audit trail)</span>
                <textarea
                  className="portal-field"
                  value={entitlementOverrideReason}
                  onChange={(e) => { setEntitlementOverrideReason(e.target.value); }}
                  maxLength={500}
                  placeholder="Why is this package entitlement changing?"
                  rows={2}
                  required
                />
              </label>
              <button className="portal-btn-secondary w-full" type="button" disabled={busy || !entitlementOverrideReason.trim()} onClick={() => void saveEntitlementOverrides()}>
                Save entitlement override
              </button>
              <div className="rounded-lg border border-[color-mix(in_srgb,var(--danger)_25%,transparent)] bg-danger-soft p-3">
                <p className="mb-2 text-sm font-medium text-danger">Danger zone</p>
                <button
                  className="portal-btn-danger w-full bg-panel"
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    if (!window.confirm("Full project reset? This deletes concepts, revisions, concept comments, and all non-system messages, and retires ALL final publication records. Stored files are retained; previously issued signed links remain valid until expiry. This is irreversible.")) return;
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
              <Link className="block text-sm text-fg-3 hover:text-fg" href={`/admin/projects/${projectId}/upload`}>Legacy upload</Link>
            </div>
          </details>
        </aside>
      </div>
    </PageShell>
  );
}
