import { PROJECT_STATE_LABELS, type ProjectState } from "@/lib/project-state-machine";

// Each state has a colour and a progress icon in the manner of Linear's
// workflow states: a circle that fills as the project moves towards delivery.
type Shape = "dashed" | "empty" | "quarter" | "half" | "three" | "full" | "done" | "paused" | "stopped";

const STATUS_STYLE: Record<ProjectState | "APPROVED", { color: string; shape: Shape }> = {
  AWAITING_BRIEF: { color: "var(--fg-3)", shape: "dashed" },
  BRIEF_SUBMITTED: { color: "#4ea7fc", shape: "empty" },
  IN_DESIGN: { color: "#e2b93b", shape: "quarter" },
  CONCEPTS_READY: { color: "#26b5ce", shape: "half" },
  REVISIONS_IN_PROGRESS: { color: "#f2994a", shape: "half" },
  AWAITING_APPROVAL: { color: "#a77dfa", shape: "three" },
  APPROVED: { color: "#4cb782", shape: "three" },
  FINAL_FILES_READY: { color: "#4cb782", shape: "full" },
  DELIVERED: { color: "var(--accent)", shape: "done" },
  ON_HOLD: { color: "#f2994a", shape: "paused" },
  CANCELLED: { color: "var(--fg-3)", shape: "stopped" },
  REFUNDED: { color: "var(--fg-3)", shape: "stopped" },
};

const OVERVIEW_STATUS_LABEL_OVERRIDES: Record<string, string> = {
  APPROVED: "Approved",
};

function isProjectState(value: string): value is ProjectState {
  return value in PROJECT_STATE_LABELS;
}

function styleOf(status: string) {
  return status in STATUS_STYLE ? STATUS_STYLE[status as keyof typeof STATUS_STYLE] : { color: "var(--fg-3)", shape: "empty" as Shape };
}

/** Classes for a neutral status chip; the colour lives in the icon. */
export function getProjectStatusToneClass(): string {
  return "border-line bg-surface text-fg-2";
}

export function getProjectStatusLabel(status: string): string {
  if (status in OVERVIEW_STATUS_LABEL_OVERRIDES) return OVERVIEW_STATUS_LABEL_OVERRIDES[status];
  if (!isProjectState(status)) return status;
  return PROJECT_STATE_LABELS[status];
}

const FILL: Partial<Record<Shape, number>> = { quarter: 0.25, half: 0.5, three: 0.75, full: 1 };

/** The state's progress circle, 14px by default. */
export function StatusIcon({ status, size = 14 }: { status: string; size?: number }) {
  const { color, shape } = styleOf(status);
  const fill = FILL[shape];
  const r = 3.5;
  // A pie wedge of the inner disc, drawn clockwise from twelve o'clock.
  const wedge = (portion: number) => {
    if (portion >= 1) return <circle cx="7" cy="7" r={r} fill={color} />;
    const angle = portion * 2 * Math.PI;
    const x = 7 + r * Math.sin(angle);
    const y = 7 - r * Math.cos(angle);
    return <path d={`M7 7 L7 ${7 - r} A${r} ${r} 0 ${portion > 0.5 ? 1 : 0} 1 ${x} ${y} Z`} fill={color} />;
  };
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" aria-hidden focusable="false" className="shrink-0">
      {shape === "done" ? (
        <>
          <circle cx="7" cy="7" r="6" fill={color} />
          <path d="M4.3 7.2 6.1 9 9.7 5.3" fill="none" stroke="var(--panel)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </>
      ) : shape === "stopped" ? (
        <>
          <circle cx="7" cy="7" r="6" fill={color} opacity="0.85" />
          <path d="M5 5l4 4M9 5 5 9" stroke="var(--panel)" strokeWidth="1.5" strokeLinecap="round" />
        </>
      ) : shape === "paused" ? (
        <>
          <circle cx="7" cy="7" r="5.25" fill="none" stroke={color} strokeWidth="1.5" />
          <path d="M5.75 5v4M8.25 5v4" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
        </>
      ) : (
        <>
          <circle cx="7" cy="7" r="5.25" fill="none" stroke={color} strokeWidth="1.5" strokeDasharray={shape === "dashed" ? "1.4 1.6" : undefined} />
          {fill ? wedge(fill) : null}
        </>
      )}
    </svg>
  );
}

export function ProjectStatusBadge({ status }: { status: string }) {
  const { color } = styleOf(status);
  // A wash of the state's colour; the text stays ink so pale states stay legible.
  return (
    <span
      className="portal-badge h-7 text-fg"
      style={{ background: `color-mix(in srgb, ${color} 13%, var(--panel))`, borderColor: `color-mix(in srgb, ${color} 32%, transparent)` }}
    >
      <StatusIcon status={status} size={13} />
      {getProjectStatusLabel(status)}
    </span>
  );
}
