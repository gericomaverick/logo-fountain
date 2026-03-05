type TimelineItem = {
  state: string;
  label: string;
  completed: boolean;
  current: boolean;
  timestamp?: string;
};

function stepTone(step: TimelineItem): string {
  if (step.current) return "border-sky-200 bg-sky-50";
  if (step.completed) return "border-emerald-200 bg-emerald-50";
  return "border-neutral-200 bg-neutral-50";
}

function markerTone(step: TimelineItem): string {
  if (step.current) return "border-sky-300 bg-sky-500";
  if (step.completed) return "border-emerald-300 bg-emerald-500";
  return "border-neutral-300 bg-white";
}

export function ProjectTimeline({ timeline, primaryCta }: { timeline: TimelineItem[]; primaryCta?: string | null }) {
  return (
    <section className="mt-4 rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-neutral-900">Timeline</h2>
          <p className="mt-1 text-sm text-neutral-600">Key milestones and project state changes.</p>
        </div>
        {primaryCta ? (
          <p className="rounded-full border border-neutral-200 bg-neutral-50 px-3 py-1 text-xs font-medium text-neutral-700">
            Next action: {primaryCta}
          </p>
        ) : null}
      </div>

      <ol className="mt-5 space-y-3">
        {timeline.map((step, index) => (
          <li key={`${step.state}-${index}`} className={`relative rounded-xl border p-3 pl-11 text-sm ${stepTone(step)}`}>
            {index < timeline.length - 1 ? <span aria-hidden className="absolute bottom-[-14px] left-5 top-8 w-px bg-neutral-200" /> : null}
            <span className={`absolute left-3 top-3 inline-flex h-4 w-4 items-center justify-center rounded-full border-2 ${markerTone(step)}`}>
              {step.completed ? <span className="h-1.5 w-1.5 rounded-full bg-white" aria-hidden /> : null}
            </span>
            <p className={`leading-tight ${step.current ? "font-semibold text-neutral-900" : "font-medium text-neutral-800"}`}>{step.label}</p>
            {step.timestamp ? <p className="mt-1 text-xs text-neutral-500">{new Date(step.timestamp).toLocaleString()}</p> : null}
          </li>
        ))}
      </ol>
    </section>
  );
}
