import { describe, expect, it } from "vitest";

import { EMPTY_BRIEF_ANSWERS } from "./brief";
import { nextStepIndex, previousStepIndex, REVIEW_STEP_INDEX } from "./brief-wizard";

describe("brief wizard navigation", () => {
  it("blocks advancing when required fields for the current step are missing", () => {
    const step = nextStepIndex(0, { ...EMPTY_BRIEF_ANSWERS, brandName: "Acme" });
    expect(step).toBe(0);
  });

  it("advances and allows going back while preserving bounded indices", () => {
    const filled = {
      ...EMPTY_BRIEF_ANSWERS,
      brandName: "Acme",
      industry: "SaaS",
      offerSummary: "Subscription accounting tools",
      audiencePrimary: "Founders",
      businessGoals: "Increase trust",
      brandPersonality: "Confident",
      styleDirection: "Minimal",
      usageContexts: "Website",
    };

    const step1 = nextStepIndex(0, filled);
    const step2 = nextStepIndex(step1, filled);
    const step3 = nextStepIndex(step2, filled);
    const step4 = nextStepIndex(step3, filled);

    expect(step1).toBe(1);
    expect(step4).toBe(REVIEW_STEP_INDEX);
    expect(previousStepIndex(step4)).toBe(REVIEW_STEP_INDEX - 1);
    expect(previousStepIndex(0)).toBe(0);
  });
});
