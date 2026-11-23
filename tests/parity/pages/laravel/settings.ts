// Laravel account screens: typed stubs until Account and Invoices (story 6.12) and the auth screens (4.9b) exist.
import type { Page } from "@playwright/test";
import type { AccountPages, SettingsPages } from "../settings";

const todo = (what: string, story: string) => (): never => {
  throw new Error(`Laravel page object ${what}: not implemented (story ${story})`);
};

export function settings(_page: Page): SettingsPages {
  return {
    open: todo("settings.open", "6.12"),
    profileName: todo("settings.profileName", "6.12"),
    updateName: todo("settings.updateName", "6.12"),
    invoices: todo("settings.invoices", "6.12"),
    changePassword: todo("settings.changePassword", "6.12"),
  };
}

export function account(page: Page): AccountPages {
  return {
    // ForgotPassword.tsx: the same notice for any address; a failed request shows a danger alert instead.
    async requestPasswordReset(email) {
      await page.goto("/forgot-password");
      await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => undefined);
      await page.getByLabel("Email", { exact: true }).fill(email);
      await page.getByRole("button", { name: "Send reset email" }).click();
      await page.getByRole("status").filter({ hasText: "If that account exists" }).waitFor({ timeout: 15_000 });
    },
    signOut: todo("account.signOut", "6.12"),
    showsSignedInContent: todo("account.showsSignedInContent", "6.12"),
  };
}
