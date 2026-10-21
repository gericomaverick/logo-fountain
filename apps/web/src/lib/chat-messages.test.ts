import { describe, expect, it } from "vitest";

import { groupMessagesByDay, resolveSenderLabel, shouldSendOnKey, sortMessagesNewestLast } from "@/lib/chat-messages";

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
    expect(resolveSenderLabel({ id: "c", email: "c@x.com", isAdmin: false })).toBe("Client");
  });

  it("says You for the reader's own messages", () => {
    expect(resolveSenderLabel({ id: "c", email: "c@x.com", isAdmin: false, fullName: "Jess Hall" }, "c")).toBe("You");
    expect(resolveSenderLabel({ id: "a", email: "a@x.com", isAdmin: true, fullName: "Sam Lee" }, "a")).toBe("You");
  });

  it("names someone else on the customer's side rather than calling them Client", () => {
    expect(resolveSenderLabel({ id: "c", email: "c@x.com", isAdmin: false, fullName: "Jess Hall" }, "someone-else")).toBe("Jess Hall");
  });
});

describe("shouldSendOnKey", () => {
  it("sends on a plain Enter, which is what people try first", () => {
    expect(shouldSendOnKey({ key: "Enter" })).toBe(true);
  });

  it("leaves Enter alone when a modifier is held, so a newline can be typed", () => {
    expect(shouldSendOnKey({ key: "Enter", shiftKey: true })).toBe(false);
    expect(shouldSendOnKey({ key: "Enter", ctrlKey: true })).toBe(false);
    expect(shouldSendOnKey({ key: "Enter", metaKey: true })).toBe(false);
    expect(shouldSendOnKey({ key: "Enter", altKey: true })).toBe(false);
  });

  it("never sends an Enter that belongs to an IME candidate list", () => {
    expect(shouldSendOnKey({ key: "Enter", isComposing: true })).toBe(false);
  });

  it("ignores every other key", () => {
    expect(shouldSendOnKey({ key: " " })).toBe(false);
    expect(shouldSendOnKey({ key: "a" })).toBe(false);
  });
});

describe("groupMessagesByDay", () => {
  const today = new Date("2026-10-21T12:00:00.000Z");
  const at = (createdAt: string) => ({ createdAt });

  it("names today and yesterday rather than dating them", () => {
    const days = groupMessagesByDay([at("2026-10-20T09:00:00.000Z"), at("2026-10-21T09:00:00.000Z")], today);
    expect(days.map((day) => day.label)).toEqual(["Yesterday", "Today"]);
  });

  it("keeps one group per day, in the order given", () => {
    const days = groupMessagesByDay(
      [at("2026-10-21T09:00:00.000Z"), at("2026-10-21T10:00:00.000Z"), at("2026-10-21T11:00:00.000Z")],
      today,
    );
    expect(days).toHaveLength(1);
    expect(days[0]?.messages).toHaveLength(3);
  });

  it("spells out an older day, and includes the year once it is not this one", () => {
    const days = groupMessagesByDay([at("2026-09-14T09:00:00.000Z"), at("2025-09-14T09:00:00.000Z")], today);
    expect(days[0]?.label).toContain("September");
    expect(days[0]?.label).not.toContain("2026");
    expect(days[1]?.label).toContain("2025");
  });

  it("keeps a message with an unreadable timestamp beside the one before it", () => {
    const days = groupMessagesByDay([at("2026-10-21T09:00:00.000Z"), at("not a date")], today);
    expect(days).toHaveLength(1);
    expect(days[0]?.messages).toHaveLength(2);
  });
});
