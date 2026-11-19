// Journey 12 (02-test-strategy.md §4): the admin queue for a mix of projects. Needs-action first, ordered by
// urgency (pending feedback, then unread messages, then stuck orders; brownfield ui-pages.md "/admin"), each row
// saying why (ux-design.md J6), and the reason clears once the admin has read it.
import { expect, test } from "../fixtures";
import { PARITY_PASSWORD } from "../adapters/api";
import { scenarioId, seed } from "../adapters/seed";
import { adminPagesFor, pagesFor, type AdminQueueRow } from "../pages";

test.use({ db: "exclusive" });
test.describe.configure({ timeout: 120_000 });

const SCENARIO = "admin-queue";
const id = (key: string) => scenarioId(SCENARIO, "project", key);

test("D-01 J12 the admin queue puts needs-action first by urgency, shows why, and an opened thread stops counting as unread @admin @ui", async ({ page }) => {
  seed(SCENARIO);
  const { auth } = await pagesFor(page);
  await auth.signIn("admin@parity.test", PARITY_PASSWORD);
  const admin = await adminPagesFor(page);

  const queue = await admin.queue();
  const row = (rows: AdminQueueRow[], key: string) => rows.find((r) => r.projectId === id(key))!;
  // q1 pending feedback (score 120) > q2 unread client message (80) > q3 stuck order (50) > q4 nothing (0);
  // q5 is in progress, q6 delivered.
  expect(queue.map((r) => [r.projectId, r.section])).toEqual([
    [id("q1"), "needs-action"], [id("q2"), "needs-action"], [id("q3"), "needs-action"], [id("q4"), "needs-action"],
    [id("q5"), "in-progress"], [id("q6"), "done"],
  ]);
  expect(row(queue, "q1")).toMatchObject({ pendingFeedback: 1, newMessages: false, stuckReason: null });
  expect(row(queue, "q2")).toMatchObject({ pendingFeedback: 0, newMessages: true, stuckReason: null });
  expect(row(queue, "q3")).toMatchObject({ pendingFeedback: 0, newMessages: false, stuckReason: expect.any(String) });
  expect(row(queue, "q4")).toMatchObject({ pendingFeedback: 0, newMessages: false, newConcepts: false, stuckReason: null });
  expect(row(queue, "q1").title).toContain("Feedback Roasters");

  // Reading q2's thread clears its "unread" reason: it drops out of needs-action (AWAITING_APPROVAL is in progress).
  await admin.openProject(id("q2"), "messages");
  await expect.poll(async () => row(await admin.queue(), "q2")).toMatchObject({ section: "in-progress", newMessages: false });
  const after = await admin.queue();
  expect(after.filter((r) => r.section === "needs-action").map((r) => r.projectId)).toEqual([id("q1"), id("q3"), id("q4")]);
  expect(after.filter((r) => r.section === "in-progress").map((r) => r.projectId).sort()).toEqual([id("q2"), id("q5")].sort());
});
