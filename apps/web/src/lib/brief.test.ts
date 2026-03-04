import { describe, expect, it } from "vitest";

import { parseBriefAnswers, validateBriefSubmission } from "./brief";

describe("brief parsing", () => {
  it("parses legacy v1 brief answers safely", () => {
    const parsed = parseBriefAnswers({
      brandName: "Acme",
      industry: "SaaS",
      description: "Accounting automation",
      styleNotes: "Minimal",
    });

    expect(parsed).not.toBeNull();
    expect(parsed?.offerSummary).toBe("Accounting automation");
    expect(parsed?.styleDirection).toBe("Minimal");
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
});
