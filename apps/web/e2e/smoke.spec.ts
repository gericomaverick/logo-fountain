import { expect, test } from "@playwright/test";

test("homepage pricing CTA anchors to packages", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Logos designed in Britain. By people, never by prompts." })).toBeVisible();

  await page.getByRole("link", { name: "View packages" }).first().click();
  await expect(page).toHaveURL(/#packages$/);
  await expect(page.getByRole("heading", { name: "Three clear packages. Fixed prices. Full ownership." })).toBeVisible();
});
