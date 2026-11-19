// Journey 9 (02-test-strategy.md §4): settings. Update the name (persisted), see the invoices (stripe-fake gives the
// purchase a real receipt), change the password -> every session ends, the current one included (A-09).
// There is no VAT field (C-17, finding F-3), so the "VAT number" variant of item 9 has nothing to drive.
import { expect, test } from "../fixtures";
import { apiClient, baseURL, PARITY_PASSWORD } from "../adapters/api";
import { stripeFakeUrl } from "../adapters/stripe";
import { pagesFor, settingsPagesFor } from "../pages";
import { session } from "./contract/_auth-helpers";
import { freshCustomer } from "./_j7-j11-helpers";

// A fresh customer of their own: only adds data, so share the baseline with the webhook suites.
test.use({ db: { shared: "awaiting-brief" } });
test.describe.configure({ timeout: 180_000 });

const NEW_PASSWORD = "Settings-Pass-2026!";

test("C-17/C-18/K-11/A-09 J9 the customer renames themselves, sees their invoice and changes the password, which ends every session including this one @ui @settings @invoices @auth", async ({ page, browser }) => {
  const { email } = await freshCustomer("j9");

  // A second browser, signed in earlier: it must be signed out by the password change too.
  const other = await browser.newContext({ baseURL });
  const otherPage = await other.newPage();
  await (await pagesFor(otherPage)).auth.signIn(email, PARITY_PASSWORD);
  expect(await session(otherPage.request)).toMatchObject({ authenticated: true, email });

  const { auth } = await pagesFor(page);
  const settings = await settingsPagesFor(page);
  await auth.signIn(email, PARITY_PASSWORD);

  // C-17: the name is saved and survives a fresh read.
  await settings.updateName("Grace", "Hopper");
  expect(await settings.profileName()).toEqual({ firstName: "Grace", lastName: "Hopper" });
  expect((await (await page.request.get("/api/profile")).json()).profile).toMatchObject({ firstName: "Grace", lastName: "Hopper", fullName: "Grace Hopper" });

  // C-18/K-11: one row for the one purchase, settled, linking to its Stripe document (here stripe-fake's receipt).
  const rows = await settings.invoices();
  expect(rows).toHaveLength(1);
  const [row] = rows;
  expect(row).toMatchObject({ project: "Your logo project", status: "Paid" });
  expect(row.amount).toMatch(/^£\d[\d,]*\.\d\d$/);
  expect(row.document).not.toBeNull();
  expect(["Download PDF", "View invoice", "View receipt"]).toContain(row.document!.label);
  expect(new URL(row.document!.href).origin).toBe(new URL(stripeFakeUrl).origin);
  expect((await fetch(row.document!.href)).ok).toBe(true);

  // A-09: changing the password signs this browser out, and the other one, and the old password is dead.
  await settings.changePassword(PARITY_PASSWORD, NEW_PASSWORD);
  expect(await session(page.request)).toEqual({ authenticated: false });
  expect(await session(otherPage.request)).toEqual({ authenticated: false });
  await other.close();
  await expect(apiClient({ signInAs: email, password: PARITY_PASSWORD })).rejects.toThrow(/sign-in failed/);
  await (await apiClient({ signInAs: email, password: NEW_PASSWORD })).dispose();
});
