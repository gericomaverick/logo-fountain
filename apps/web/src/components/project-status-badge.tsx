import { PROJECT_STATE_LABELS, type ProjectState } from "@/lib/project-state-machine";

const STATUS_TONE_CLASS: Record<ProjectState, string> = {
  AWAITING_BRIEF: "border-amber-300 bg-amber-50 text-amber-800",
  BRIEF_SUBMITTED: "border-sky-300 bg-sky-50 text-sky-800",
  IN_DESIGN: "border-blue-300 bg-blue-50 text-blue-800",
  CONCEPTS_READY: "border-emerald-300 bg-emerald-50 text-emerald-800",
  REVISIONS_IN_PROGRESS: "border-violet-300 bg-violet-50 text-violet-800",
  AWAITING_APPROVAL: "border-indigo-300 bg-indigo-50 text-indigo-800",
  FINAL_FILES_READY: "border-teal-300 bg-teal-50 text-teal-800",
  DELIVERED: "border-green-300 bg-green-50 text-green-800",
  ON_HOLD: "border-orange-300 bg-orange-50 text-orange-800",
  CANCELLED: "border-rose-300 bg-rose-50 text-rose-800",
  REFUNDED: "border-neutral-300 bg-neutral-100 text-neutral-700",
};

const OVERVIEW_STATUS_TONE_OVERRIDES: Record<string, string> = {
  APPROVED: "border-emerald-400 bg-emerald-50 text-emerald-900",
};

const OVERVIEW_STATUS_LABEL_OVERRIDES: Record<string, string> = {
  APPROVED: "Approved",
};

function isProjectState(value: string): value is ProjectState {
  return value in PROJECT_STATE_LABELS;
}

export function getProjectStatusToneClass(status: string): string {
  if (status in OVERVIEW_STATUS_TONE_OVERRIDES) return OVERVIEW_STATUS_TONE_OVERRIDES[status];
  if (!isProjectState(status)) return "border-neutral-300 bg-neutral-50 text-neutral-700";
  return STATUS_TONE_CLASS[status];
}

export function getProjectStatusLabel(status: string): string {
  if (status in OVERVIEW_STATUS_LABEL_OVERRIDES) return OVERVIEW_STATUS_LABEL_OVERRIDES[status];
  if (!isProjectState(status)) return status;
  return PROJECT_STATE_LABELS[status];
}

export function ProjectStatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`portal-badge ${getProjectStatusToneClass(status)}`}
    >
      {getProjectStatusLabel(status)}
    </span>
  );
}
