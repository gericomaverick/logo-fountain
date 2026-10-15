import { describe, expect, it } from "vitest";
import {
  resolveFinalNotificationRetryUi,
  resolveFinalPublicationUi,
  shouldOfferFinalNotificationRetry,
} from "./admin-final-publication";

describe("resolveFinalPublicationUi", () => {
  it("treats committed non-2xx publication as live and offers notification-only retry", () => {
    expect(resolveFinalPublicationUi(false, {
      committed: true,
      message: "Final files are live, but the client notification failed.",
    })).toEqual({
      committed: true,
      refreshProject: true,
      successMessage: "Final deliverables are live and available to the client.",
      errorMessage: "Final files are live, but the client notification failed.",
    });
  });

  it("does not claim publication for an ordinary upload failure", () => {
    expect(resolveFinalPublicationUi(false, { error: "Upload failed" })).toMatchObject({
      committed: false,
      refreshProject: false,
      successMessage: null,
      errorMessage: "Upload failed",
    });
  });

  it("refreshes without claiming success when transaction outcome is unknown", () => {
    expect(resolveFinalPublicationUi(false, {
      committed: "unknown",
      message: "Publication outcome could not be verified.",
    })).toMatchObject({
      committed: false,
      refreshProject: true,
      successMessage: null,
      errorMessage: "Publication outcome could not be verified.",
    });
  });

  it("clears stale live success and refreshes after an ineligible or replaced notification conflict", () => {
    expect(resolveFinalNotificationRetryUi(409, false, {
      error: { message: "Final publication changed before notification dispatch" },
    })).toEqual({
      successMessage: null,
      errorMessage: "Final publication changed before notification dispatch. Project state was refreshed; review the current final before retrying.",
      refreshProject: true,
    });
  });

  it("keeps committed provider failures distinct from state conflicts", () => {
    expect(resolveFinalNotificationRetryUi(502, false, {
      committed: true,
      message: "The guarded final remains live, but the client notification failed.",
    })).toEqual({
      successMessage: "Final deliverables are live and available to the client.",
      errorMessage: "The guarded final remains live, but the client notification failed.",
      refreshProject: true,
    });
  });

  it("offers durable notification recovery from reloaded snapshot state", () => {
    expect(shouldOfferFinalNotificationRetry({
      status: "FINAL_FILES_READY",
      finalZip: { available: true, assetId: "asset-current" },
    })).toBe(true);
    expect(shouldOfferFinalNotificationRetry({
      status: "DELIVERED",
      finalZip: { available: true, assetId: "asset-current" },
    })).toBe(true);
    expect(shouldOfferFinalNotificationRetry({
      status: "CANCELLED",
      finalZip: { available: true, assetId: "asset-current" },
    })).toBe(false);
    expect(shouldOfferFinalNotificationRetry(null)).toBe(false);
  });
});
