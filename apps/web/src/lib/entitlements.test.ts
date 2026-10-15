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

    expect(usage.concepts).toMatchObject({ limit: 3, consumed: 5, reserved: 0, remaining: 0 });
    expect(usage.revisions).toMatchObject({ limit: 2, consumed: 1, reserved: 0, remaining: 1 });
  });

  it("falls back to package defaults when rows are missing", () => {
    const usage = computeEntitlementUsage([], "essential");
    expect(usage.concepts).toMatchObject({ limit: 1, consumed: 0, reserved: 0, remaining: 1 });
    expect(usage.revisions).toMatchObject({ limit: 1, consumed: 0, reserved: 0, remaining: 1 });
  });
  it("preserves usage for present zero limits and marks unlimited explicitly", () => {
    const usage = computeEntitlementUsage([{key:"concepts",limitInt:null,consumedInt:7,reservedInt:2},{key:"revisions",limitInt:0,consumedInt:4,reservedInt:1}],"complete");
    expect(usage.concepts).toMatchObject({unlimited:true,configured:true,consumed:7,reserved:2});
    expect(usage.revisions).toMatchObject({limit:0,configured:true,consumed:4,reserved:1,remaining:0});
  });

});
