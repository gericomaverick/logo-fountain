import { CheckIcon } from "@/components/icons";

type TimelineItem = {
  state: string;
  label: string;
  completed: boolean;
  current: boolean;
  timestamp?: string;
};

const WHEN = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

function Marker({ step }: { step: TimelineItem }) {
  if (step.completed && !step.current) {
    return (
      <span className="flex h-4 w-4 items-center justify-center rounded-full bg-accent text-[var(--accent-fg)]">
        <CheckIcon size={10} strokeWidth={3} />
      </span>
    );
  }
  if (step.current) {
    return (
      <span className="flex h-4 w-4 items-center justify-center rounded-full border-2 border-accent bg-panel">
        <span className="h-1.5 w-1.5 rounded-full bg-accent" />
      </span>
    );
  }
  return <span className="block h-4 w-4 rounded-full border-2 border-dashed border-line-strong bg-panel" />;
}

/**
 * Space held for the timeline while the project is still being fetched. The
 * snapshot arrives after first paint, so without this the page ends, then grows
 * a timeline underneath whatever the person was already reading.
 *
 * Eight steps, because that is what buildTimeline lays out.
 */
export function ProjectTimelineSkeleton() {
  return (
    <section aria-hidden className="animate-pulse">
      <div className="mb-3 h-6 w-24 rounded bg-surface-2" />
      <ol className="space-y-3">
        {Array.from({ length: 8 }, (_, index) => (
          <li key={index} className="flex items-center gap-3">
            <span className="h-4 w-4 shrink-0 rounded-full bg-surface-2" />
            <span className="h-4 flex-1 rounded bg-surface-2" style={{ maxWidth: `${52 - index * 3}%` }} />
          </li>
        ))}
      </ol>
    </section>
  );
}

/** The project's milestones as a compact step list: done, current, still to come. */
export function ProjectTimeline({ timeline, primaryCta }: { timeline: TimelineItem[]; primaryCta?: string | null }) {
  return (
    <section aria-labelledby="project-timeline-title">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 id="project-timeline-title" className="text-lg font-semibold tracking-tight text-fg">
          Timeline
        </h2>
        {primaryCta ? (
          <p className="rounded-full border border-line bg-surface px-2.5 py-0.5 text-sm font-medium text-fg-2">Next action: {primaryCta}</p>
        ) : null}
      </div>

      <ol className="rounded-lg border border-line bg-panel px-3 py-2">
        {timeline.map((step, index) => (
          <li key={`${step.state}-${index}`} className="relative flex items-center gap-3 py-2 text-base">
            {index < timeline.length - 1 ? <span aria-hidden className="absolute left-[7.5px] top-[26px] h-[calc(100%-16px)] w-px bg-line" /> : null}
            <span className="relative z-[1] flex shrink-0">
              <Marker step={step} />
            </span>
            <span className={`flex-1 ${step.current ? "font-semibold text-fg" : step.completed ? "text-fg" : "text-fg-3"}`}>{step.label}</span>
            {step.timestamp ? (
              <time className="shrink-0 text-sm text-fg-3" dateTime={step.timestamp}>
                {WHEN.format(new Date(step.timestamp))}
              </time>
            ) : null}
          </li>
        ))}
      </ol>
    </section>
  );
}
