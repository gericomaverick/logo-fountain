// Laravel auth screens (story 4.9b): resources/js/Pages/Auth/{Login,Callback,SetPassword,ResetPassword}.tsx and
// Components/auth/PasswordForm.tsx. Inertia pages hydrate once (no dev-server reloads), so no retry loop.
import type { Page } from "@playwright/test";
import type { AuthPages } from "../index";

export const AUTH_PATHS = ["/login", "/set-password", "/reset-password", "/auth/callback", "/forgot-password"];
export const offAuthScreens = (url: URL) => !AUTH_PATHS.includes(url.pathname);

/** Waits for the page's own network to settle so typed input is not lost to a late hydration (bounded: polling pages never go idle). */
export const settle = (page: Page) => page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => undefined);

export async function fillAndSubmit(page: Page, email: string, password: string) {
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
}

export function auth(page: Page): AuthPages {
  return {
    async signIn(email, password) {
      if (new URL(page.url()).pathname !== "/login") await page.goto("/login");
      await settle(page);
      await fillAndSubmit(page, email, password); // Login.tsx: postAuth('login') then router.visit(next)
      await page.waitForURL(offAuthScreens, { timeout: 20_000 });
    },
    async requestMagicLink(email) {
      if (new URL(page.url()).pathname !== "/login") await page.goto("/login");
      await settle(page);
      await page.getByLabel("Email", { exact: true }).fill(email);
      await page.getByRole("button", { name: "Email me a sign-in link" }).click();
      await page.getByRole("status").filter({ hasText: /sign-in link has been sent/i }).waitFor(); // Login.tsx: the uniform notice
    },
    async confirmMagicLink(link) {
      // Callback.tsx: nothing happens until the explicit confirm (no sign-in on page load).
      await page.goto(link);
      await settle(page);
      await page.getByRole("button", { name: "Confirm sign-in" }).click();
      await page.waitForURL(offAuthScreens, { timeout: 20_000 });
    },
    async setPasswordFromLink(link, password) {
      await page.goto(link);
      await settle(page);
      await page.getByLabel("New password", { exact: true }).fill(password);
      await page.getByLabel("Confirm new password").fill(password);
      await page.getByRole("button", { name: "Save password" }).click();
      await page.waitForURL((url) => url.pathname === "/login" && url.searchParams.get("password") === "updated", { timeout: 20_000 }); // PasswordForm.tsx
    },
  };
}
