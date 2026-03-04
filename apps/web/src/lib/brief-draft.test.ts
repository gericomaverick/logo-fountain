import { describe, expect, it } from "vitest";

import { EMPTY_BRIEF_ANSWERS } from "./brief";
import { briefDraftStorageKey, mergeWithBriefDefaults, parseBriefDraft } from "./brief-draft";

describe("brief draft helpers", () => {
  it("creates project + version scoped draft keys", () => {
    expect(briefDraftStorageKey("project-1", 3)).toBe("logo-fountain:brief-draft:project-1:v3");
    expect(briefDraftStorageKey("project-1", null)).toBe("logo-fountain:brief-draft:project-1:v0");
  });

  it("parses optional + multiline fields without requiring complete brief", () => {
    const draft = parseBriefDraft(JSON.stringify({
      brandName: "Acme",
      industry: "SaaS",
      offerSummary: "Line 1\nLine 2",
      additionalNotes: "Optional notes",
    }));

    expect(draft).toEqual(expect.objectContaining({
      brandName: "Acme",
      industry: "SaaS",
      offerSummary: "Line 1\nLine 2",
      additionalNotes: "Optional notes",
    }));
  });

  it("returns null for malformed draft json", () => {
    expect(parseBriefDraft("{bad json")).toBeNull();
  });

  it("fills defaults when draft is partial", () => {
    const merged = mergeWithBriefDefaults({ ...EMPTY_BRIEF_ANSWERS, brandName: "Acme", offerSummary: "X" });
    expect(merged.tagline).toBe(EMPTY_BRIEF_ANSWERS.tagline);
    expect(merged.brandName).toBe("Acme");
  });
});
