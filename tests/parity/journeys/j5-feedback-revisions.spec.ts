// Journey 5 (02-test-strategy.md §4, ux-design.md §7 "Feedback and revision"): a comment is free and emails nobody;
// a revision request reserves one revision (shown as pending) and emails the studio; the studio marks it delivered
// (admin API; the admin screens are story 0.8d) -> the revision shows as used and the client is emailed.
import { expect, test } from "../fixtures";
import { apiClient, baseURL, PARITY_PASSWORD } from "../adapters/api";
import { extractLinks, getMessage, mailbox } from "../adapters/mail";
import { seed } from "../adapters/seed";
import { ADMIN_EMAIL } from "../adapters/stripe";
import { pagesFor } from "../pages";

const CLIENT = "client.a@parity.test";
// lib/project-lifecycle-email.ts (N-12, N-05).
const FEEDBACK_SUBMITTED = "New concept feedback submitted";
const REVISION_READY = "Your revised concept is ready";

test.use({ db: "exclusive" });
test.describe.configure({ timeout: 180_000 });

test("C-10/C-11/K-14/N-12/D-09/N-05/N-15 J5 a comment emails nobody, a revision request is reserved then consumed on delivery, with one email each way @ui @revisions @concepts @email", async ({ page }) => {
  seed("concepts-ready"); // Professional: 2 revisions, none used
  const { auth, portal, concepts, thread } = await pagesFor(page);
  await auth.signIn(CLIENT, PARITY_PASSWORD);
  await portal.openProject();
  const projectId = await portal.currentProjectId();
  expect(await concepts.allowance("revisions")).toEqual({ limit: 2, used: 0, pending: 0, left: 2 });

  // C-10: a comment goes into the concept's thread, uses no allowance and emails nobody.
  const adminMail = await mailbox(ADMIN_EMAIL);
  const clientMail = await mailbox(CLIENT);
  await concepts.openGallery();
  await concepts.openConcept(1);
  await concepts.comment("Love where this is going.");
  expect(await concepts.thread()).toEqual([{ kind: "comment", body: "Love where this is going." }]);
  expect(await adminMail.countAfterSettle(2_000)).toBe(0);

  // C-11/K-14: a revision request reserves one revision: pending, not yet used.
  await concepts.requestRevision("Could the icon be a little bolder?");
  expect(await concepts.thread()).toEqual([
    { kind: "comment", body: "Love where this is going." },
    { kind: "revision", body: "Could the icon be a little bolder?", status: "requested" },
  ]);
  expect(await concepts.allowance("revisions")).toEqual({ limit: 2, used: 0, pending: 1, left: 1 });
  expect(await portal.projectStatus()).toBe("REVISIONS_IN_PROGRESS");
  expect(await portal.currentTurn()).toBe("studio");

  // N-12: exactly one email to the studio, pointing at the admin concepts workflow.
  const [feedback] = await adminMail.next(1);
  expect(feedback.subject).toBe(FEEDBACK_SUBMITTED);
  expect(await adminMail.countAfterSettle(1_000)).toBe(1);
  expect(extractLinks(await getMessage(feedback.id))).toContain(`${baseURL}/admin/projects/${projectId}/concepts`);
  expect(await clientMail.countAfterSettle(0)).toBe(0);

  // D-09: the studio marks it delivered.
  const admin = await apiClient({ signInAs: ADMIN_EMAIL });
  let revisionId: string;
  try {
    const snap = (await (await admin.get(`/api/admin/projects/${projectId}`)).json()).snapshot;
    const pending = snap.revisionRequests.filter((r: any) => r.status === "requested");
    expect(pending).toHaveLength(1);
    revisionId = pending[0].id;
    const res = await admin.post(`/api/admin/projects/${projectId}/revision-requests/${revisionId}/delivered`, { data: {} });
    expect(res.status(), await res.text()).toBe(200);
  } finally {
    await admin.dispose();
  }

  // K-14: reserved -> consumed. The project is back with the client.
  expect(await concepts.allowance("revisions")).toEqual({ limit: 2, used: 1, pending: 0, left: 1 });
  expect(await portal.projectStatus()).toBe("CONCEPTS_READY");
  expect(await portal.currentTurn()).toBe("client");

  // N-05: exactly one email to the client, linking to the concepts.
  const [revised] = await clientMail.next(1);
  expect(revised.subject).toBe(REVISION_READY);
  expect(await clientMail.countAfterSettle(1_000)).toBe(1);
  expect(extractLinks(await getMessage(revised.id))).toContain(`${baseURL}/project/${projectId}/concepts`);

  await concepts.openGallery();
  await concepts.openConcept(1);
  expect((await concepts.thread()).find((e) => e.kind === "revision")).toMatchObject({ status: "delivered" });

  // N-15: both system messages, in the project's conversation.
  const notices = await thread.systemMessages();
  expect(notices).toContain(`Revision request received (${revisionId.slice(0, 8)}).`);
  expect(notices).toContain(`Revision update delivered (${revisionId.slice(0, 8)}).`);
});
