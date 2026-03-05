import { describe, expect, it } from "vitest";

import { deriveDisplayProjectStatus, deriveOverviewBadgeStatus } from "./project-status";

describe("project status derivation", () => {
  it("shows awaiting approval when concept is approved but persisted status lags", () => {
    expect(
      deriveDisplayProjectStatus({
        persistedStatus: "CONCEPTS_READY",
        hasApprovedConcept: true,
        hasFinalDeliverable: false,
      }),
    ).toBe("AWAITING_APPROVAL");
  });

  it("prioritizes final files ready when final deliverable exists", () => {
    expect(
      deriveDisplayProjectStatus({
        persistedStatus: "AWAITING_APPROVAL",
        hasApprovedConcept: true,
        hasFinalDeliverable: true,
      }),
    ).toBe("FINAL_FILES_READY");
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
});
