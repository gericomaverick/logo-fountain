// Decided deviation DV-UX, landing URLs and redirects (02-test-strategy.md §1; ux-design.md §5.3; epics 6.1), story
// 0.8e. Browser journeys that assert where the person ends up. FAIL on Next (expected-next-failures.txt):
//   (a) sign-in always goes to /dashboard, a list even with one project (app/login/page.tsx:17-20);
//   (b) an admin on a client project URL stays there (app/project/[id]/page.tsx has no admin redirect);
//   (c) /set-password drops the link's `next` and goes to /login?password=updated (app/set-password/page.tsx:47).
import { expect, test } from "../../fixtures";
import { PARITY_PASSWORD } from "../../adapters/api";
import { mailbox, proofLink, SUBJECTS } from "../../adapters/mail";
import { seed } from "../../adapters/seed";
import { fulfilledProjectId } from "../../adapters/stripe";
import { navigationPagesFor, pagesFor } from "../../pages";
import { purchase, uniqueEmail } from "../contract/_auth-helpers";
import { projectId } from "../contract/_client-helpers";

test.use({ db: "exclusive" });
test.describe.configure({ timeout: 150_000 });

const projectPath = (id: string) => new RegExp(`^[^?#]*/project/${id}/?(?:[?#].*)?$`);

test("DV-UX/C-01/A-01 a customer with exactly one project lands on that project after sign-in @deviation @ui @auth", async ({ page }) => {
  seed("awaiting-brief"); // client A has one project
  const { auth } = await pagesFor(page);
  await auth.signIn("client.a@parity.test", PARITY_PASSWORD);
  await expect(page).toHaveURL(projectPath(projectId("awaiting-brief")), { timeout: 15_000 });
});

test("DV-UX/D-02/A-16 an admin opening a client project URL lands on the admin workspace for it @deviation @ui @admin", async ({ page }) => {
  seed("awaiting-brief");
  const p1 = projectId("awaiting-brief");
  const { auth } = await pagesFor(page);
  await auth.signIn("admin@parity.test", PARITY_PASSWORD);
  await page.goto(`/project/${p1}`);
  await expect(page).toHaveURL(new RegExp(`/admin/projects/${p1}/?(?:[?#].*)?$`), { timeout: 15_000 });
});

test("DV-UX/A-06/N-01/C-01 after setting a password from the setup link the customer reaches the project the link names @deviation @ui @auth @checkout", async ({ page }) => {
  seed("awaiting-brief");
  // Two purchases by one new buyer, so only the link's `next` can say which project to open.
  const email = uniqueEmail("dvux.setup");
  const inbox = await mailbox(email);
  const first = await fulfilledProjectId(await purchase(email, "essential"));
  await inbox.next(1);
  const second = await fulfilledProjectId(await purchase(email, "professional"));
  const setups = (await inbox.next(2)).filter((m) => m.subject === SUBJECTS.setup);
  const link = setups.map((m) => proofLink(m)).find((l) => l.next === `/project/${second}`);
  expect(link, "a setup email naming the second project").toBeTruthy();
  expect(second).not.toBe(first);

  const { auth } = await pagesFor(page);
  const nav = await navigationPagesFor(page);
  await auth.setPasswordFromLink(link!.url.toString(), PARITY_PASSWORD);
  await nav.continueAfterPasswordSet(email, PARITY_PASSWORD);
  await expect(page).toHaveURL(projectPath(second), { timeout: 15_000 });
});
