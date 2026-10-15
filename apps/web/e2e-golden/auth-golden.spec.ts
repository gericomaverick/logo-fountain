import { readFileSync } from "node:fs";
import { expect, test, type Browser, type Page } from "@playwright/test";

// Bearer links come from the test-process mailbox fixture written by the real-PG
// suite; the app server itself has no mail transport and no bearer-return path.
type Person = { email: string; userId: string; projectId: string; link: string };
const fixture = JSON.parse(readFileSync(process.env.AUTH_BROWSER_FIXTURE!, "utf8")) as {
  setup: Person; reset: Person; magic: Person; admin: Omit<Person, "link">; password: string;
};
const firstPassword = "Golden-first-password-1";
const changedPassword = "Golden-changed-password-2";

test.describe.configure({ mode: "serial" });

async function signIn(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
}
async function session(page: Page) {
  const response = await page.request.get("/api/auth/session");
  expect(response.headers()["cache-control"]).toContain("no-store");
  return response.json() as Promise<{ authenticated: boolean; userId?: string; isAdmin?: boolean }>;
}
async function freshPage(browser: Browser) {
  const context = await browser.newContext();
  return { context, page: await context.newPage() };
}

test("paid purchaser: setup proof -> password -> sign in -> own project; proof is single-use and leaves no bearer in URL", async ({ page, browser }) => {
  await page.goto(fixture.setup.link);
  await expect(page.getByRole("heading", { name: "Set your password" })).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.location.hash)).toBe("");
  await page.getByLabel("New password", { exact: true }).fill(firstPassword);
  await page.getByLabel("Confirm new password").fill(firstPassword);
  await page.getByRole("button", { name: "Update password" }).click();
  await expect(page).toHaveURL(/\/login\?password=updated$/);
  expect((await session(page)).authenticated).toBe(false);

  await signIn(page, fixture.setup.email, firstPassword);
  await expect(page).toHaveURL(/\/dashboard$/);
  const cookies = await page.context().cookies();
  const authCookie = cookies.find((c) => c.name.includes("session_token"));
  expect(authCookie?.httpOnly).toBe(true);
  expect(authCookie?.sameSite).toBe("Lax");
  expect(await session(page)).toMatchObject({ authenticated: true, userId: fixture.setup.userId, isAdmin: false });
  expect((await page.request.get(`/api/projects/${fixture.setup.projectId}`)).status()).toBe(200);
  // Tenant isolation: another purchaser's project is not visible.
  expect([403, 404]).toContain((await page.request.get(`/api/projects/${fixture.magic.projectId}`)).status());
  // Non-admins cannot reach the admin surface.
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/login\?next=%2Fadmin$/);

  const replay = await freshPage(browser);
  await replay.page.goto(fixture.setup.link);
  await replay.page.getByLabel("New password", { exact: true }).fill("Replay-attempt-password-9");
  await replay.page.getByLabel("Confirm new password").fill("Replay-attempt-password-9");
  await replay.page.getByRole("button", { name: "Update password" }).click();
  await expect(replay.page.getByText(/couldn’t update your password/)).toBeVisible();
  await replay.context.close();
});

test("settings change: wrong current rejected; success revokes every session including this one", async ({ page, browser }) => {
  const other = await freshPage(browser);
  await signIn(other.page, fixture.setup.email, firstPassword);
  await expect(other.page).toHaveURL(/\/dashboard$/);
  await signIn(page, fixture.setup.email, firstPassword);
  await expect(page).toHaveURL(/\/dashboard$/);

  await page.goto("/settings");
  await page.getByLabel("Current password").fill("Not-the-current-password-0");
  await page.getByLabel("New password", { exact: true }).fill(changedPassword);
  await page.getByLabel("Confirm new password").fill(changedPassword);
  await page.getByRole("button", { name: "Update password" }).click();
  await expect(page.getByText("Current password is incorrect.")).toBeVisible();
  expect((await session(page)).authenticated).toBe(true);

  await page.getByLabel("Current password").fill(firstPassword);
  await page.getByRole("button", { name: "Update password" }).click();
  await expect(page).toHaveURL(/\/login\?password=updated$/);
  expect((await session(page)).authenticated).toBe(false);
  expect((await session(other.page)).authenticated).toBe(false);
  await other.page.goto("/dashboard");
  await expect(other.page).toHaveURL(/\/login/);
  await other.context.close();

  await signIn(page, fixture.setup.email, firstPassword);
  await expect(page.getByText(/couldn’t sign you in/)).toBeVisible();
  await signIn(page, fixture.setup.email, changedPassword);
  await expect(page).toHaveURL(/\/dashboard$/);

  await page.getByRole("button", { name: "Logout" }).click();
  await expect(page).toHaveURL(/\/login/);
  expect((await session(page)).authenticated).toBe(false);
});

test("recovery proof resets the password and revokes an existing session elsewhere", async ({ page, browser }) => {
  const existing = await freshPage(browser);
  await signIn(existing.page, fixture.reset.email, fixture.password);
  await expect(existing.page).toHaveURL(/\/dashboard$/);

  await page.goto(fixture.reset.link);
  await expect(page.getByRole("heading", { name: "Choose a new password" })).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.location.hash)).toBe("");
  await page.getByLabel("New password", { exact: true }).fill(changedPassword);
  await page.getByLabel("Confirm new password").fill(changedPassword);
  await page.getByRole("button", { name: "Update password" }).click();
  await expect(page).toHaveURL(/\/login\?password=updated$/);

  expect((await session(existing.page)).authenticated).toBe(false);
  await existing.context.close();
  await signIn(page, fixture.reset.email, changedPassword);
  await expect(page).toHaveURL(/\/dashboard$/);
});

test("magic link needs an explicit POST confirmation, is single-use, and grants no password", async ({ page, browser }) => {
  await page.goto(fixture.magic.link);
  await expect(page.getByRole("heading", { name: "Complete sign-in" })).toBeVisible();
  // Landing (GET) alone must not consume the proof or create a session.
  expect((await session(page)).authenticated).toBe(false);
  await page.getByRole("button", { name: "Confirm sign-in" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  expect(await session(page)).toMatchObject({ authenticated: true, userId: fixture.magic.userId });

  const replay = await freshPage(browser);
  await replay.page.goto(fixture.magic.link);
  await replay.page.getByRole("button", { name: "Confirm sign-in" }).click();
  await expect(replay.page.getByRole("status")).toContainText(/could not be completed|expired/i);
  expect((await session(replay.page)).authenticated).toBe(false);
  await signIn(replay.page, fixture.magic.email, firstPassword);
  await expect(replay.page.getByText(/couldn’t sign you in/)).toBeVisible();
  await replay.context.close();
});

test("bootstrapped verified admin reaches admin surface; hostile-origin auth POSTs are refused", async ({ page }) => {
  await signIn(page, fixture.admin.email, fixture.password);
  await expect(page).toHaveURL(/\/admin/);
  expect(await session(page)).toMatchObject({ authenticated: true, isAdmin: true });

  const hostile = await page.request.post("/api/auth/login", {
    headers: { origin: "https://evil.invalid", "content-type": "application/json" },
    data: { email: fixture.admin.email, password: fixture.password },
  });
  expect(hostile.status()).toBe(403);
  const hostileLogout = await page.request.post("/api/auth/logout", { headers: { origin: "https://evil.invalid", "content-type": "application/json" }, data: {} });
  expect(hostileLogout.status()).toBe(403);
  expect((await session(page)).authenticated).toBe(true);
});
