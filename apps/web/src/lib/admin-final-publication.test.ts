import { describe, expect, it } from "vitest";
import { resolveFinalPublicationUi } from "./admin-final-publication";

describe("resolveFinalPublicationUi", () => {
  it("treats committed non-2xx publication as live and offers notification-only retry", () => {
    expect(resolveFinalPublicationUi(false, {
      committed: true,
      message: "Final files are live, but the client notification failed.",
    })).toEqual({
      committed: true,
      retryNotification: true,
      successMessage: "Final deliverables are live and available to the client.",
      errorMessage: "Final files are live, but the client notification failed.",
    });
  });

  it("does not claim publication for an ordinary upload failure", () => {
    expect(resolveFinalPublicationUi(false, { error: "Upload failed" })).toMatchObject({
      committed: false,
      retryNotification: false,
      successMessage: null,
      errorMessage: "Upload failed",
    });
  });
});
