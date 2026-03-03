import { describe, expect, it } from "vitest";

import { computeEntitlementUsage } from "@/lib/entitlements";

describe("computeEntitlementUsage", () => {
  it("computes remaining with lower bound at zero", () => {
    const usage = computeEntitlementUsage(
      [
        { key: "concepts", limitInt: 3, consumedInt: 5 },
        { key: "revisions", limitInt: 2, consumedInt: 1 },
      ],
      "professional",
    );

    expect(usage.concepts).toEqual({ limit: 3, consumed: 5, reserved: 0, remaining: 0 });
    expect(usage.revisions).toEqual({ limit: 2, consumed: 1, reserved: 0, remaining: 1 });
  });

  it("falls back to package defaults when rows are missing", () => {
    const usage = computeEntitlementUsage([], "essential");
    expect(usage.concepts).toEqual({ limit: 2, consumed: 0, reserved: 0, remaining: 2 });
    expect(usage.revisions).toEqual({ limit: 2, consumed: 0, reserved: 0, remaining: 2 });
  });
});
