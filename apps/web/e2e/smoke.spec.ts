import { expect, test } from "@playwright/test";

test("homepage CTA navigates to pricing", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Built for brands that refuse to look average" })).toBeVisible();

  await page.getByRole("link", { name: "Get started" }).first().click();
  await expect(page).toHaveURL(/\/pricing$/);
  await expect(page.getByRole("heading", { name: "Pricing" })).toBeVisible();
});
