import { describe, expect, it } from "vitest";

import { summarizeAuditPayload } from "./admin-audit";

describe("summarizeAuditPayload", () => {
  it("summarizes primitive values", () => {
    expect(summarizeAuditPayload("ok")).toBe("ok");
    expect(summarizeAuditPayload(42)).toBe("42");
    expect(summarizeAuditPayload(true)).toBe("true");
  });

  it("summarizes arrays", () => {
    expect(summarizeAuditPayload([1])).toBe("1 item");
    expect(summarizeAuditPayload([1, 2, 3])).toBe("3 items");
  });

  it("summarizes object values compactly", () => {
    expect(
      summarizeAuditPayload({
        action: "reset",
        count: 2,
        meta: { actor: "admin" },
        extra: "ignored",
      }),
    ).toBe("action=reset, count=2, meta={…}");
  });
});
