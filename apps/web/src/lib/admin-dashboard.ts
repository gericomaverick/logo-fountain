export type AdminSectionKey = "needs-action" | "in-progress" | "delivered";

const NEEDS_ACTION_STATUSES = ["BRIEF_SUBMITTED", "CONCEPTS_READY", "ON_HOLD"] as const;
const DELIVERED_STATUSES = ["DELIVERED", "CANCELLED", "REFUNDED"] as const;

export function getSectionKey(status: string): AdminSectionKey {
  if (NEEDS_ACTION_STATUSES.includes(status as (typeof NEEDS_ACTION_STATUSES)[number])) return "needs-action";
  if (DELIVERED_STATUSES.includes(status as (typeof DELIVERED_STATUSES)[number])) return "delivered";
  return "in-progress";
}

export function deriveProjectBadgeState(project: {
  status: string;
  pendingFeedbackCount: number;
  hasNewMessages: boolean;
  hasNewConcepts: boolean;
}): { section: AdminSectionKey; showNeedsAction: boolean } {
  const showNeedsAction = project.pendingFeedbackCount > 0 || project.hasNewMessages;
  return {
    section: showNeedsAction ? "needs-action" : getSectionKey(project.status),
    showNeedsAction,
  };
}
