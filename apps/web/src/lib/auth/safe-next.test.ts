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
    "/project/p1?note=%5C",
    "/project/p1#example%5Ctext",
    "/project/p1?value=%2525",
    "/project/p1?return=https://evil.example/a#//evil.example",
    "/project/p1?note=\\literal#fragment",
  ])("preserves local query and fragment data %j", (value) => {
    expect(safeAuthNextPath(value)).toBe(value);
    expect(new URL(safeAuthNextPath(value), "https://app.example").origin).toBe("https://app.example");
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
