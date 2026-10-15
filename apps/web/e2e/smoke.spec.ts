import { expect, test } from "@playwright/test";

test("root redirects unauthenticated visitors to login", async ({ page }) => {
  const response = await page.goto("/");

  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  expect(response?.headers()["x-frame-options"]).toBe("DENY");
  expect(response?.headers()["x-content-type-options"]).toBe("nosniff");
  expect(response?.headers()["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  expect(response?.headers()["permissions-policy"]).toContain("camera=()");
  expect(response?.headers()["content-security-policy-report-only"]).toContain("frame-ancestors 'none'");
});

test("auth callback never carries a protocol-relative next target into recovery", async ({ page }) => {
  await page.goto("/auth/callback?next=%2F%2Fevil.example%2Fsteal");

  const recovery = page.getByRole("link", { name: "Request a new magic link" });
  await expect(recovery).toBeVisible();
  await expect(recovery).toHaveAttribute("href", "/login?next=%2Fdashboard");
});
