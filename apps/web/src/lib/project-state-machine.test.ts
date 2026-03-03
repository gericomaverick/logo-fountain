import { describe, expect, it } from "vitest";

import { applyTransition, canTransition } from "@/lib/project-state-machine";

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
});
