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
};

export function BriefDocument({ title, subtitle, meta, actions, children, className = "" }: BriefDocumentProps) {
  return (
    <article className={`rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm md:p-8 ${className}`.trim()}>
      <header className="border-b border-neutral-200 pb-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="max-w-3xl">
            <h2 className="text-xl font-semibold text-neutral-900">{title}</h2>
            {subtitle ? <p className="mt-1 text-sm leading-relaxed text-neutral-600">{subtitle}</p> : null}
            {meta ? <div className="mt-2 text-xs text-neutral-500">{meta}</div> : null}
          </div>
          {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
        </div>
      </header>

      <div className="mt-5 space-y-4">{children}</div>
    </article>
  );
}

export function BriefField({ label, value, compact = false }: BriefFieldProps) {
  return (
    <section className={`rounded-xl border border-neutral-200 bg-white ${compact ? "p-3" : "p-4"}`}>
      <h3 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-500">{label}</h3>
      <p className={`mt-2 whitespace-pre-wrap text-sm text-neutral-900 ${compact ? "leading-6" : "leading-7"}`}>{value || "—"}</p>
    </section>
  );
}

export function BriefFieldGrid({ children }: { children: ReactNode }) {
  return <div className="grid gap-3">{children}</div>;
}
