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
function StageRing({ total, done, current, onBrand }: { total: number; done: number; current: number; onBrand: boolean }) {
  const size = 84;
  const stroke = 8;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const per = circumference / total;
  const gap = per * 0.125;
  const arc = per - gap;

  const filled = onBrand ? "var(--brand-block-fg)" : "var(--accent)";
  const empty = onBrand ? "rgba(255,255,255,0.28)" : "var(--line-strong)";
  // The stage being worked on sits between the two: started, not finished.
  const inProgress = onBrand ? "rgba(255,255,255,0.65)" : "var(--accent-hover)";

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
          stroke={index < done ? filled : index === current ? inProgress : empty}
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
 * It takes colour only when the next move is theirs: a stage waiting on us is a
 * quiet tinted panel, and a stage waiting on them is the brand block, so the
 * difference is visible from across the room rather than read.
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
  const waitingOnThem = Boolean(customerAction);

  return (
    <section aria-labelledby="project-stage-title">
      <h2 id="project-stage-title" className="mb-3 text-lg font-semibold tracking-tight text-fg">
        Where your project is
      </h2>

      <div
        className={
          waitingOnThem
            ? "brand-sheen rounded-xl p-5 sm:p-6"
            : "rounded-xl border border-line bg-surface p-5 sm:p-6"
        }
      >
        <div className="flex items-start justify-between gap-5">
          <div className="min-w-0">
        <p className={`text-sm font-semibold ${waitingOnThem ? "text-brand-block-fg-2" : "text-accent"}`}>Now</p>
        <p className={`mt-1 text-xl font-semibold tracking-tight ${waitingOnThem ? "text-brand-block-fg" : "text-fg"}`}>
          {stages.now.label}
        </p>
        {stages.now.timestamp ? (
          <time
            className={`mt-1 block text-sm ${waitingOnThem ? "text-brand-block-fg-2" : "text-fg-3"}`}
            dateTime={stages.now.timestamp}
          >
            Since {WHEN.format(new Date(stages.now.timestamp))}
          </time>
        ) : null}

          </div>

          <div className="relative shrink-0">
            <StageRing total={timeline.length} done={done} current={currentIndex} onBrand={waitingOnThem} />
            <span
              className={`absolute inset-0 flex flex-col items-center justify-center leading-none ${
                waitingOnThem ? "text-brand-block-fg" : "text-fg"
              }`}
            >
              <span className="text-lg font-semibold tabular-nums">{stageNumber}</span>
              <span className={`mt-0.5 text-sm ${waitingOnThem ? "text-brand-block-fg-2" : "text-fg-3"}`}>of {timeline.length}</span>
            </span>
          </div>
        </div>

        {waitingOnThem ? (
          <p className="mt-4 flex items-center gap-1.5 text-lg font-semibold text-brand-block-fg">
            <ChevronRightIcon size={18} />
            {customerAction}
          </p>
        ) : (
          <p className="mt-4 text-base text-fg-2">Nothing needed from you — we’ll tell you the moment there is.</p>
        )}

        {stages.next ? (
          <div className={`mt-5 border-t pt-4 ${waitingOnThem ? "border-[rgba(255,255,255,0.22)]" : "border-line"}`}>
            <p className={`text-sm font-semibold ${waitingOnThem ? "text-brand-block-fg-2" : "text-fg-3"}`}>Next</p>
            <p className={`mt-1 text-base ${waitingOnThem ? "text-brand-block-fg-2" : "text-fg-2"}`}>
              {nextStageCopy(stages.next.state, stages.next.label)}
            </p>
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
