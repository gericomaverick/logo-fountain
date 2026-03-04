import { describe, expect, it } from "vitest";

import { buildAuthCallbackRedirect, buildSetPasswordRedirect } from "./password-redirects";

describe("password redirect helpers", () => {
  it("builds set-password URL with optional projectId", () => {
    expect(buildSetPasswordRedirect("http://example.com"))
      .toBe("http://example.com/set-password?next=%2Fdashboard");

    expect(buildSetPasswordRedirect("http://example.com", "project-123"))
      .toBe("http://example.com/set-password?next=%2Fdashboard&projectId=project-123");
  });

  it("wraps set-password URL in auth callback", () => {
    const url = buildAuthCallbackRedirect("http://example.com", "proj-1");
    expect(url).toBe(
      "http://example.com/auth/callback?next=%2Fset-password%3Fnext%3D%252Fdashboard%26projectId%3Dproj-1",
    );
  });
});
