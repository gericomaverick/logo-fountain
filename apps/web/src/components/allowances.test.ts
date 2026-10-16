import { describe, expect, it } from "vitest";

import { allowanceTone, resolveUsage } from "./allowances";

const usage = (limit: number, consumed: number, reserved = 0) => ({ limit, consumed, reserved, remaining: limit - consumed - reserved });

describe("allowance state", () => {
  it("is available while more than one is left", () => {
    expect(allowanceTone(usage(3, 1), resolveUsage(usage(3, 1)).remaining)).toBe("plenty");
  });
  it("warns on the last one once some have gone", () => {
    expect(allowanceTone(usage(3, 2), resolveUsage(usage(3, 2)).remaining)).toBe("last");
  });
  it("does not warn on a one-item package that is untouched", () => {
    expect(allowanceTone(usage(1, 0), resolveUsage(usage(1, 0)).remaining)).toBe("plenty");
  });
  it("is used up at zero, counting pending as taken", () => {
    expect(allowanceTone(usage(2, 1, 1), resolveUsage(usage(2, 1, 1)).remaining)).toBe("out");
  });
  it("is neutral when unlimited or not configured", () => {
    expect(allowanceTone({ ...usage(0, 4), unlimited: true }, 0)).toBe("neutral");
    expect(allowanceTone({ ...usage(0, 0), configured: false }, 0)).toBe("neutral");
  });
});
