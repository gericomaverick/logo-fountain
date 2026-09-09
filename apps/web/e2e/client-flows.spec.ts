import { expect, test } from "@playwright/test";

test.describe("launch-critical public and account recovery flows", () => {
  test("login blocks empty submissions with accessible field errors", async ({ page }) => {
    await page.goto("/login");

    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(page.getByRole("alert").filter({ hasText: "Please fix the highlighted fields" })).toBeVisible();
    await expect(page.locator("#email-error")).toHaveText("Enter your email address.");
    await expect(page.locator("#password-error")).toHaveText("Enter your password.");
    await expect(page.getByLabel("Email")).toHaveAttribute("aria-invalid", "true");
    await expect(page.getByLabel("Password")).toHaveAttribute("aria-invalid", "true");
  });

  test("forgot password validates email before calling Supabase", async ({ page }) => {
    await page.goto("/forgot-password");

    await expect(page.getByRole("heading", { name: "Reset your password" })).toBeVisible();
    await page.getByRole("button", { name: "Send reset email" }).click();

    await expect(page.getByRole("alert").filter({ hasText: "Please fix the highlighted field" })).toBeVisible();
    await expect(page.getByText("Enter your email address.")).toBeVisible();
    await expect(page.getByLabel("Email")).toHaveAttribute("aria-invalid", "true");
  });

  test("reset password validates password length and confirmation", async ({ page }) => {
    await page.goto("/reset-password");

    await expect(page.getByRole("heading", { name: "Choose a new password" })).toBeVisible();
    await page.getByLabel("New password", { exact: true }).fill("short");
    await page.getByLabel("Confirm new password").fill("different-password");
    await page.getByRole("button", { name: "Update password" }).click();

    await expect(page.getByRole("alert").filter({ hasText: "Please fix the highlighted fields" })).toBeVisible();
    await expect(page.locator("#password-error")).toHaveText("Use at least 8 characters.");
    await expect(page.locator("#confirm-error")).toHaveText("Passwords do not match.");
  });

  test("checkout continue surfaces missing session id instead of failing silently", async ({ page }) => {
    await page.goto("/checkout/continue");

    await expect(page.getByRole("heading", { name: "Finish account setup" })).toBeVisible();
    await page.getByRole("button", { name: "Continue" }).click();

    await expect(page.getByText("Missing session id.")).toBeVisible();
  });
});
