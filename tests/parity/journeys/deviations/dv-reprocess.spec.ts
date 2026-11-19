// Decided deviation DV-6 (reprocess runs the webhook's post-fulfilment steps), story 0.8e. Black box: a session
// paid at stripe-fake whose webhook never arrived is reprocessed by the admin API; Mailpit shows the emails.
// FAILS on Next (expected-next-failures.txt): app/api/admin/checkout/reprocess/route.ts fulfils without sending
// the setup/sign-in email or the admin new-project email (pinned without emails by contract/admin-ops.spec.ts).
import { expect, test } from "../../fixtures";
import { mailbox, proofLink, SUBJECTS } from "../../adapters/mail";
import { seed } from "../../adapters/seed";
import { ADMIN_EMAIL, loadStripeFixture, signInSerialised } from "../../adapters/stripe";
import { oneNew } from "../_j7-j11-helpers";

test.use({ db: "exclusive" });
test.describe.configure({ timeout: 120_000 });

test("DV-6/K-12/N-01/N-10 reprocess sends the customer setup email and the admin new-project email once, and a repeat sends nothing @deviation @api @admin @checkout @email", async () => {
  seed("admin-only");
  const paid = await loadStripeFixture("package-essential-paid"); // a new buyer: no account yet
  const customer = await mailbox(paid.email!);
  const admins = await mailbox(ADMIN_EMAIL);
  const admin = await signInSerialised(ADMIN_EMAIL);

  const first = await admin.post("/api/admin/checkout/reprocess", { data: { session_id: paid.sessionId } });
  expect(first.status(), await first.text()).toBe(200);
  const { projectId } = await first.json();

  const setup = await oneNew(customer, SUBJECTS.setup);
  expect(proofLink(setup).next).toBe(`/project/${projectId}`); // the link's next, as the webhook's setup email
  await oneNew(admins, SUBJECTS.adminNewProject, projectId);

  // The same idempotency markers as the webhook: reprocessing again (deduped) sends nothing more.
  const again = await admin.post("/api/admin/checkout/reprocess", { data: { session_id: paid.sessionId } });
  expect(again.status()).toBe(200);
  expect(await again.json()).toMatchObject({ deduped: true, projectId });
  await oneNew(customer, SUBJECTS.setup, undefined, { settleMs: 3_000 });
  await oneNew(admins, SUBJECTS.adminNewProject, projectId, { settleMs: 0 });
  await admin.dispose();
});
