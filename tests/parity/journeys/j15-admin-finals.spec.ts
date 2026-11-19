// Journey 15 (02-test-strategy.md §4): replacing the final files of a DELIVERED project. The newest ZIP is what a
// download serves, the link issued before the replacement still works until it expires (immutable objects), and
// the client notification can be retried after an email failure (D-11, D-12, D-13).
import { expect, test } from "../fixtures";
import { PARITY_PASSWORD } from "../adapters/api";
import { mailbox } from "../adapters/mail";
import { scenarioId, seed } from "../adapters/seed";
import { failNextEmailSends, withEmailFailures } from "../adapters/stripe";
import { adminPagesFor, pagesFor } from "../pages";
import { makeZip } from "./contract/_admin-helpers";

test.use({ db: "exclusive" });
test.describe.configure({ timeout: 150_000 });

const FINAL_SUBJECT = "Your final logo files are ready";

test("D-11/D-12/D-13 J15 replacing finals in DELIVERED serves the newest ZIP, keeps the old link working, and the notification retry recovers from an email failure @admin @ui @finals @email @storage", async ({ page, request }) => {
  seed("delivered");
  const projectId = scenarioId("delivered", "project", "p1");
  const { auth } = await pagesFor(page);
  await auth.signIn("admin@parity.test", PARITY_PASSWORD);
  const admin = await adminPagesFor(page);
  await admin.openProject(projectId, "files");

  const before = await admin.downloadFinals();
  const oldBytes = await (await request.get(before.url)).body();
  expect(oldBytes.subarray(0, 4)).toEqual(Buffer.from("PK\x03\x04", "latin1"));

  const replacement = makeZip("logo-v2.svg", "<svg xmlns='http://www.w3.org/2000/svg'><title>v2</title></svg>");
  expect(await admin.uploadFinals({ name: "finals-v2.zip", mimeType: "application/zip", buffer: replacement })).toMatchObject({ done: true });
  expect(await admin.projectStatus()).toBe("DELIVERED"); // a repair keeps the phase

  // The newest asset is served…
  const after = await admin.downloadFinals();
  expect(after.url).not.toBe(before.url);
  expect(Buffer.compare(await (await request.get(after.url)).body(), replacement)).toBe(0);
  // …and the link issued before the replacement still downloads the old bytes until it expires.
  const old = await request.get(before.url);
  expect(old.status()).toBe(200);
  expect(Buffer.compare(await old.body(), oldBytes)).toBe(0);

  // Notification retry: the first send fails at the email provider, the retry delivers exactly one email.
  const inbox = await mailbox("client.a@parity.test");
  await withEmailFailures(async () => {
    await failNextEmailSends(1);
    expect(await admin.retryFinalNotification()).toMatchObject({ done: false });
  });
  expect(await admin.retryFinalNotification()).toMatchObject({ done: true });
  const [mail] = await inbox.next(1);
  expect(mail.subject).toBe(FINAL_SUBJECT);
  expect(await inbox.countAfterSettle(1_500)).toBe(1);
});
