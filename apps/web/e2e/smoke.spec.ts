import { expect, test } from "@playwright/test";

test("root redirects to the app dashboard", async ({ page }) => {
  await page.goto("/");

  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  await expect(page.getByText(/sign in/i)).toBeVisible();
});
