import { describe, expect, it } from "vitest";

import { applyTransition, buildTimeline, canTransition } from "@/lib/project-state-machine";

describe("project state machine", () => {
  it("allows BRIEF_SUBMITTED -> CONCEPTS_READY", () => {
    expect(canTransition("BRIEF_SUBMITTED", "CONCEPTS_READY")).toBe(true);

    const transition = applyTransition("BRIEF_SUBMITTED", "CONCEPTS_READY");
    expect(transition.ok).toBe(true);
    if (transition.ok) {
      expect(transition.from).toBe("BRIEF_SUBMITTED");
      expect(transition.to).toBe("CONCEPTS_READY");
    }
  });

  it("keeps invalid transitions blocked", () => {
    const transition = applyTransition("AWAITING_BRIEF", "CONCEPTS_READY");
    expect(transition.ok).toBe(false);
    if (!transition.ok) {
      expect(transition.error).toBe("INVALID_TRANSITION");
    }
  });

  it("maps key lifecycle states to timeline current step", () => {
    const states = ["AWAITING_BRIEF", "IN_DESIGN", "CONCEPTS_READY", "FINAL_FILES_READY"] as const;

    for (const state of states) {
      const timeline = buildTimeline(state);
      const current = timeline.find((step) => step.current);
      expect(current?.state).toBe(state);
    }
  });

  it("includes an explicit approved milestone after client approval", () => {
    const timeline = buildTimeline("FINAL_FILES_READY", {
      AWAITING_APPROVAL: "2026-01-01T12:00:00.000Z",
    });

    const approvedStep = timeline.find((step) => step.state === "APPROVED");
    expect(approvedStep).toBeTruthy();
    expect(approvedStep?.label).toBe("Approved");
    expect(approvedStep?.completed).toBe(true);
    expect(approvedStep?.timestamp).toBe("2026-01-01T12:00:00.000Z");
  });

  it("marks approved as current when project status is explicitly APPROVED", () => {
    const timeline = buildTimeline("APPROVED", { AWAITING_APPROVAL: "2026-01-02T12:00:00.000Z" }, { hasApprovedMilestone: true });
    const approvedStep = timeline.find((step) => step.state === "APPROVED");

    expect(approvedStep?.current).toBe(true);
    expect(approvedStep?.completed).toBe(false);
  });

  it("advances to approved as the current milestone when approval is concept-driven before final upload", () => {
    const timeline = buildTimeline("AWAITING_APPROVAL", { AWAITING_APPROVAL: "2026-01-03T12:00:00.000Z" }, { hasApprovedMilestone: true });
    const approvedStep = timeline.find((step) => step.state === "APPROVED");
    const awaitingApprovalStep = timeline.find((step) => step.state === "AWAITING_APPROVAL");

    expect(approvedStep?.current).toBe(true);
    expect(approvedStep?.completed).toBe(false);
    expect(approvedStep?.timestamp).toBe("2026-01-03T12:00:00.000Z");
    expect(awaitingApprovalStep?.current).toBe(false);
    expect(awaitingApprovalStep?.completed).toBe(true);
  });
});
