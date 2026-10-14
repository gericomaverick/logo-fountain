import { describe, expect, it } from "vitest";

import { PRIMARY_CTA_BY_STATE } from "./project-state-machine";
import { deriveDisplayProjectStatus, deriveOverviewBadgeStatus, isKnownProjectState } from "./project-status";

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

  it.each(["FINAL_FILES_READY", "DELIVERED"])(
    "falls back to awaiting final upload when persisted %s has no final asset",
    (persistedStatus) => {
      expect(
        deriveDisplayProjectStatus({
          persistedStatus,
          hasApprovedConcept: true,
          hasFinalDeliverable: false,
        }),
      ).toBe("AWAITING_APPROVAL");
    },
  );

  it("keeps delivered visible when approval and final deliverables exist", () => {
    expect(
      deriveDisplayProjectStatus({
        persistedStatus: "DELIVERED",
        hasApprovedConcept: true,
        hasFinalDeliverable: true,
      }),
    ).toBe("DELIVERED");
  });

  it("uses the awaiting-final-upload CTA instead of download when the final asset is missing", () => {
    const status = deriveDisplayProjectStatus({
      persistedStatus: "FINAL_FILES_READY",
      hasApprovedConcept: true,
      hasFinalDeliverable: false,
    });

    expect(isKnownProjectState(status) && PRIMARY_CTA_BY_STATE[status]).toBe("Await final upload");
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
