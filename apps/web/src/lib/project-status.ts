import type { ProjectState } from "@/lib/project-state-machine";

type DeriveProjectStatusArgs = {
  persistedStatus: string;
  hasApprovedConcept: boolean;
  hasFinalDeliverable: boolean;
};

export function deriveDisplayProjectStatus({ persistedStatus, hasApprovedConcept, hasFinalDeliverable }: DeriveProjectStatusArgs): string {
  if (persistedStatus === "DELIVERED") return "DELIVERED";

  if (hasFinalDeliverable) return "FINAL_FILES_READY";

  if (persistedStatus === "APPROVED") return "AWAITING_APPROVAL";

  // Some projects remain persisted as CONCEPTS_READY after approval.
  // Surface the true client-facing phase consistently everywhere.
  if (hasApprovedConcept && (persistedStatus === "CONCEPTS_READY" || persistedStatus === "REVISIONS_IN_PROGRESS")) {
    return "AWAITING_APPROVAL";
  }

  return persistedStatus;
}

export function deriveOverviewBadgeStatus(args: DeriveProjectStatusArgs): string {
  const displayStatus = deriveDisplayProjectStatus(args);
  if (!args.hasFinalDeliverable && args.hasApprovedConcept && displayStatus === "AWAITING_APPROVAL") return "APPROVED";
  return displayStatus;
}

export function isKnownProjectState(status: string): status is ProjectState {
  return [
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
  ].includes(status);
}
