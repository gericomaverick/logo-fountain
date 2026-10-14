import { describe, expect, it } from "vitest";

import { buildFinalDeliverableSnapshot } from "./final-deliverable-access";

describe("final deliverable snapshot access", () => {
  it.each([
    { persistedStatus: "AWAITING_APPROVAL", hasApprovedConcept: true },
    { persistedStatus: "FINAL_FILES_READY", hasApprovedConcept: false },
  ])("does not expose an uploaded final ZIP early (%o)", ({ persistedStatus, hasApprovedConcept }) => {
    expect(buildFinalDeliverableSnapshot({
      persistedStatus,
      hasApprovedConcept,
      hasFinalAsset: true,
    })).toEqual({ available: false, url: null });
  });

  it.each(["FINAL_FILES_READY", "DELIVERED"])(
    "reports valid %s deliverables as available without embedding a signed URL",
    (persistedStatus) => {
      expect(buildFinalDeliverableSnapshot({
        persistedStatus,
        hasApprovedConcept: true,
        hasFinalAsset: true,
      })).toEqual({ available: true, url: null });
    },
  );
});
