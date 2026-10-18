"use client";

import { CheckIcon } from "./icons";

/**
 * Where you are in the brief. A vertical timeline in its own rail beside the
 * questions, reading top to bottom like the stages on the project hub — so it
 * never scrolls sideways and never truncates a label.
 *
 * Below the rail's breakpoint it collapses to a row of dots: position without
 * labels, which the section heading underneath supplies anyway.
 *
 * A step already passed is a link back to it. Going forward stays with the
 * Continue button, which is what checks the required answers.
 */
export function BriefProgress({
  labels,
  activeIndex,
  onSelect,
}: {
  labels: string[];
  activeIndex: number;
  onSelect: (index: number) => void;
}) {
  return (
    <nav aria-label="Brief progress">
      {/* The rail. */}
      <ol className="hidden lg:block">
        {labels.map((label, index) => {
          const isDone = index < activeIndex;
          const isCurrent = index === activeIndex;
          const isLast = index === labels.length - 1;

          return (
            <li key={label} className={`relative pl-9 ${isLast ? "" : "pb-7"}`}>
              {!isLast ? (
                <span
                  aria-hidden
                  className={`absolute left-[13px] top-7 bottom-0 w-px ${index < activeIndex ? "bg-accent" : "bg-line-strong"}`}
                />
              ) : null}
              <span aria-hidden className="absolute left-0 top-0">
                <Dot isDone={isDone} isCurrent={isCurrent} index={index} />
              </span>

              {isDone ? (
                <button
                  type="button"
                  onClick={() => onSelect(index)}
                  className="rounded text-left text-base text-fg-2 underline-offset-4 hover:text-fg hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]"
                >
                  {label}
                </button>
              ) : (
                <span
                  className={`block text-base ${isCurrent ? "font-semibold text-fg" : "text-fg-3"}`}
                  aria-current={isCurrent ? "step" : undefined}
                >
                  {label}
                </span>
              )}
            </li>
          );
        })}
      </ol>

      {/* Narrower than the rail: dots only, no sideways scrolling. */}
      <ol className="flex items-center gap-2 lg:hidden">
        {labels.map((label, index) => (
          <li key={label} className="flex flex-1 items-center gap-2">
            <span className="sr-only">
              {label}
              {index === activeIndex ? " (current step)" : ""}
            </span>
            <span
              aria-hidden
              className={`h-1.5 flex-1 rounded-full ${index < activeIndex ? "bg-accent" : index === activeIndex ? "bg-accent" : "bg-surface-2"}`}
            />
          </li>
        ))}
      </ol>
    </nav>
  );
}

function Dot({ isDone, isCurrent, index }: { isDone: boolean; isCurrent: boolean; index: number }) {
  if (isDone) {
    return (
      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-accent text-[var(--accent-fg)]">
        <CheckIcon size={14} />
      </span>
    );
  }

  if (isCurrent) {
    return (
      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-accent text-sm font-semibold tabular-nums text-[var(--accent-fg)] ring-4 ring-accent-soft">
        {index + 1}
      </span>
    );
  }

  return (
    <span className="flex h-7 w-7 items-center justify-center rounded-full border border-line-strong bg-panel text-sm font-medium tabular-nums text-fg-3">
      {index + 1}
    </span>
  );
}
