import type { ReactNode } from "react";

type BriefDocumentProps = {
  title: string;
  subtitle?: string;
  meta?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
};

type BriefFieldProps = {
  label: string;
  value: string;
  compact?: boolean;
  className?: string;
  valueClassName?: string;
};

type BriefSectionProps = {
  title: string;
  description?: string;
  children?: ReactNode;
  className?: string;
  tone?: "neutral" | "paper";
};

export function BriefDocument({ title, subtitle, meta, actions, children, className = "" }: BriefDocumentProps) {
  return (
    <article className={`rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm md:p-8 ${className}`.trim()}>
      <header className="border-b border-neutral-200 pb-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="max-w-3xl">
            <h2 className="text-xl font-semibold text-neutral-900">{title}</h2>
            {subtitle ? <p className="mt-1 max-w-[72ch] text-sm leading-relaxed text-neutral-600">{subtitle}</p> : null}
            {meta ? <div className="mt-2 text-xs text-neutral-500">{meta}</div> : null}
          </div>
          {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
        </div>
      </header>

      <div className="mt-5 space-y-5">{children}</div>
    </article>
  );
}

export function BriefSection({ title, description, children, className = "", tone = "neutral" }: BriefSectionProps) {
  const toneClass = tone === "paper"
    ? "border-amber-100 bg-amber-50/40"
    : "border-neutral-200 bg-neutral-50/70";

  return (
    <section className={`rounded-2xl border p-5 ${toneClass} ${className}`.trim()}>
      <div className="border-b border-neutral-200 pb-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-500">Section</p>
        <h3 className="mt-1 text-base font-semibold text-neutral-900">{title}</h3>
        {description ? <p className="mt-1 max-w-[72ch] text-sm leading-relaxed text-neutral-600">{description}</p> : null}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

export function BriefField({ label, value, compact = false, className = "", valueClassName = "" }: BriefFieldProps) {
  return (
    <section className={`rounded-xl border border-neutral-200 bg-white ${compact ? "p-3" : "p-4"} ${className}`.trim()}>
      <h4 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-500">{label}</h4>
      <p className={`mt-2 max-w-[72ch] whitespace-pre-wrap text-sm text-neutral-900 ${compact ? "leading-6" : "leading-7"} ${valueClassName}`.trim()}>{value || "—"}</p>
    </section>
  );
}

export function BriefFieldGrid({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`grid gap-4 ${className}`.trim()}>{children}</div>;
}
