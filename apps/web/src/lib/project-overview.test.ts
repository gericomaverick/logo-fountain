import { describe, expect, it } from "vitest";

import { formatClientFirstName, getAreaCardSubtitle } from "./project-overview";

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
