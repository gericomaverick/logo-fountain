// Decided deviations DV-8 (queued lifecycle email with retries) and DV-9 (a revision delivered by upload emails the
// client), story 0.8e. Black box: HTTP, postmark-shim's failure switch and Mailpit. Both FAIL on Next
// (expected-next-failures.txt):
//   DV-8: lifecycle emails are sent inline after commit (lib/project-lifecycle-email.ts:137 sendEmail throws on a
//         5xx), so the message POST answers 500 and the email is never sent again (messages/route.ts:107-110).
//   DV-9: the revision upload skips the client email (app/api/admin/projects/[id]/concepts/route.ts:348).
import { expect, test } from "../../fixtures";
import { apiClient } from "../../adapters/api";
import { mailbox } from "../../adapters/mail";
import { seed } from "../../adapters/seed";
import { ADMIN_EMAIL, failNextEmailSends, postmarkShimUrl, withEmailFailures } from "../../adapters/stripe";
import { oneNew } from "../_j7-j11-helpers";
import { conceptId, projectId } from "../contract/_client-helpers";
import { pngFile, randomUUID, uploadConcept } from "../contract/_admin-helpers";

test.use({ db: "exclusive" });
test.describe.configure({ timeout: 150_000 });

const pendingFailures = async () => ((await (await fetch(`${postmarkShimUrl}/__sent`)).json()) as { pendingFailures: number }).pendingFailures;

test("DV-8/N-11 a lifecycle email whose first send fails is delivered later by retry; the action still succeeds @deviation @api @email @messages", async () => {
  seed("awaiting-brief");
  const p1 = projectId("awaiting-brief");
  const admins = await mailbox(ADMIN_EMAIL);
  const clientA = await apiClient({ signInAs: "client.a@parity.test" });
  const body = `DV-8 retry probe ${randomUUID()}`;

  await withEmailFailures(async () => {
    await failNextEmailSends(1);
    const res = await clientA.post(`/api/projects/${p1}/messages`, { data: { body } });
    // The client's message is committed and acknowledged; the email is the app's problem, not the client's.
    expect(res.status(), await res.text()).toBe(201);
    // Keep the transport failing until the app has actually tried once (and been refused).
    await expect.poll(pendingFailures, { timeout: 30_000 }).toBe(0);
  });

  // The retry (backoff 10/60/300 s, epics.md story 2.7) delivers exactly one N-11 email.
  await oneNew(admins, "New client message", `/admin/projects/${p1}/messages`, { timeoutMs: 75_000, settleMs: 2_000 });
  const thread = await (await clientA.get(`/api/projects/${p1}/messages`)).json();
  expect(JSON.stringify(thread)).toContain(body);
  await clientA.dispose();
});

test("DV-9/D-08/N-05 a revision delivered by upload emails the client once per upload, and a replayed upload sends nothing @deviation @api @admin @revisions @email", async () => {
  seed("revision-reserved"); // concept 1 has one requested revision
  const p1 = projectId("revision-reserved");
  const client = await mailbox("client.a@parity.test");
  const admin = await apiClient({ signInAs: ADMIN_EMAIL });
  const requestKey = randomUUID();
  const fields = { file: pngFile(7, "revision.png"), uploadMode: "revision", conceptId: conceptId("revision-reserved", 1), requestKey };

  const res = await uploadConcept(admin, p1, fields);
  expect(res.status(), await res.text()).toBe(200);
  const mail = await oneNew(client, "Your revised concept is ready", `/project/${p1}/concepts`, { settleMs: 2_000 });
  expect(mail.subject).toBe("Your revised concept is ready");

  // The same receipt replayed (a lost response retried) is the same upload: no second email.
  const replay = await uploadConcept(admin, p1, fields);
  expect(replay.status(), await replay.text()).toBe(200);
  await oneNew(client, "Your revised concept is ready", undefined, { settleMs: 3_000 });
  await admin.dispose();
});
