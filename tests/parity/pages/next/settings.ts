// Next.js settings and account: app/settings/page.tsx (profile, password), app/settings/invoices/page.tsx,
// app/forgot-password/page.tsx, components/header-nav.tsx (sign out, lib/auth/logout.ts verified logout).
import type { Page } from "@playwright/test";
import type { AccountPages, InvoiceRow, SettingsPages } from "../settings";
import { attempt } from "./auth";

const PUBLIC_PATHS = ["/login", "/forgot-password", "/reset-password", "/set-password", "/auth/callback"];

export function settings(page: Page): SettingsPages {
  const firstName = page.getByLabel("First name");
  const lastName = page.getByLabel("Last name");
  const self: SettingsPages = {
    async open() {
      await page.goto("/settings");
      await firstName.waitFor(); // rendered once GET /api/profile answered (:160)
      await page.waitForLoadState("networkidle");
    },
    async profileName() {
      await self.open();
      return { firstName: await firstName.inputValue(), lastName: await lastName.inputValue() };
    },
    async updateName(first, last) {
      // Idempotent, so retried from the top if next dev reloads the page and drops the typed values.
      for (let i = 1; ; i++) {
        await self.open();
        try {
          await firstName.fill(first);
          await lastName.fill(last);
          await page.getByRole("button", { name: "Save changes" }).click();
          await page.getByText("Saved", { exact: true }).waitFor({ timeout: 15_000 }); // :95 after PUT /api/profile ok
          return;
        } catch (error) {
          if (i >= 3) throw error;
        }
      }
    },
    async invoices() {
      await page.goto("/settings/invoices");
      await page.getByRole("heading", { name: "Invoices", level: 1 }).waitFor();
      const table = page.getByRole("table");
      // Either the table or the empty line (:105) once GET /api/invoices answered.
      await table.or(page.getByText("No invoices yet.")).waitFor();
      if (!(await table.isVisible())) return [];
      const rows: InvoiceRow[] = [];
      for (const row of await table.locator("tbody").getByRole("row").all()) {
        const cells = row.getByRole("cell");
        const link = cells.nth(4).getByRole("link");
        rows.push({
          project: (await cells.nth(0).innerText()).trim(),
          amount: (await cells.nth(1).innerText()).trim(),
          status: (await cells.nth(3).innerText()).trim(),
          document: (await link.count()) ? { label: (await link.innerText()).trim(), href: (await link.getAttribute("href")) ?? "" } : null,
        });
      }
      return rows;
    },
    async changePassword(current, next) {
      await attempt(page, "/settings", async () => {
        await page.getByLabel("Current password").fill(current);
        await page.getByLabel("New password", { exact: true }).fill(next);
        await page.getByLabel("Confirm new password").fill(next);
        await page.getByRole("button", { name: "Update password" }).click();
      }, (url) => url.pathname === "/login"); // :142 window.location.assign("/login?password=updated")
    },
  };
  return self;
}

export function account(page: Page): AccountPages {
  return {
    async requestPasswordReset(email) {
      // Before hydration (next dev's first compile) the form submits natively as GET /forgot-password? and nothing
      // is sent, so a missing notice is retried from the top.
      for (let i = 1; ; i++) {
        await page.goto("/forgot-password");
        await page.waitForLoadState("networkidle");
        await page.getByLabel("Email").fill(email);
        await page.getByRole("button", { name: "Send reset email" }).click();
        try {
          await page.getByRole("status").filter({ hasText: "If that account exists" }).waitFor({ timeout: 15_000 }); // :68
          return;
        } catch (error) {
          if (i >= 3) throw error;
        }
      }
    },
    async signOut() {
      await page.waitForLoadState("networkidle");
      // header-nav.tsx:192; the drawer copy of the nav is hidden on desktop widths.
      await page.getByRole("button", { name: "Sign out" }).filter({ visible: true }).first().click();
      await page.waitForURL((url) => url.pathname === "/login"); // :97 only after the session check said signed out
    },
    async showsSignedInContent() {
      await page.waitForLoadState("networkidle");
      if (PUBLIC_PATHS.includes(new URL(page.url()).pathname)) return false;
      // Signed-in Next screens render the nav's Sign out button (components/header-nav.tsx:192) once the session
      // check answers. Protected data shows as a message thread, the project list's rows, or the profile form.
      // Breadcrumb links aren't a signal: the client pages build them from the URL. Anonymous, Next's
      // /project/{id}/messages still renders its empty shell with "Unauthorized — Sign in and retry." (no data).
      const signals = [
        page.getByRole("button", { name: "Sign out" }),
        page.getByRole("list", { name: /^Messages on / }),
        page.getByRole("region").locator('a[href^="/project/"]'),
        page.getByLabel("First name"),
      ];
      for (const signal of signals) if ((await signal.count()) > 0) return true;
      return false;
    },
  };
}
