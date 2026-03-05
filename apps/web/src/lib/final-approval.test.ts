import { describe, expect, it } from "vitest";

import { canConfirmFinalApproval, FINAL_APPROVAL_CONFIRMATION_COPY } from "@/lib/final-approval";

describe("final approval confirmation", () => {
  it("requires explicit acknowledgment before confirm action is enabled", () => {
    expect(canConfirmFinalApproval(false)).toBe(false);
    expect(canConfirmFinalApproval(true)).toBe(true);
  });

  it("uses finality language in confirmation copy", () => {
    expect(FINAL_APPROVAL_CONFIRMATION_COPY.body.toLowerCase()).toContain("final");
    expect(FINAL_APPROVAL_CONFIRMATION_COPY.checkboxLabel.toLowerCase()).toContain("final");
  });
});
