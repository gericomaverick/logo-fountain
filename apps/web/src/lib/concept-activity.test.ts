import { describe, expect, it } from "vitest";

import { computeLatestConceptActivityAt } from "@/lib/concept-activity";

describe("computeLatestConceptActivityAt", () => {
  it("uses latest concept timestamp when there are no comments", () => {
    const result = computeLatestConceptActivityAt({
      conceptCreatedAt: new Date("2026-03-01T10:00:00.000Z"),
      conceptUpdatedAt: new Date("2026-03-01T11:00:00.000Z"),
    });

    expect(result?.toISOString()).toBe("2026-03-01T11:00:00.000Z");
  });

  it("uses latest comment timestamp when comment is newer than concept", () => {
    const result = computeLatestConceptActivityAt({
      conceptCreatedAt: new Date("2026-03-01T10:00:00.000Z"),
      conceptUpdatedAt: new Date("2026-03-01T11:00:00.000Z"),
      latestCommentAt: new Date("2026-03-01T12:00:00.000Z"),
    });

    expect(result?.toISOString()).toBe("2026-03-01T12:00:00.000Z");
  });
});
