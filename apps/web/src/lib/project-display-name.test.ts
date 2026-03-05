import { describe, expect, it } from "vitest";

import { extractBrandNameFromBriefAnswers, getProjectDisplayTitle } from "@/lib/project-display-name";

describe("extractBrandNameFromBriefAnswers", () => {
  it("returns trimmed brand name when present", () => {
    expect(extractBrandNameFromBriefAnswers({ brandName: "  Northvale Analytics  " })).toBe("Northvale Analytics");
  });

  it("returns null for missing or invalid brand name", () => {
    expect(extractBrandNameFromBriefAnswers({})).toBeNull();
    expect(extractBrandNameFromBriefAnswers({ brandName: "   " })).toBeNull();
    expect(extractBrandNameFromBriefAnswers(null)).toBeNull();
  });
});

describe("getProjectDisplayTitle", () => {
  const projectId = "12345678-abcd-efab-cdef-1234567890ab";

  it("prefers brand name for clients", () => {
    expect(getProjectDisplayTitle({ projectId, brandName: "Acme", audience: "client" })).toBe("Acme");
  });

  it("keeps debug id context for admin", () => {
    expect(getProjectDisplayTitle({ projectId, brandName: "Acme", audience: "admin" })).toBe("Acme · #12345678");
  });

  it("uses audience-specific fallback when no brand exists", () => {
    expect(getProjectDisplayTitle({ projectId, brandName: null, audience: "client" })).toBe("Your logo project");
    expect(getProjectDisplayTitle({ projectId, brandName: "", audience: "admin" })).toBe("Project #12345678");
  });
});
