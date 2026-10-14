import { describe, expect, it } from "vitest";

import { deriveDisplayProjectStatus, deriveOverviewBadgeStatus } from "./project-status";

describe("project status derivation", () => {
  it("normalizes an explicit APPROVED persisted status", () => {
    expect(
      deriveDisplayProjectStatus({
        persistedStatus: "APPROVED",
        hasApprovedConcept: true,
        hasFinalDeliverable: false,
      }),
    ).toBe("AWAITING_APPROVAL");
  });

  it("shows awaiting approval when concept is approved but persisted status lags", () => {
    expect(
      deriveDisplayProjectStatus({
        persistedStatus: "CONCEPTS_READY",
        hasApprovedConcept: true,
        hasFinalDeliverable: false,
      }),
    ).toBe("AWAITING_APPROVAL");
  });

  it("does not infer final files ready from an uploaded ZIP before the persisted transition", () => {
    expect(
      deriveDisplayProjectStatus({
        persistedStatus: "AWAITING_APPROVAL",
        hasApprovedConcept: true,
        hasFinalDeliverable: true,
      }),
    ).toBe("AWAITING_APPROVAL");
  });

  it("does not expose a persisted final state before approval", () => {
    expect(
      deriveDisplayProjectStatus({
        persistedStatus: "FINAL_FILES_READY",
        hasApprovedConcept: false,
        hasFinalDeliverable: true,
      }),
    ).toBe("AWAITING_APPROVAL");
  });

  it("keeps the persisted final files ready state after approval", () => {
    expect(
      deriveDisplayProjectStatus({
        persistedStatus: "FINAL_FILES_READY",
        hasApprovedConcept: true,
        hasFinalDeliverable: true,
      }),
    ).toBe("FINAL_FILES_READY");
  });

  it("keeps delivered visible even when final deliverables still exist", () => {
    expect(
      deriveDisplayProjectStatus({
        persistedStatus: "DELIVERED",
        hasApprovedConcept: true,
        hasFinalDeliverable: true,
      }),
    ).toBe("DELIVERED");
  });

  it("uses approved badge status for overview cards", () => {
    expect(
      deriveOverviewBadgeStatus({
        persistedStatus: "AWAITING_APPROVAL",
        hasApprovedConcept: true,
        hasFinalDeliverable: false,
      }),
    ).toBe("APPROVED");
  });

  it("keeps key lifecycle statuses stable when no override is needed", () => {
    const states = ["AWAITING_BRIEF", "IN_DESIGN", "CONCEPTS_READY"] as const;

    for (const status of states) {
      expect(
        deriveDisplayProjectStatus({
          persistedStatus: status,
          hasApprovedConcept: false,
          hasFinalDeliverable: false,
        }),
      ).toBe(status);
    }
  });
});
