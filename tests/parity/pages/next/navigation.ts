// Next.js navigation edges (story 0.8e). Screens: app/login/page.tsx, app/set-password/page.tsx, app/project/[id]/**.
import type { Page } from "@playwright/test";
import type { NavigationPages } from "../navigation";
import { baseURL } from "../../adapters/api";
import { attempt } from "./auth";

const AUTH_PATHS = ["/login", "/set-password", "/reset-password", "/auth/callback", "/forgot-password"];
const onLogin = (page: Page) => new URL(page.url()).pathname === "/login";

async function fillAndSubmit(page: Page, email: string, password: string) {
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
}

export function navigation(page: Page): NavigationPages {
  const settle = async () => {
    await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => undefined);
  };
  return {
    clientProjectPaths: (projectId, conceptId) => [
      `/project/${projectId}`,
      `/project/${projectId}/concepts`,
      `/project/${projectId}/concept/${conceptId}`,
      `/project/${projectId}/messages`,
      `/project/${projectId}/brief`,
    ],
    async signInWithNext(next, email, password) {
      // login/page.tsx:17 reads ?next= through safeAuthNextPath, then router.push(next) after a successful sign-in (:53).
      await attempt(page, `/login?next=${encodeURIComponent(next)}`, () => fillAndSubmit(page, email, password),
        (url) => url.origin !== baseURL || !AUTH_PATHS.includes(url.pathname));
      await settle();
    },
    async attemptSignIn(email, password) {
      // The submit is retried when next dev reloads the fresh page before it hydrates (no POST is sent then).
      for (let i = 1; ; i++) {
        await page.goto("/login");
        await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => {}); // bounded: polling pages never go idle (story 0.9)
        const posted = page.waitForResponse((r) => new URL(r.url()).pathname === "/api/auth/login" && r.request().method() === "POST", { timeout: 15_000 });
        await fillAndSubmit(page, email, password);
        let res;
        try { res = await posted; } catch (error) { if (i >= 3) throw error; continue; }
        if (res.ok()) {
          await page.waitForURL((url) => !AUTH_PATHS.includes(url.pathname));
          return null;
        }
        // login/page.tsx:46 "We couldn’t sign you in. <generic>" in the role=status line (:179).
        const status = page.getByRole("status").filter({ hasText: /\S/ });
        await status.first().waitFor();
        return (await status.first().innerText()).trim();
      }
    },
    async continueAfterPasswordSet(email, password) {
      // set-password/page.tsx:47 always goes to /login?password=updated (the link's `next` is dropped), and the
      // sign-in screen then defaults to /dashboard (login/page.tsx:17-20).
      await settle();
      if (onLogin(page)) await attempt(page, null, () => fillAndSubmit(page, email, password), (url) => !AUTH_PATHS.includes(url.pathname));
      await settle();
    },
  };
}
