type TimelineItem = {
  state: string;
  label: string;
  completed: boolean;
  current: boolean;
  timestamp?: string;
};

export function ProjectTimeline({ timeline, primaryCta }: { timeline: TimelineItem[]; primaryCta?: string | null }) {
  return (
    <section className="mt-6 rounded border border-neutral-200 p-4">
      <h2 className="text-lg font-medium">Timeline</h2>
      {primaryCta ? <p className="mt-1 text-sm text-neutral-600">Next action: <span className="font-medium">{primaryCta}</span></p> : null}
      <ol className="mt-4 space-y-2">
        {timeline.map((step) => (
          <li key={step.state} className="flex items-start gap-2 text-sm">
            <span className={`mt-0.5 inline-block h-2.5 w-2.5 rounded-full ${step.current ? "bg-blue-600" : step.completed ? "bg-green-600" : "bg-neutral-300"}`} />
            <div>
              <p className={step.current ? "font-semibold text-neutral-900" : "text-neutral-700"}>{step.label}</p>
              {step.timestamp ? <p className="text-xs text-neutral-500">{new Date(step.timestamp).toLocaleString()}</p> : null}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
