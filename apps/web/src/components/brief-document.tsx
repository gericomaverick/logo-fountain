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
    <article className={`space-y-8 ${className}`.trim()}>
      <header className="border-b border-line pb-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="max-w-3xl">
            <h2 className="text-lg font-semibold tracking-tight text-fg">{title}</h2>
            {subtitle ? <p className="mt-1.5 max-w-[72ch] text-sm leading-6 text-fg-2">{subtitle}</p> : null}
            {meta ? <div className="mt-2 text-xs text-fg-2">{meta}</div> : null}
          </div>
          {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
        </div>
      </header>

      <div className="mt-6 space-y-8">{children}</div>
    </article>
  );
}

export function BriefSection({ title, description, children, className = "", tone = "neutral" }: BriefSectionProps) {
  const toneClass = tone === "paper"
    ? "border-line bg-panel"
    : "border-line bg-surface";

  return (
    <section className={`rounded-xl border p-4 sm:p-5 ${toneClass} ${className}`.trim()}>
      <div className="border-b border-line pb-3">
        <h3 className="text-lg font-semibold tracking-tight text-fg">{title}</h3>
        {description ? <p className="mt-1.5 max-w-[72ch] text-base leading-7 text-fg-2">{description}</p> : null}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

export function BriefField({ label, value, compact = false, className = "", valueClassName = "" }: BriefFieldProps) {
  return (
    <section className={`border-b border-line ${compact ? "py-3" : "py-4"} ${className}`.trim()}>
      <h4 className="text-sm font-medium text-fg-2">{label}</h4>
      <p className={`mt-2.5 max-w-[72ch] whitespace-pre-wrap text-base text-fg ${compact ? "leading-6" : "leading-7"} ${valueClassName}`.trim()}>{value || "—"}</p>
    </section>
  );
}

export function BriefFieldGrid({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`grid gap-4 ${className}`.trim()}>{children}</div>;
}
