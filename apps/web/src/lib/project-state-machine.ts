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

export type TimelineState = ProjectState | "APPROVED";

export type TimelineItem = {
  state: TimelineState;
  label: string;
  completed: boolean;
  current: boolean;
  timestamp?: string;
};

const FLOW_STEPS: Array<{ state: TimelineState; label: string; sourceState?: ProjectState }> = [
  { state: "AWAITING_BRIEF", label: "Awaiting brief" },
  { state: "BRIEF_SUBMITTED", label: "Brief submitted" },
  { state: "IN_DESIGN", label: "In design" },
  { state: "CONCEPTS_READY", label: "Concepts ready" },
  { state: "REVISIONS_IN_PROGRESS", label: "Revisions in progress" },
  { state: "AWAITING_APPROVAL", label: "Awaiting approval" },
  { state: "APPROVED", label: "Approved", sourceState: "AWAITING_APPROVAL" },
  { state: "FINAL_FILES_READY", label: "Final files ready" },
  { state: "DELIVERED", label: "Delivered" },
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
  BRIEF_SUBMITTED: ["IN_DESIGN", "CONCEPTS_READY", "ON_HOLD", "CANCELLED", "REFUNDED"],
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

export function buildTimeline(
  currentState: string,
  timestamps: Partial<Record<ProjectState, string>> = {},
  options?: { hasApprovedMilestone?: boolean },
): TimelineItem[] {
  const isExplicitApprovedState = currentState === "APPROVED";
  const current = isProjectState(currentState)
    ? currentState
    : isExplicitApprovedState
      ? "AWAITING_APPROVAL"
      : "AWAITING_BRIEF";
  const stateOrder: ProjectState[] = [
    "AWAITING_BRIEF",
    "BRIEF_SUBMITTED",
    "IN_DESIGN",
    "CONCEPTS_READY",
    "REVISIONS_IN_PROGRESS",
    "AWAITING_APPROVAL",
    "FINAL_FILES_READY",
    "DELIVERED",
  ];
  const currentIdx = stateOrder.indexOf(current);

  if (currentState === "ON_HOLD" || currentState === "CANCELLED" || currentState === "REFUNDED") {
    const terminal = currentState as ProjectState;
    return [
      ...FLOW_STEPS.map((step) => ({
        state: step.state,
        label: step.label,
        completed: false,
        current: false,
        timestamp: step.sourceState ? timestamps[step.sourceState] : (isProjectState(step.state) ? timestamps[step.state] : undefined),
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

  const approvedMilestoneReached = Boolean(options?.hasApprovedMilestone || isExplicitApprovedState || current === "FINAL_FILES_READY" || current === "DELIVERED");
  const approvedIsCurrent = isExplicitApprovedState || (current === "AWAITING_APPROVAL" && approvedMilestoneReached);

  return FLOW_STEPS.map((step) => {
    if (step.state === "APPROVED") {
      return {
        state: step.state,
        label: step.label,
        completed: approvedMilestoneReached && !approvedIsCurrent,
        current: approvedIsCurrent,
        timestamp: timestamps.AWAITING_APPROVAL,
      };
    }

    const stepIdx = stateOrder.indexOf(step.state);
    const isAwaitingApprovalStep = step.state === "AWAITING_APPROVAL";

    return {
      state: step.state,
      label: step.label,
      completed: stepIdx < currentIdx || (isAwaitingApprovalStep && approvedIsCurrent),
      current: stepIdx === currentIdx && !approvedIsCurrent,
      timestamp: timestamps[step.state],
    };
  });
}
