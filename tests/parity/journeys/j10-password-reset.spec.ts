// Journey 10 (02-test-strategy.md §4): forgot password -> reset email -> reset from the fragment link -> every old
// session is dead, every outstanding reset link is dead (the used one and an older one), the new password works.
import { expect, test } from "../fixtures";
import { apiClient, baseURL, PARITY_PASSWORD } from "../adapters/api";
import { mailbox, proofLink, SUBJECTS } from "../adapters/mail";
import { withMailInFlight } from "../adapters/stripe";
import { accountPagesFor, pagesFor } from "../pages";
import { client, session } from "./contract/_auth-helpers";
import { freshCustomer, oneNew } from "./_j7-j11-helpers";

// A fresh customer of their own: only adds data, so share the baseline with the webhook suites.
test.use({ db: { shared: "awaiting-brief" } });
test.describe.configure({ timeout: 180_000 });

const NEW_PASSWORD = "Recovered-Pass-2026!";

test("A-07/A-08/N-03 J10 a forgotten password is reset from the emailed link, which ends old sessions and old links, and the new password signs in @ui @auth @settings @email", async ({ page, browser }) => {
  const { email } = await freshCustomer("j10");
  // Sessions from before the reset: an API client and another browser.
  const oldApi = await apiClient({ signInAs: email });
  const other = await browser.newContext({ baseURL });
  const otherPage = await other.newPage();
  await (await pagesFor(otherPage)).auth.signIn(email, PARITY_PASSWORD);

  const { auth } = await pagesFor(page);
  const account = await accountPagesFor(page);

  // A-07: two requests (uniform notice each time), two emails; the second link is used.
  const firstBox = await mailbox(email);
  await withMailInFlight(() => account.requestPasswordReset(email));
  const older = proofLink(await oneNew(firstBox, SUBJECTS.reset));
  const secondBox = await mailbox(email);
  await withMailInFlight(() => account.requestPasswordReset(email));
  const resetMail = await oneNew(secondBox, SUBJECTS.reset);
  const link = proofLink(resetMail);
  expect(link.origin).toBe(baseURL);
  expect(link.path).toBe("/reset-password");
  expect(link.token).not.toBe("");
  expect(link.query).not.toContain(link.token); // the bearer token travels in the fragment
  expect(link.token).not.toBe(older.token);
  // Rule copy: single use, one hour. Next states it only in the HTML part (apps/web/src/lib/auth/mail.ts:32).
  expect(resetMail.html).toMatch(/single-use link within one hour/i);

  // A-08: reset in the browser. No session is created; the person signs in afterwards.
  await auth.setPasswordFromLink(link.url.href, NEW_PASSWORD);
  expect(await session(page.request)).toEqual({ authenticated: false });

  // Every session from before is dead.
  expect(await session(oldApi)).toEqual({ authenticated: false });
  expect(await session(otherPage.request)).toEqual({ authenticated: false });
  await oldApi.dispose();
  await other.close();

  // Both reset links are dead: the one used and the older one.
  const anon = await client();
  for (const token of [link.token, older.token]) {
    const reuse = await anon.post("/api/auth/reset-password", { data: { token, newPassword: "Another-Pass-2026!" } });
    expect(reuse.ok(), `reset token ${token.slice(0, 6)}… still works`).toBe(false);
  }
  await anon.dispose();

  // The new password signs in (in the browser); the old one doesn't.
  await auth.signIn(email, NEW_PASSWORD);
  expect(await session(page.request)).toMatchObject({ authenticated: true, email });
  await expect(apiClient({ signInAs: email, password: PARITY_PASSWORD })).rejects.toThrow(/sign-in failed/);
});
