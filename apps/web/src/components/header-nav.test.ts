import { describe, expect, it } from "vitest";

import { shouldShowClientInvoicesNav } from "./header-nav";

describe("header invoice nav visibility", () => {
  it("shows top-level Invoices for authenticated client users", () => {
    expect(shouldShowClientInvoicesNav({ authenticated: true, isAdmin: false })).toBe(true);
  });

  it("hides top-level Invoices for authenticated admin users", () => {
    expect(shouldShowClientInvoicesNav({ authenticated: true, isAdmin: true })).toBe(false);
  });

  it("hides top-level Invoices for guests", () => {
    expect(shouldShowClientInvoicesNav({ authenticated: false })).toBe(false);
  });
});
