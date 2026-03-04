import { describe, expect, it } from "vitest";

import { briefSections, missingRequiredFields, parseBriefAnswers, requiredFieldLabels, validateBriefSubmission } from "./brief";

describe("brief parsing", () => {
  it("parses legacy v1 brief answers safely", () => {
    const parsed = parseBriefAnswers({
      brandName: "Acme",
      industry: "SaaS",
      description: "Accounting automation",
      styleNotes: "Minimal",
      deadlineOrLaunch: "2026-01-01",
    });

    expect(parsed).not.toBeNull();
    expect(parsed?.offerSummary).toBe("Accounting automation");
    expect(parsed?.styleDirection).toBe("Minimal");
    expect(parsed).not.toHaveProperty("deadlineOrLaunch");
  });

  it("validates required fields for new submissions", () => {
    const result = validateBriefSubmission({
      brandName: "Acme",
      industry: "SaaS",
      offerSummary: "Accounting automation",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.missing).toContain("audiencePrimary");
      expect(result.missing).toContain("usageContexts");
    }
  });

  it("maps missing required field keys to section labels", () => {
    const section = briefSections[0];
    const missingKeys = missingRequiredFields({
      brandName: "Acme",
      industry: "",
      offerSummary: "",
      audiencePrimary: "",
      audienceSecondary: "",
      businessGoals: "",
      brandPersonality: "",
      styleDirection: "",
      colorPreferences: "",
      mustInclude: "",
      avoidanceNotes: "",
      usageContexts: "",
      deliverablesContext: "",
      competitors: "",
      additionalNotes: "",
      tagline: "",
    }, section);

    expect(requiredFieldLabels(missingKeys, section)).toEqual(["Industry", "What do you sell or offer?"]);
  });
});
