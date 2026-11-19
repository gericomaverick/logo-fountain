// Settings, invoices and account actions (C-17, C-18, K-11, A-02, A-07, A-09; story 0.8c).
// Redesign: Account (profile name, password, sign out) and Account → Invoices (ux-design.md §5.1).
import type { Page } from "@playwright/test";
import { resolveTarget } from "../adapters/target";

/** One invoice row as shown. `document` is the row's link to the Stripe document, or null when none is offered. */
export type InvoiceRow = { project: string; amount: string; status: string; document: { label: string; href: string } | null };

export interface SettingsPages {
  /** Opens the account settings screen. */
  open(): Promise<void>;
  /** The first and last name the settings screen shows (re-read from the app). */
  profileName(): Promise<{ firstName: string; lastName: string }>;
  /** Saves a new first and last name. Resolves once the app confirms the save. */
  updateName(firstName: string, lastName: string): Promise<void>;
  /** Opens the invoices screen and returns its rows (empty when there are none). */
  invoices(): Promise<InvoiceRow[]>;
  /** Changes the password from the settings screen. Resolves once the app has signed this browser out. */
  changePassword(currentPassword: string, newPassword: string): Promise<void>;
}

export interface AccountPages {
  /** Asks for a password reset email from the public forgot-password screen. Resolves on the uniform notice. */
  requestPasswordReset(email: string): Promise<void>;
  /** Signs out from a signed-in screen. Resolves once the app reports the sign-out done (off the signed-in UI). */
  signOut(): Promise<void>;
  /** True when the screen shows signed-in content (a project, the project list, settings), false on public screens. */
  showsSignedInContent(): Promise<boolean>;
}

export async function settingsPagesFor(page: Page): Promise<SettingsPages> {
  const impl = resolveTarget() === "next" ? await import("./next/settings") : await import("./laravel/settings");
  return impl.settings(page);
}

export async function accountPagesFor(page: Page): Promise<AccountPages> {
  const impl = resolveTarget() === "next" ? await import("./next/settings") : await import("./laravel/settings");
  return impl.account(page);
}
