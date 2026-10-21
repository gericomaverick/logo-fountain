import type { ReactNode } from "react";

import { Meter } from "@/components/ui";

export type EntitlementUsage = { limit: number; consumed: number; reserved?: number; remaining: number; unlimited?: boolean; configured?: boolean };

export function resolveUsage(usage: EntitlementUsage | undefined) {
  const limit = Math.max(usage?.limit ?? 0, 0);
  const consumed = Math.max(usage?.consumed ?? 0, 0);
  const reserved = Math.max(usage?.reserved ?? 0, 0);
  const allocated = Math.min(consumed + reserved, limit);
  const remaining = Math.max(limit - consumed - reserved, 0);
  const ratio = limit > 0 ? Math.min((allocated / limit) * 100, 100) : 0;

  return { limit, consumed, reserved, allocated, remaining, ratio };
}

export type AllowanceTone = "plenty" | "last" | "out" | "neutral";

export function allowanceTone(usage: EntitlementUsage | undefined, remaining: number): AllowanceTone {
  if (!usage || usage.configured === false || usage.unlimited) return "neutral";
  if (remaining <= 0) return "out";
  // "Last one" only once some have gone: a one-concept package isn't a warning.
  if (remaining === 1 && (usage.limit ?? 0) > 1) return "last";
  return "plenty";
}

/**
 * The word, and the tint behind it.
 *
 * The tint carries the tone and the word is set in ink, which clears AA on
 * every surface — the coloured text these used did not: amber on an amber tint
 * measured 3.3:1, and any amber dark enough to pass on parchment is a brown.
 * The meter itself is always the brand purple, because it answers "how many",
 * not "how worried": blocks of dark ochre and red read as dirt beside the
 * warm backgrounds, and the word above them has already said it.
 */
const TONE_STYLE: Record<AllowanceTone, { label: string; chip: string }> = {
  plenty: { label: "Available", chip: "bg-success-soft text-fg" },
  last: { label: "Last one", chip: "bg-warning-soft text-fg" },
  out: { label: "Used up", chip: "bg-danger-soft text-fg" },
  neutral: { label: "", chip: "bg-surface-2 text-fg-2" },
};

/** One allowance, sized to be read at a glance: what's left, of how many, and what's pending. */
export function Allowance({ label, usage }: { label: string; usage: EntitlementUsage | undefined }) {
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
        <span className="portal-display text-2xl tabular-nums text-fg">{usage?.unlimited ? stats.consumed : stats.remaining}</span>
        <span className="text-sm text-fg-2">{usage?.unlimited ? "used" : `left of ${stats.limit}`}</span>
      </p>
      {segmented ? (
        <div className="mt-2 flex gap-1" role="meter" aria-label={`${label}: ${stats.consumed} used, ${stats.reserved} pending, ${stats.remaining} left`} aria-valuemin={0} aria-valuemax={stats.limit} aria-valuenow={stats.allocated}>
          {Array.from({ length: stats.limit }, (_, index) => {
            const state = index < stats.consumed ? "used" : index < stats.consumed + stats.reserved ? "pending" : "free";
            return (
              <span
                key={index}
                className={`h-2 flex-1 rounded-full ${state === "used" ? "bg-accent" : state === "pending" ? "bg-[repeating-linear-gradient(135deg,var(--accent)_0_3px,var(--accent-soft)_3px_6px)]" : "bg-surface-2 shadow-[inset_0_0_0_1px_var(--line)]"}`}
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

/** A defined block of a properties column. */
export function PanelCard({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
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
