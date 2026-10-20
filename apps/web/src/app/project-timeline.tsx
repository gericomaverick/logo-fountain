type TimelineItem = {
  state: string;
  label: string;
  completed: boolean;
  current: boolean;
  timestamp?: string;
};

const WHEN = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

/** Where the project is, and the one thing that happens after it. */
function pickStages(timeline: TimelineItem[]): { now: TimelineItem; next?: TimelineItem } | null {
  if (timeline.length === 0) return null;
  const index = timeline.findIndex((step) => step.current);
  // No current step means the work is finished: the last stage is where it rests.
  if (index === -1) return { now: timeline[timeline.length - 1]! };
  return { now: timeline[index]!, next: timeline[index + 1] };
}

/**
 * Eight stages listed out told someone mostly what was not happening. What they
 * want on opening their project is where it is now and what comes after it, so
 * that is all this shows.
 */
export function ProjectTimeline({ timeline, primaryCta }: { timeline: TimelineItem[]; primaryCta?: string | null }) {
  const stages = pickStages(timeline);
  if (!stages) return null;

  const done = timeline.filter((step) => step.completed).length;

  return (
    <section aria-labelledby="project-stage-title">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-3">
        <h2 id="project-stage-title" className="text-lg font-semibold tracking-tight text-fg">
          Where your project is
        </h2>
        <p className="text-sm text-fg-3 tabular-nums">
          Stage {Math.min(done + (stages.next ? 1 : 0), timeline.length)} of {timeline.length}
        </p>
      </div>

      <div className="rounded-xl border border-line bg-panel p-5">
        <p className="text-sm font-medium text-accent">Now</p>
        <p className="mt-1 text-xl font-semibold tracking-tight text-fg">{stages.now.label}</p>
        {stages.now.timestamp ? (
          <time className="mt-1 block text-sm text-fg-3" dateTime={stages.now.timestamp}>
            Since {WHEN.format(new Date(stages.now.timestamp))}
          </time>
        ) : null}
        {primaryCta ? <p className="mt-3 text-base text-fg-2">Next action: {primaryCta}</p> : null}

        {stages.next ? (
          <div className="mt-5 border-t border-line pt-4">
            <p className="text-sm font-medium text-fg-3">Then</p>
            <p className="mt-1 text-base text-fg-2">{stages.next.label}</p>
          </div>
        ) : null}
      </div>
    </section>
  );
}

/**
 * Space held while the project is fetched, the size of what replaces it, so the
 * page does not grow underneath whatever the person is already reading.
 */
export function ProjectTimelineSkeleton() {
  return (
    <section aria-hidden className="animate-pulse">
      <div className="mb-3 h-6 w-44 rounded bg-surface-2" />
      <div className="rounded-xl border border-line bg-panel p-5">
        <div className="h-4 w-10 rounded bg-surface-2" />
        <div className="mt-2 h-6 w-2/3 rounded bg-surface-2" />
        <div className="mt-2 h-4 w-32 rounded bg-surface-2" />
        <div className="mt-5 border-t border-line pt-4">
          <div className="h-4 w-12 rounded bg-surface-2" />
          <div className="mt-2 h-5 w-1/2 rounded bg-surface-2" />
        </div>
      </div>
    </section>
  );
}
