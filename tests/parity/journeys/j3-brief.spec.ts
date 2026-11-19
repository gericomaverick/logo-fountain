// Journey 3 (02-test-strategy.md §4, ux-design.md §10 J2): start the brief, answers autosave to the account, a reload
// and a fresh tab (no tab-local copy) both get them back, submit through the confirmation dialog -> BRIEF_SUBMITTED,
// the "Brief received" system message is in the thread, and no email is sent to anyone (N-13).
import { expect, test } from "../fixtures";
import { PARITY_PASSWORD } from "../adapters/api";
import { mailbox } from "../adapters/mail";
import { seed } from "../adapters/seed";
import { ADMIN_EMAIL } from "../adapters/stripe";
import { pagesFor, type BriefAnswers } from "../pages";

const CLIENT = "client.a@parity.test";

// Seeds its own starting state, and the client's and admin's mailboxes must stay quiet: exclusive.
test.use({ db: "exclusive" });
test.describe.configure({ timeout: 180_000 });

test("C-05/C-06/C-07/N-13/N-15 J3 the brief autosaves, survives a reload and a fresh tab, and submitting it moves the project on without any email @ui @brief @email", async ({ page }) => {
  seed("awaiting-brief");
  const { auth, portal, brief, thread } = await pagesFor(page);
  const clientMail = await mailbox(CLIENT);
  const adminMail = await mailbox(ADMIN_EMAIL);

  await auth.signIn(CLIENT, PARITY_PASSWORD);
  await portal.openProject();
  const projectId = await portal.currentProjectId();
  expect(await portal.projectStatus()).toBe("AWAITING_BRIEF");

  // C-05/C-06: the first section's answers are saved to the account as they're typed.
  const first: BriefAnswers = { brandName: "Parity Bakery", industry: "Bakery", offerSummary: "Sourdough and pastries\nfor the neighbourhood." };
  await brief.open();
  await brief.fill(first);
  await brief.waitUntilSaved();
  const draft = (await (await page.request.get(`/api/projects/${projectId}/brief/draft`)).json()).draft;
  expect(draft.answers).toMatchObject(first); // spaces and newlines kept (C-05)

  await brief.reload();
  expect(await brief.shownAnswers(["brandName", "industry", "offerSummary"])).toEqual(first);

  // A new tab has no tab-local copy, so what it shows came from the account draft ("on any device").
  const other = await page.context().newPage();
  const second = await pagesFor(other);
  await other.goto(`/project/${projectId}`);
  await second.brief.open();
  expect(await second.brief.shownAnswers(["brandName", "industry", "offerSummary"])).toEqual(first);
  await other.close();

  // Finish the wizard and submit through the confirmation dialog.
  await brief.next();
  await brief.fill({ audiencePrimary: "Local families.", businessGoals: "Grow weekend trade." });
  await brief.next();
  await brief.fill({ brandPersonality: "Bold, Approachable", styleDirection: "Wordmark" });
  await brief.next();
  await brief.fill({ usageContexts: "Signage, Packaging" });
  await brief.next();
  await brief.submit();

  // C-07: the project moved on, it's the studio's turn, and the brief is stored as answered.
  await portal.openProject();
  expect(await portal.currentProjectId()).toBe(projectId);
  expect(await portal.projectStatus()).toBe("BRIEF_SUBMITTED");
  expect(await portal.currentTurn()).toBe("studio");
  const stored = (await (await page.request.get(`/api/projects/${projectId}/brief`)).json()).brief;
  expect(stored).toMatchObject({ version: 1, answers: { ...first, brandPersonality: "Bold, Approachable", styleDirection: "Wordmark", usageContexts: "Signage, Packaging" } });
  expect((await (await page.request.get(`/api/projects/${projectId}/brief/draft`)).json()).draft).toBeNull(); // draft cleared

  // N-15: the system message, in the project's conversation.
  expect(await thread.systemMessages()).toContain("Brief received. Your designer will review and reply soon.");

  // N-13: brief submission is confirmed in the UI only. No email to the client or the admin.
  expect(await clientMail.countAfterSettle(2_000)).toBe(0);
  expect(await adminMail.countAfterSettle(0)).toBe(0);
});
