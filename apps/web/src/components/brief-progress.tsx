"use client";

/** Position, not a certificate of validity. Only previous steps are destinations. */
export function BriefProgress({ labels, activeIndex, onSelect }: {
  labels: string[]; activeIndex: number; onSelect: (index: number) => void;
}) {
  return (
    <nav aria-label="Brief progress">
      <ol className="hidden lg:block">
        {labels.map((label, index) => {
          const previous = index < activeIndex;
          const current = index === activeIndex;
          const content = <>
            <span aria-hidden className={`absolute left-0 top-2 flex h-7 w-7 items-center justify-center rounded-full text-sm font-semibold tabular-nums ${current
              ? "bg-accent text-[var(--accent-fg)] ring-4 ring-accent-soft"
              : "border border-fg-3 bg-panel text-fg-2"}`}>{index + 1}</span>
            <span className={current ? "font-semibold text-fg" : "text-fg-2"}>{label}</span>
          </>;
          return <li key={label} className="relative">
            {index < labels.length - 1 ? <span aria-hidden className="absolute left-[13px] top-9 bottom-0 w-px bg-line-strong" /> : null}
            {previous ? <button type="button" onClick={() => onSelect(index)}
              className="relative block min-h-16 w-full rounded-md py-2 pr-2 pl-10 text-left text-base hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
              <span className="sr-only">Return to </span>{content}
            </button> : <div aria-current={current ? "step" : undefined} className="relative min-h-16 py-2 pr-2 pl-10 text-base">{content}</div>}
          </li>;
        })}
      </ol>
      <ol className="flex items-center gap-2 lg:hidden">
        {labels.map((label, index) => <li key={label} className="flex flex-1" aria-current={index === activeIndex ? "step" : undefined}>
          <span className="sr-only">{label}{index === activeIndex ? " (current step)" : index < activeIndex ? " (previous step)" : ""}</span>
          <span aria-hidden className={`h-1.5 flex-1 rounded-full ${index === activeIndex ? "bg-accent" : index < activeIndex ? "bg-fg-3" : "bg-surface-2"}`} />
        </li>)}
      </ol>
    </nav>
  );
}
