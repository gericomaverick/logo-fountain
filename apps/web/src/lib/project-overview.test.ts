import { describe, expect, it } from "vitest";

import { formatClientFirstName, getAreaCardSubtitle, getRemainingLabel } from "./project-overview";

describe("formatClientFirstName", () => {
  it("returns empty string for missing values", () => {
    expect(formatClientFirstName(null)).toBe("");
    expect(formatClientFirstName("   ")).toBe("");
  });

  it("trims and capitalizes only the first character", () => {
    expect(formatClientFirstName("  alex")).toBe("Alex");
    expect(formatClientFirstName("jAMIE")).toBe("JAMIE");
  });
});

describe("getAreaCardSubtitle", () => {
  it("prefers explicit subtitle", () => {
    expect(getAreaCardSubtitle("Brief", "Latest v3")).toBe("Latest v3");
  });

  it("falls back to open action copy", () => {
    expect(getAreaCardSubtitle("Messages")).toBe("Open messages");
  });
});

describe("getRemainingLabel", () => {
  it("pluralizes based on count", () => {
    expect(getRemainingLabel(2, "concept")).toBe("2 concepts left");
    expect(getRemainingLabel(1, "revision")).toBe("1 revision left");
  });

  it("normalizes invalid and negative values", () => {
    expect(getRemainingLabel(-3, "concept")).toBe("0 concepts left");
    expect(getRemainingLabel(Number.NaN, "revision")).toBe("0 revisions left");
  });
});
