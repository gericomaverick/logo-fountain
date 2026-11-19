// Journey 2 (02-test-strategy.md §4): a customer who already has a password buys again -> they get a sign-in
// link, not a setup link -> they confirm it explicitly on the callback screen -> they are signed in on the new
// project. Behaviour only: subjects, links, session and project state (DV-UX).
import { expect, test } from "../fixtures";
import { apiClient, baseURL, PARITY_PASSWORD } from "../adapters/api";
import { mailbox, proofLink, SUBJECTS } from "../adapters/mail";
import { fulfilledProjectId } from "../adapters/stripe";
import { pagesFor } from "../pages";
import { client, purchase, uniqueEmail } from "./contract/_auth-helpers";

// A fresh returning customer of its own (not the seeded client.a, which the webhook suites watch): only adds data.
test.use({ db: { shared: "awaiting-brief" } });
test.describe.configure({ timeout: 180_000 });

test("A-05/A-06/N-02/K-06 J2 a returning customer buys again, gets a sign-in link, confirms it and lands signed in on the new project @ui @auth @checkout @email", async ({ page }) => {
  // Arrange through HTTP (journey 1 covers this path in the browser): a first purchase, then a password.
  const email = uniqueEmail("j2");
  const firstBox = await mailbox(email);
  await purchase(email, "essential");
  const [setup] = await firstBox.next(1);
  expect(setup.subject).toBe(SUBJECTS.setup);
  const anon = await client();
  const set = await anon.post("/api/auth/reset-password", { data: { token: proofLink(setup).token, newPassword: PARITY_PASSWORD } });
  expect(set.ok(), await set.text()).toBe(true);
  await anon.dispose();

  // Act in the browser: buy again with the same email.
  const { auth, checkout, portal } = await pagesFor(page);
  const inbox = await mailbox(email);
  await checkout.start("professional");
  const { sessionId } = await checkout.payOnFakeStripe({ email });
  await checkout.waitForConfirmation();
  const projectId = await fulfilledProjectId(sessionId);

  // N-02 / A-06: exactly one email, and it is the sign-in link, not a setup link.
  const [signIn] = await inbox.next(1);
  expect(signIn.subject).toBe(SUBJECTS.signIn);
  expect(await inbox.countAfterSettle(1_000)).toBe(1);
  const link = proofLink(signIn);
  expect(link.origin).toBe(baseURL);
  expect(link.token).not.toBe("");

  // A-05: confirming the link signs the browser in and takes it to the project the email is about.
  await auth.confirmMagicLink(link.url.href);
  const session = await (await page.request.get("/api/auth/session")).json();
  expect(session).toMatchObject({ authenticated: true, email });
  await portal.openProject(); // no-op when the link already landed on it
  expect(await portal.currentProjectId()).toBe(projectId);
  expect(await portal.projectStatus()).toBe("AWAITING_BRIEF");

  // The customer now has both projects, and the setup flow never touched the existing password.
  const projects = await (await page.request.get("/api/projects")).json();
  expect(JSON.stringify(projects)).toContain(projectId);
  const withPassword = await apiClient({ signInAs: email, password: PARITY_PASSWORD });
  await withPassword.dispose();
});
