import { describe, expect, it } from "vitest";

import { shouldShowCheckoutTroubleshooting } from "./checkout-success";

describe("shouldShowCheckoutTroubleshooting", () => {
  it("hides stale troubleshooting after fulfillment even when no project ID is returned", () => {
    expect(shouldShowCheckoutTroubleshooting(true, true)).toBe(false);
  });

  it("shows troubleshooting only after its timeout while still unfulfilled", () => {
    expect(shouldShowCheckoutTroubleshooting(true, false)).toBe(true);
    expect(shouldShowCheckoutTroubleshooting(false, false)).toBe(false);
  });
});
