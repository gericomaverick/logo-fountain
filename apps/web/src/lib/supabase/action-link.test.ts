import { describe, expect, it } from "vitest";

import { applyMagicLinkRedirectOverride } from "./action-link";

describe("applyMagicLinkRedirectOverride", () => {
  it("replaces existing redirect_to values", () => {
    const actionLink =
      "https://example.supabase.co/auth/v1/verify?token=abc&type=magiclink&redirect_to=http://localhost:3000";

    const result = applyMagicLinkRedirectOverride(actionLink, "http://192.168.4.68:3000/set-password");

    expect(result).toContain("redirect_to=http%3A%2F%2F192.168.4.68%3A3000%2Fset-password");
    expect(result).not.toContain("redirect_to=http%3A%2F%2Flocalhost%3A3000");
  });

  it("adds redirect_to when the original URL omitted it", () => {
    const actionLink = "https://example.supabase.co/auth/v1/verify?token=abc&type=magiclink";

    const result = applyMagicLinkRedirectOverride(actionLink, "http://192.168.4.68:3000/set-password");

    expect(result).toContain("redirect_to=http%3A%2F%2F192.168.4.68%3A3000%2Fset-password");
  });

  it("falls back to the original link when parsing fails", () => {
    const actionLink = "not-a-valid-url";

    const result = applyMagicLinkRedirectOverride(actionLink, "http://192.168.4.68:3000/set-password");

    expect(result).toBe(actionLink);
  });
});
