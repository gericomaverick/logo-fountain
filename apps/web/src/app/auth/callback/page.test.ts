import { describe, expect, it } from "vitest";

import { buildVerifyOtpParams, safeNextPath } from "./page";

function createSearch(params: Record<string, string>): URLSearchParams {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => search.set(key, value));
  return search;
}

describe("buildVerifyOtpParams", () => {
  it("returns verify params when token_hash and type are present", () => {
    const params = buildVerifyOtpParams(
      createSearch({ token_hash: "hash", type: "magiclink", email: "hidden@example.com" }),
    );

    expect(params).toEqual({ token_hash: "hash", type: "magiclink" });
  });

  it("falls back to the legacy token param", () => {
    const params = buildVerifyOtpParams(createSearch({ token: "legacy", type: "magiclink" }));

    expect(params).toEqual({ token_hash: "legacy", type: "magiclink" });
  });

  it("returns null when required params are missing", () => {
    expect(buildVerifyOtpParams(createSearch({ token_hash: "hash" }))).toBeNull();
    expect(buildVerifyOtpParams(createSearch({ type: "magiclink" }))).toBeNull();
  });
});

describe("safeNextPath", () => {
  it("allows absolute paths", () => {
    expect(safeNextPath("/set-password")).toBe("/set-password");
  });

  it("falls back to /dashboard for unsafe values", () => {
    expect(safeNextPath(null)).toBe("/dashboard");
    expect(safeNextPath("https://example.com" as any)).toBe("/dashboard");
  });
});
