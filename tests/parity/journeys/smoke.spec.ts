import { expect, test } from "../fixtures";

test("A-15 root sends an anonymous visitor to sign-in @smoke @ui", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/login(\?.*)?$/);
});

test("X-02 pages carry the security headers @smoke @security @api", async ({ request }) => {
  const response = await request.get("/login");
  expect(response.ok()).toBe(true);
  const headers = response.headers();
  expect(headers["x-frame-options"]).toBe("DENY");
  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  expect(headers["permissions-policy"]).toContain("camera=()");
  expect(headers["content-security-policy-report-only"]).toContain("frame-ancestors 'none'");
});
