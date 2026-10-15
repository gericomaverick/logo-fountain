import { describe, expect, it } from "vitest";

import { safeAuthNextPath } from "./safe-next";

describe("safeAuthNextPath", () => {
  it("allows same-origin application paths, queries, and fragments", () => {
    expect(safeAuthNextPath("/dashboard")).toBe("/dashboard");
    expect(safeAuthNextPath("/project/p1?tab=brief#top")).toBe("/project/p1?tab=brief#top");
    expect(safeAuthNextPath("/project/brand%20name")).toBe("/project/brand%20name");
    expect(safeAuthNextPath("/discount%25")).toBe("/discount%25");
  });

  it.each([
    null,
    "",
    "https://evil.example/path",
    "javascript:alert(1)",
    "//evil.example/path",
    "///evil.example/path",
    "/\\evil.example/path",
    "\\\\evil.example/path",
    "/%2fevil.example/path",
    "/%2Fevil.example/path",
    "/%5cevil.example/path",
    "/%255cevil.example/path",
    "/%25252525252fevil.example/path",
    "%2f%2fevil.example/path",
    "/%00evil",
    "/%250aevil",
    "/line\nbreak",
    "/bad%",
  ])("rejects unsafe next value %j", (value) => {
    expect(safeAuthNextPath(value)).toBe("/dashboard");
  });

  it("uses an explicit safe fallback", () => {
    expect(safeAuthNextPath("//evil.example", "/login")).toBe("/login");
  });
});
