import { describe, expect, it } from "vitest";

import { deriveProjectBadgeState } from "@/lib/admin-dashboard";

describe("deriveProjectBadgeState", () => {
  it("keeps pending feedback in needs-action even when concept updates are already read", () => {
    const result = deriveProjectBadgeState({
      status: "DELIVERED",
      pendingFeedbackCount: 1,
      hasNewMessages: false,
      hasNewConcepts: false,
    });

    expect(result.section).toBe("needs-action");
  });

  it("keeps unread messages in needs-action", () => {
    const result = deriveProjectBadgeState({
      status: "IN_DESIGN",
      pendingFeedbackCount: 0,
      hasNewMessages: true,
      hasNewConcepts: false,
    });

    expect(result.section).toBe("needs-action");
  });

  it("keeps pending feedback in needs-action even after reads/messages are acknowledged", () => {
    const result = deriveProjectBadgeState({
      status: "CONCEPTS_READY",
      pendingFeedbackCount: 2,
      hasNewMessages: false,
      hasNewConcepts: false,
    });

    expect(result.section).toBe("needs-action");
  });

  it("does not force new concepts into needs-action by itself", () => {
    const result = deriveProjectBadgeState({
      status: "DELIVERED",
      pendingFeedbackCount: 0,
      hasNewMessages: false,
      hasNewConcepts: true,
    });

    expect(result.section).toBe("delivered");
  });
});
