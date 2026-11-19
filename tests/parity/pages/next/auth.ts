// Next.js auth screens: app/login/page.tsx, app/set-password/page.tsx (also /reset-password), app/auth/callback/page.tsx.
import type { Page } from "@playwright/test";
import type { AuthPages } from "../index";

const AUTH_PATHS = ["/login", "/set-password", "/reset-password", "/auth/callback", "/forgot-password"];
const offAuthScreens = (url: URL) => !AUTH_PATHS.includes(url.pathname);

/**
 * Opens `url`, waits for the client page to settle, runs `act` and waits for `done`. Retried from the top:
 * `next dev` can full-reload a freshly compiled page right after the first paint, which wipes typed input and,
 * on the link screens, the fragment token (lib/auth/client.ts:7 takeMailboxProof strips it on mount).
 */
export async function attempt(page: Page, url: string | null, act: () => Promise<void>, done: (url: URL) => boolean, tries = 3) {
  for (let i = 1; ; i++) {
    if (url !== null) await page.goto(url);
    await page.waitForLoadState("networkidle");
    await act();
    try {
      await page.waitForURL(done, { timeout: 20_000 });
      return;
    } catch (error) {
      if (i >= tries) throw error;
    }
  }
}

export function auth(page: Page): AuthPages {
  return {
    async signIn(email, password) {
      const url = new URL(page.url()).pathname === "/login" ? null : "/login";
      await attempt(page, url, async () => {
        await page.getByLabel("Email").fill(email);
        await page.getByLabel("Password").fill(password);
        await page.getByRole("button", { name: "Sign in", exact: true }).click();
      }, offAuthScreens); // login/page.tsx:53 router.push(next) on success
    },
    async requestMagicLink(email) {
      if (new URL(page.url()).pathname !== "/login") await page.goto("/login");
      await page.waitForLoadState("networkidle");
      await page.getByLabel("Email").fill(email);
      await page.getByRole("button", { name: "Send magic link" }).click();
      await page.getByRole("status").waitFor(); // login/page.tsx:179, the uniform "if that account exists" notice
    },
    async confirmMagicLink(link) {
      // auth/callback/page.tsx:27: nothing happens until the explicit confirm (no sign-in on page load).
      await attempt(page, link, () => page.getByRole("button", { name: "Confirm sign-in" }).click(), offAuthScreens);
    },
    async setPasswordFromLink(link, password) {
      await attempt(page, link, async () => {
        await page.getByLabel("New password", { exact: true }).fill(password);
        await page.getByLabel("Confirm new password").fill(password);
        await page.getByRole("button", { name: "Update password" }).click();
      }, (url) => url.pathname === "/login" && url.searchParams.get("password") === "updated"); // set-password/page.tsx:47
    },
  };
}
