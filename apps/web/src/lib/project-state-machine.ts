export const PROJECT_STATES = [
  "AWAITING_BRIEF",
  "BRIEF_SUBMITTED",
  "IN_DESIGN",
  "CONCEPTS_READY",
  "REVISIONS_IN_PROGRESS",
  "AWAITING_APPROVAL",
  "FINAL_FILES_READY",
  "DELIVERED",
  "ON_HOLD",
  "CANCELLED",
  "REFUNDED",
] as const;

export type ProjectState = (typeof PROJECT_STATES)[number];

export type TimelineItem = {
  state: ProjectState;
  label: string;
  completed: boolean;
  current: boolean;
  timestamp?: string;
};

const FLOW_STATES: ProjectState[] = [
  "AWAITING_BRIEF",
  "BRIEF_SUBMITTED",
  "IN_DESIGN",
  "CONCEPTS_READY",
  "REVISIONS_IN_PROGRESS",
  "AWAITING_APPROVAL",
  "FINAL_FILES_READY",
  "DELIVERED",
];

export const PROJECT_STATE_LABELS: Record<ProjectState, string> = {
  AWAITING_BRIEF: "Awaiting brief",
  BRIEF_SUBMITTED: "Brief submitted",
  IN_DESIGN: "In design",
  CONCEPTS_READY: "Concepts ready",
  REVISIONS_IN_PROGRESS: "Revisions in progress",
  AWAITING_APPROVAL: "Awaiting approval",
  FINAL_FILES_READY: "Final files ready",
  DELIVERED: "Delivered",
  ON_HOLD: "On hold",
  CANCELLED: "Cancelled",
  REFUNDED: "Refunded",
};

export const PRIMARY_CTA_BY_STATE: Record<ProjectState, string> = {
  AWAITING_BRIEF: "Submit brief",
  BRIEF_SUBMITTED: "Design in progress",
  IN_DESIGN: "Design in progress",
  CONCEPTS_READY: "Review concepts",
  REVISIONS_IN_PROGRESS: "Await revised concepts",
  AWAITING_APPROVAL: "Await final upload",
  FINAL_FILES_READY: "Download final files",
  DELIVERED: "Project completed",
  ON_HOLD: "Resolve hold",
  CANCELLED: "Project cancelled",
  REFUNDED: "Project refunded",
};

const TRANSITIONS: Record<ProjectState, ProjectState[]> = {
  AWAITING_BRIEF: ["BRIEF_SUBMITTED", "ON_HOLD", "CANCELLED", "REFUNDED"],
  BRIEF_SUBMITTED: ["IN_DESIGN", "ON_HOLD", "CANCELLED", "REFUNDED"],
  IN_DESIGN: ["CONCEPTS_READY", "ON_HOLD", "CANCELLED", "REFUNDED"],
  CONCEPTS_READY: ["REVISIONS_IN_PROGRESS", "AWAITING_APPROVAL", "FINAL_FILES_READY", "ON_HOLD", "CANCELLED", "REFUNDED"],
  REVISIONS_IN_PROGRESS: ["CONCEPTS_READY", "ON_HOLD", "CANCELLED", "REFUNDED"],
  AWAITING_APPROVAL: ["FINAL_FILES_READY", "ON_HOLD", "CANCELLED", "REFUNDED"],
  FINAL_FILES_READY: ["DELIVERED", "ON_HOLD", "CANCELLED", "REFUNDED"],
  DELIVERED: ["ON_HOLD", "REFUNDED"],
  ON_HOLD: [
    "AWAITING_BRIEF",
    "BRIEF_SUBMITTED",
    "IN_DESIGN",
    "CONCEPTS_READY",
    "REVISIONS_IN_PROGRESS",
    "AWAITING_APPROVAL",
    "FINAL_FILES_READY",
    "DELIVERED",
    "CANCELLED",
    "REFUNDED",
  ],
  CANCELLED: ["REFUNDED"],
  REFUNDED: [],
};

function isProjectState(value: string): value is ProjectState {
  return (PROJECT_STATES as readonly string[]).includes(value);
}

export function getAllowedTransitions(from: string): ProjectState[] {
  if (!isProjectState(from)) return [];
  return TRANSITIONS[from];
}

export function canTransition(from: string, to: string): boolean {
  if (!isProjectState(from) || !isProjectState(to)) return false;
  return TRANSITIONS[from].includes(to);
}

export function applyTransition(current: string, next: string, context?: { reason?: string; onHoldPreviousState?: string }) {
  const allowed = getAllowedTransitions(current);

  if (!isProjectState(current) || !isProjectState(next)) {
    return {
      ok: false as const,
      allowed,
      error: "INVALID_STATE",
    };
  }

  if (next === "ON_HOLD" && !context?.reason?.trim()) {
    return {
      ok: false as const,
      allowed,
      error: "HOLD_REASON_REQUIRED",
    };
  }

  if ((next === "CANCELLED" || next === "REFUNDED") && !context?.reason?.trim()) {
    return {
      ok: false as const,
      allowed,
      error: "REASON_REQUIRED",
    };
  }

  if (!canTransition(current, next)) {
    return {
      ok: false as const,
      allowed,
      error: "INVALID_TRANSITION",
    };
  }

  return {
    ok: true as const,
    from: current,
    to: next,
    label: PROJECT_STATE_LABELS[next],
    primaryCta: PRIMARY_CTA_BY_STATE[next],
  };
}

export function buildTimeline(currentState: string, timestamps: Partial<Record<ProjectState, string>> = {}): TimelineItem[] {
  const flow = FLOW_STATES;
  const currentIdx = flow.indexOf((isProjectState(currentState) ? currentState : "AWAITING_BRIEF") as ProjectState);

  if (currentState === "ON_HOLD" || currentState === "CANCELLED" || currentState === "REFUNDED") {
    const terminal = currentState as ProjectState;
    return [
      ...flow.map((state) => ({
        state,
        label: PROJECT_STATE_LABELS[state],
        completed: false,
        current: false,
        timestamp: timestamps[state],
      })),
      {
        state: terminal,
        label: PROJECT_STATE_LABELS[terminal],
        completed: false,
        current: true,
        timestamp: timestamps[terminal],
      },
    ];
  }

  return flow.map((state, idx) => ({
    state,
    label: PROJECT_STATE_LABELS[state],
    completed: idx < currentIdx,
    current: idx === currentIdx,
    timestamp: timestamps[state],
  }));
}
