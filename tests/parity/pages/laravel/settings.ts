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

export function account(_page: Page): AccountPages {
  return {
    requestPasswordReset: todo("account.requestPasswordReset", "4.9b"),
    signOut: todo("account.signOut", "6.12"),
    showsSignedInContent: todo("account.showsSignedInContent", "6.12"),
  };
}
