import Link from "next/link";
import type { ReactNode } from "react";

import { ChevronRightIcon } from "@/components/icons";

export type Crumb = { label: string; href?: string };

/** The bar across the top of a page: where you are, and what you can do here. */
export function PageHeader({ crumbs, actions }: { crumbs: Crumb[]; actions?: ReactNode }) {
  return (
    <header className="sticky top-0 z-10 flex h-12 shrink-0 items-center justify-between gap-3 border-b border-line bg-panel/90 px-4 backdrop-blur md:px-6">
      <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1 text-[13px]">
        {crumbs.map((crumb, index) => {
          const last = index === crumbs.length - 1;
          return (
            <span key={`${crumb.label}-${index}`} className="flex min-w-0 items-center gap-1">
              {index > 0 ? <ChevronRightIcon size={14} className="shrink-0 text-fg-3" /> : null}
              {crumb.href && !last ? (
                <Link href={crumb.href} className="truncate rounded px-1 py-0.5 text-fg-2 transition-colors hover:bg-surface-2 hover:text-fg">
                  {crumb.label}
                </Link>
              ) : (
                <span className={`truncate px-1 ${last ? "font-medium text-fg" : "text-fg-2"}`} aria-current={last ? "page" : undefined}>
                  {crumb.label}
                </span>
              )}
            </span>
          );
        })}
      </nav>
      {actions ? <div className="flex shrink-0 items-center gap-1.5">{actions}</div> : null}
    </header>
  );
}

/** A titled block in a page's main column. */
export function Section({
  title,
  count,
  actions,
  children,
  id,
}: {
  title: string;
  count?: number;
  actions?: ReactNode;
  children: ReactNode;
  id?: string;
}) {
  return (
    <section id={id} className="scroll-mt-16">
      <div className="mb-2 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-[13px] font-semibold text-fg">
          {title}
          {count !== undefined ? <span className="font-normal text-fg-3">{count}</span> : null}
        </h2>
        {actions ? <div className="flex items-center gap-1">{actions}</div> : null}
      </div>
      {children}
    </section>
  );
}

/** One line of a properties panel: a quiet label and its value. */
export function Property({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[96px_minmax(0,1fr)] items-start gap-3 py-1.5 text-[13px]">
      <dt className="pt-0.5 text-fg-3">{label}</dt>
      <dd className="m-0 min-w-0 text-fg">{children}</dd>
    </div>
  );
}

/** A muted line where a list would be, when it has nothing in it. */
export function EmptyLine({ children }: { children: ReactNode }) {
  return <p className="rounded-lg border border-dashed border-line px-4 py-6 text-center text-[13px] text-fg-3">{children}</p>;
}

/** A slim usage bar: how much of an allowance is taken. */
export function Meter({ ratio, label }: { ratio: number; label: string }) {
  const clamped = Math.max(0, Math.min(ratio, 1));
  return (
    <div className="h-1 w-full overflow-hidden rounded-full bg-surface-2" role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(clamped * 100)}>
      <div className="h-full rounded-full bg-accent transition-[width] duration-500" style={{ width: `${clamped * 100}%` }} />
    </div>
  );
}

const RELATIVE = new Intl.RelativeTimeFormat("en-GB", { numeric: "auto" });

/** "3 hours ago", "yesterday": for times in lists, with the full date kept for a tooltip. */
export function relativeTime(date: Date, now: Date = new Date()): string {
  const seconds = Math.round((date.getTime() - now.getTime()) / 1000);
  const steps: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ["year", 31_536_000],
    ["month", 2_592_000],
    ["week", 604_800],
    ["day", 86_400],
    ["hour", 3_600],
    ["minute", 60],
  ];
  for (const [unit, size] of steps) {
    if (Math.abs(seconds) >= size) return RELATIVE.format(Math.round(seconds / size), unit);
  }
  return "just now";
}
