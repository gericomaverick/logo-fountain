import { describe, expect, it } from "vitest";

import { buildActivityGroups, getMissionControlPrimaryCta, getPendingFeedbackCountForLatestConcept } from "./project-hub";

describe("getPendingFeedbackCountForLatestConcept", () => {
  it("counts only requested feedback on latest concept", () => {
    const count = getPendingFeedbackCountForLatestConcept(
      [{ id: "c2" }, { id: "c1" }],
      [
        { concept: { id: "c1" }, status: "requested" },
        { concept: { id: "c2" }, status: "requested" },
        { concept: { id: "c2" }, status: "delivered" },
      ],
    );

    expect(count).toBe(1);
  });
});

describe("getMissionControlPrimaryCta", () => {
  it("prioritizes pending revision feedback copy", () => {
    expect(getMissionControlPrimaryCta("p1", "REVISIONS_IN_PROGRESS", { pendingFeedbackCount: 2 }).label).toContain("pending");
  });
});

describe("buildActivityGroups", () => {
  it("groups by day label and keeps newest first", () => {
    const groups = buildActivityGroups({
      status: "CONCEPTS_READY",
      updatedAt: "2026-03-03T10:00:00.000Z",
      messages: [
        { id: "m1", kind: "system", body: "Older", createdAt: "2026-03-02T09:00:00.000Z" },
        { id: "m2", kind: "system", body: "Latest", createdAt: "2026-03-03T08:00:00.000Z" },
      ],
    });

    expect(groups.length).toBeGreaterThan(0);
    expect(groups[0]?.items[0]?.id).toBe("status");
  });

  it("does not imply a state transition event for the status line", () => {
    const groups = buildActivityGroups({
      status: "BRIEF_SUBMITTED",
      updatedAt: "2026-03-03T10:00:00.000Z",
      messages: [],
    });

    expect(groups[0]?.items[0]?.label).toBe("Current status: brief submitted.");
    expect(groups[0]?.items[0]?.label.toLowerCase()).not.toContain("status changed");
  });
});
