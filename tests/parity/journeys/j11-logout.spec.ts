// Journey 11 (02-test-strategy.md §4): logout is verified (the session is gone on the server, not just the cookie),
// and going back in history, or straight to a protected URL, shows nothing that needs a session.
import { expect, test } from "../fixtures";
import { baseURL, PARITY_PASSWORD } from "../adapters/api";
import { accountPagesFor, messagesPagesFor, pagesFor } from "../pages";
import { client, session } from "./contract/_auth-helpers";
import { freshCustomer } from "./_j7-j11-helpers";

// A fresh customer of their own: only adds data, so share the baseline with the webhook suites.
test.use({ db: { shared: "awaiting-brief" } });
test.describe.configure({ timeout: 180_000 });

test("A-02/A-03 J11 signing out ends the session on the server and the back button reveals no protected page @ui @auth @settings", async ({ page }) => {
  const { email, projectId } = await freshCustomer("j11");
  const { auth, portal } = await pagesFor(page);
  const messages = await messagesPagesFor(page);
  const account = await accountPagesFor(page);

  // History: sign-in, the project, its messages.
  await auth.signIn(email, PARITY_PASSWORD);
  await portal.openProject();
  expect(await portal.currentProjectId()).toBe(projectId);
  await messages.open();
  expect(await account.showsSignedInContent()).toBe(true);
  const cookies = await page.context().storageState();

  await account.signOut();
  expect(await account.showsSignedInContent()).toBe(false);

  // A-02/A-03: verified on the server. The cookies the browser held no longer authenticate anyone.
  expect(await session(page.request)).toEqual({ authenticated: false });
  const replay = await client({ storageState: cookies });
  expect(await session(replay)).toEqual({ authenticated: false });
  expect((await replay.get(`/api/projects/${projectId}`)).status()).toBe(401);
  await replay.dispose();

  // Back through the history: no step shows signed-in content.
  // (goBack() returns null for client-side history entries, so the URL is what tells us we moved.)
  const visited: string[] = [];
  for (let step = 0; step < 3; step++) {
    const before = page.url();
    await page.goBack();
    await page.waitForLoadState("load");
    // Polling pages never reach "networkidle" (story 0.9): bounded settle instead of an unbounded wait.
    await page.waitForLoadState("networkidle", { timeout: 5_000 }).catch(() => {});
    if (page.url() === before || new URL(page.url()).origin !== baseURL) break;
    visited.push(new URL(page.url()).pathname);
    expect(await account.showsSignedInContent(), `after back to ${page.url()}`).toBe(false);
  }
  expect(visited.length, "the back button moved through the history").toBeGreaterThan(0);

  // Straight to protected URLs: nothing protected either.
  for (const path of [`/project/${projectId}`, `/project/${projectId}/messages`, "/dashboard", "/settings"]) {
    await page.goto(path);
    expect(await account.showsSignedInContent(), `at ${path}`).toBe(false);
  }
});
