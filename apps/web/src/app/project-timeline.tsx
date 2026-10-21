import { ChevronRightIcon } from "@/components/icons";
import { nextStageCopy } from "@/lib/project-state-machine";

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
 * The stages as a ring: one segment each, filled as they complete. Decorative —
 * the count beside it is what gets read out — so it is hidden from assistive
 * technology rather than duplicating the sentence.
 *
 * Segments are drawn by dashing a single circle: each one shows `arc` of the
 * circumference and hides the rest, offset by its own share, with the whole
 * thing turned a quarter so it starts at the top.
 */
function StageRing({ total, done, current }: { total: number; done: number; current: number }) {
  const size = 84;
  const stroke = 8;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const per = circumference / total;
  const gap = per * 0.125;
  const arc = per - gap;

  return (
    <svg
      aria-hidden
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className="shrink-0"
      style={{ transform: "rotate(-90deg)" }}
    >
      {Array.from({ length: total }, (_, index) => (
        <circle
          key={index}
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          // The stage being worked on sits between the two: started, not finished.
          stroke={index < done ? "var(--accent)" : index === current ? "var(--accent-hover)" : "var(--line-strong)"}
          strokeDasharray={`${arc} ${circumference - arc}`}
          strokeDashoffset={-index * per}
        />
      ))}
    </svg>
  );
}

/**
 * Eight stages listed out told someone mostly what was not happening. This
 * shows where the project is and what follows.
 *
 * It is always the quiet panel. It used to turn into a block of brand colour
 * whenever the next move was the customer's — but the page already carries
 * exactly that in the block at the top, so two purple blocks then said the
 * same thing and fought over which was first. The ring keeps the brand colour;
 * the frame does not.
 */
export function ProjectTimeline({
  timeline,
  customerAction,
}: {
  timeline: TimelineItem[];
  customerAction?: string | null;
}) {
  const stages = pickStages(timeline);
  if (!stages) return null;

  const done = timeline.filter((step) => step.completed).length;
  const currentIndex = timeline.findIndex((step) => step.current);
  const stageNumber = currentIndex === -1 ? timeline.length : currentIndex + 1;

  return (
    <section aria-labelledby="project-stage-title">
      <h2 id="project-stage-title" className="mb-3 text-lg font-semibold tracking-tight text-fg">
        Where your project is
      </h2>

      <div className="rounded-xl border border-line bg-surface p-5 sm:p-6">
        <div className="flex items-start justify-between gap-5">
          <div className="min-w-0">
            <p className="portal-label text-accent">Now</p>
            <p className="portal-display mt-1 text-xl text-fg">{stages.now.label}</p>
            {stages.now.timestamp ? (
              <time className="mt-1 block text-sm text-fg-2" dateTime={stages.now.timestamp}>
                Since {WHEN.format(new Date(stages.now.timestamp))}
              </time>
            ) : null}
          </div>

          <div className="relative shrink-0">
            <StageRing total={timeline.length} done={done} current={currentIndex} />
            <span className="absolute inset-0 flex flex-col items-center justify-center leading-none text-fg">
              <span className="portal-display text-lg tabular-nums">{stageNumber}</span>
              <span className="mt-0.5 font-mono text-xs text-fg-2">of {timeline.length}</span>
            </span>
          </div>
        </div>

        {customerAction ? (
          <p className="mt-4 flex items-center gap-1.5 text-base font-semibold text-fg">
            <ChevronRightIcon size={18} className="text-accent" />
            {customerAction}
          </p>
        ) : (
          <p className="mt-4 text-base text-fg-2">Nothing needed from you — we’ll tell you the moment there is.</p>
        )}

        {stages.next ? (
          <div className="mt-5 border-t border-line pt-4">
            <p className="portal-label text-fg-2">Next</p>
            <p className="mt-1 text-base text-fg-2">{nextStageCopy(stages.next.state, stages.next.label)}</p>
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
      <div className="rounded-xl border border-line bg-surface p-5 sm:p-6">
        <div className="h-4 w-10 rounded bg-surface-2" />
        <div className="mt-2 h-6 w-2/3 rounded bg-surface-2" />
        <div className="mt-2 h-4 w-32 rounded bg-surface-2" />
        <div className="mt-4 h-5 w-1/2 rounded bg-surface-2" />
        <div className="mt-5 border-t border-line pt-4">
          <div className="h-4 w-12 rounded bg-surface-2" />
          <div className="mt-2 h-5 w-1/2 rounded bg-surface-2" />
        </div>
      </div>
    </section>
  );
}
