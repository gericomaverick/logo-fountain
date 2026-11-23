// Laravel navigation edges: sign-in edges are real (story 4.9b); the client project paths wait for the client area (6.2b).
import type { Page } from "@playwright/test";
import type { NavigationPages } from "../navigation";
import { baseURL } from "../../adapters/api";
import { AUTH_PATHS, fillAndSubmit, offAuthScreens, settle } from "./auth";

const todo = (what: string, story: string) => (): never => {
  throw new Error(`Laravel page object navigation.${what}: not implemented (story ${story})`);
};

export function navigation(page: Page): NavigationPages {
  return {
    clientProjectPaths: todo("clientProjectPaths", "6.2b"),
    async signInWithNext(next, email, password) {
      // Login.tsx reads ?next= (safe path only) and router.visit(next) after a successful sign-in.
      await page.goto(`/login?next=${encodeURIComponent(next)}`);
      await settle(page);
      await fillAndSubmit(page, email, password);
      await page.waitForURL((url) => url.origin !== baseURL || !AUTH_PATHS.includes(url.pathname), { timeout: 20_000 });
      await settle(page);
    },
    async attemptSignIn(email, password) {
      await page.goto("/login");
      await settle(page);
      const posted = page.waitForResponse((r) => new URL(r.url()).pathname === "/api/auth/login" && r.request().method() === "POST", { timeout: 15_000 });
      await fillAndSubmit(page, email, password);
      const res = await posted;
      if (res.ok()) {
        await page.waitForURL(offAuthScreens);
        return null;
      }
      // Login.tsx: "We couldn’t sign you in. <generic>" in a danger InlineAlert (role=alert, or status when rate-limited text varies).
      const status = page.getByRole("alert").filter({ hasText: /\S/ });
      await status.first().waitFor();
      return (await status.first().innerText()).trim();
    },
    async continueAfterPasswordSet(email, password) {
      // PasswordForm.tsx always goes to /login?password=updated (the link's `next` is dropped), as Next.
      await settle(page);
      if (new URL(page.url()).pathname === "/login") {
        await fillAndSubmit(page, email, password);
        await page.waitForURL(offAuthScreens, { timeout: 20_000 });
      }
      await settle(page);
    },
  };
}
