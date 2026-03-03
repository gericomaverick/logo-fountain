type SnapshotMessage = { id: string; kind?: string; body: string; createdAt: string };

type ActivityItem = {
  id: string;
  label: string;
  at: string;
};

export type ActivityGroup = {
  dayLabel: string;
  items: ActivityItem[];
};

const DATE_LABEL_FORMATTER = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  day: "numeric",
  month: "short",
});

function normalizeDateLabel(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return DATE_LABEL_FORMATTER.format(date);
}

export function getPendingFeedbackCountForLatestConcept(
  concepts: Array<{ id: string }> = [],
  revisionRequests: Array<{ concept?: { id: string } | null; status: string }> = [],
): number {
  const latestConceptId = concepts[0]?.id;
  if (!latestConceptId) return 0;

  return revisionRequests.filter((request) => request.concept?.id === latestConceptId && request.status === "requested").length;
}

export function getMissionControlPrimaryCta(projectId: string, status: string, options?: { pendingFeedbackCount?: number }) {
  if (status === "AWAITING_BRIEF") return { label: "Submit project brief", href: `/project/${projectId}/brief` };
  if (status === "CONCEPTS_READY") return { label: "Review concepts", href: `/project/${projectId}/concepts` };
  if (status === "REVISIONS_IN_PROGRESS") {
    if ((options?.pendingFeedbackCount ?? 0) > 0) {
      return { label: "Review pending revision notes", href: `/project/${projectId}/concepts` };
    }
    return { label: "Track revision progress", href: `/project/${projectId}/concepts` };
  }
  if (status === "FINAL_FILES_READY") return { label: "Download final files", href: `#final-files` };
  if (status === "ON_HOLD") return { label: "Check project messages", href: `/project/${projectId}/messages` };
  if (status === "DELIVERED") return { label: "View final files", href: `/project/${projectId}/concepts` };
  return { label: "Open project messages", href: `/project/${projectId}/messages` };
}

export function buildActivityGroups(snapshot: {
  status: string;
  updatedAt?: string;
  createdAt?: string;
  messages?: SnapshotMessage[];
} | null, limit = 6): ActivityGroup[] {
  if (!snapshot) return [];

  const systemMessages = (snapshot.messages ?? [])
    .filter((message) => message.kind === "system")
    .slice(-Math.max(limit - 1, 0))
    .reverse()
    .map((message) => ({ id: message.id, label: message.body, at: message.createdAt }));

  const statusLine = {
    id: "status",
    label: `Status is now ${snapshot.status.replaceAll("_", " ").toLowerCase()}.`,
    at: snapshot.updatedAt ?? snapshot.createdAt ?? new Date().toISOString(),
  };

  const grouped = new Map<string, ActivityItem[]>();

  for (const item of [statusLine, ...systemMessages].slice(0, limit)) {
    const dayLabel = normalizeDateLabel(item.at);
    grouped.set(dayLabel, [...(grouped.get(dayLabel) ?? []), item]);
  }

  return Array.from(grouped.entries()).map(([dayLabel, items]) => ({ dayLabel, items }));
}
