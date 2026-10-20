"use client";

/** Horizontal position, not a certificate of validity. Only previous steps are destinations. */
export function BriefProgress({ labels, activeIndex, onSelect }: {
  labels: string[]; activeIndex: number; onSelect: (index: number) => void;
}) {
  return (
    <nav aria-label="Brief progress" className="relative">
      <div role="progressbar" aria-label="Brief step" aria-valuemin={1} aria-valuemax={labels.length}
        aria-valuenow={activeIndex + 1} aria-valuetext={`Step ${activeIndex + 1} of ${labels.length}: ${labels[activeIndex]}`}
        className="absolute top-5 h-1 overflow-hidden rounded-full bg-surface-2"
        style={{ left: `${50 / labels.length}%`, right: `${50 / labels.length}%` }}>
        <div className="h-full bg-accent" style={{ width: `${labels.length > 1 ? activeIndex / (labels.length - 1) * 100 : 100}%` }} />
      </div>
      <ol className="flex">
        {labels.map((label, index) => {
          const previous = index < activeIndex;
          const current = index === activeIndex;
          const content = <>
            <span aria-hidden className={`relative flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-semibold tabular-nums ${current
              ? "bg-accent text-[var(--accent-fg)] ring-4 ring-accent-soft"
              : "border border-fg-3 bg-surface text-fg-2"}`}>{index + 1}</span>
            <span className={`relative hidden px-1 text-sm sm:block ${current ? "font-semibold text-fg" : "text-fg-2"}`}>{label}</span>
            <span className="sr-only sm:hidden">{label}{current ? " (current step)" : ""}</span>
          </>;
          return <li key={label} className="relative min-w-0 flex-1" aria-current={current ? "step" : undefined}>
            {previous ? <button type="button" onClick={() => onSelect(index)}
              className="relative flex min-h-11 w-full flex-col items-center gap-2 rounded-md px-1 py-2 text-center hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
              <span className="sr-only">Return to </span>{content}
            </button> : <div className="relative flex min-h-11 flex-col items-center gap-2 px-1 py-2 text-center">{content}</div>}
          </li>;
        })}
      </ol>
    </nav>
  );
}
