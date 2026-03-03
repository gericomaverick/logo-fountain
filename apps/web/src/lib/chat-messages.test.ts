import { describe, expect, it } from "vitest";

import { resolveSenderLabel, sortMessagesNewestLast } from "@/lib/chat-messages";

describe("chat message helpers", () => {
  it("sorts messages oldest->newest so newest appears at bottom", () => {
    const sorted = sortMessagesNewestLast([
      { id: "2", createdAt: "2026-01-01T12:00:00.000Z" },
      { id: "1", createdAt: "2026-01-01T11:00:00.000Z" },
      { id: "3", createdAt: "2026-01-01T12:00:00.000Z" },
    ]);

    expect(sorted.map((m) => m.id)).toEqual(["1", "2", "3"]);
  });

  it("uses designer fullName when available", () => {
    expect(resolveSenderLabel({ id: "a", email: "a@x.com", isAdmin: true, fullName: "Sam Lee" })).toBe("Sam Lee");
  });

  it("uses designer first + last when fullName is missing", () => {
    expect(resolveSenderLabel({ id: "a", email: "a@x.com", isAdmin: true, firstName: "Sam", lastName: "Lee" })).toBe("Sam Lee");
  });

  it("falls back to Designer for admin and Client for non-admin", () => {
    expect(resolveSenderLabel({ id: "a", email: "a@x.com", isAdmin: true })).toBe("Designer");
    expect(resolveSenderLabel({ id: "c", email: "c@x.com", isAdmin: false, fullName: "Ignored" })).toBe("Client");
  });
});
