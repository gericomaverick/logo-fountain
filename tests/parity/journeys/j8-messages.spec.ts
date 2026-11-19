// Journey 8 (02-test-strategy.md §4): messages both ways, with system messages interleaved.
// The client leg runs everywhere. The admin reply is a 500 on Next (F-17, brownfield/api-client.md corrections 1),
// so that leg is a DV-14 deviation test: it asserts the reply succeeds and is listed in expected-next-failures.txt.
// The admin screen for replying is journey 12-18's (story 0.8d); here the admin replies through the admin's API.
import { expect, test } from "../fixtures";
import { apiClient, baseURL, PARITY_PASSWORD } from "../adapters/api";
import { mailbox } from "../adapters/mail";
import { withMailInFlight } from "../adapters/stripe";
import { messagesPagesFor, pagesFor, type ThreadEntry } from "../pages";
import { ADMIN, VALID_BRIEF } from "./contract/_client-helpers";
import { freshCustomer, LIFECYCLE, linksIn, oneNew } from "./_j7-j11-helpers";

// Fresh customers of their own: only adds data, so share the baseline with the webhook suites.
test.use({ db: { shared: "awaiting-brief" } });
test.describe.configure({ timeout: 180_000 });

const BRIEF_RECEIVED = "Brief received. Your designer will review and reply soon."; // api/projects/[id]/brief system message

/** A signed-in customer on their project's messages, with one message of theirs and then the brief's system line. */
async function customerWithThread(page: import("@playwright/test").Page, tag: string) {
  const { email, projectId } = await freshCustomer(tag);
  const { auth, portal } = await pagesFor(page);
  const messages = await messagesPagesFor(page);
  await auth.signIn(email, PARITY_PASSWORD);
  await portal.openProject();
  expect(await portal.currentProjectId()).toBe(projectId);
  await messages.open();
  expect(await messages.thread()).toEqual([]);
  return { email, projectId, messages };
}

test("C-14/C-15/N-11 J8 the client messages the studio, the admin is emailed and system messages interleave with the conversation @ui @messages @email", async ({ page }) => {
  const { email, projectId, messages } = await customerWithThread(page, "j8c");
  const adminBox = await mailbox(ADMIN);
  const first = `Hello from J8 ${projectId.slice(0, 8)}`;
  await withMailInFlight(() => messages.send(first));

  // N-11: the admin hears about it once, with a link to the project's admin messages.
  const notice = await oneNew(adminBox, LIFECYCLE.adminClientMessage, projectId);
  expect(linksIn(notice)).toContain(`${baseURL}/admin/projects/${projectId}/messages`);

  // A system message arrives between the client's messages (the brief submission posts one).
  const customer = await apiClient({ signInAs: email });
  const brief = await customer.post(`/api/projects/${projectId}/brief`, { data: VALID_BRIEF });
  expect(brief.ok(), await brief.text()).toBe(true);
  await customer.dispose();
  const second = "And the brief is in.";
  const adminBoxAgain = await mailbox(ADMIN);
  await withMailInFlight(() => messages.send(second));
  await oneNew(adminBoxAgain, LIFECYCLE.adminClientMessage, projectId);

  expect(await messages.thread()).toEqual<ThreadEntry[]>([
    { kind: "message", text: first, mine: true },
    { kind: "system", text: BRIEF_RECEIVED },
    { kind: "message", text: second, mine: true },
  ]);
});

test("DV-14/C-14/D-17/N-06 J8 an admin reply succeeds, the client is emailed and sees it after the system message @deviation @ui @messages @email", async ({ page }) => {
  const { email, projectId, messages } = await customerWithThread(page, "j8a");
  await withMailInFlight(() => messages.send("Hello, who designs my logo?"));
  const customer = await apiClient({ signInAs: email });
  const brief = await customer.post(`/api/projects/${projectId}/brief`, { data: VALID_BRIEF });
  expect(brief.ok(), await brief.text()).toBe(true);
  await customer.dispose();

  // The studio replies (Next: 500, the isAdmin profile upsert is refused by the DB trigger, F-17).
  const clientBox = await mailbox(email);
  const reply = "Hi! I'm Dana, your designer.";
  const admin = await apiClient({ signInAs: ADMIN });
  const res = await withMailInFlight(() => admin.post(`/api/projects/${projectId}/messages`, { data: { body: reply } }));
  expect(res.status(), await res.text()).toBe(201);
  await admin.dispose();

  // N-06: the client is told once, with a link to the project's messages.
  const notice = await oneNew(clientBox, LIFECYCLE.clientNewMessage);
  expect(linksIn(notice)).toContain(`${baseURL}/project/${projectId}/messages`);

  expect(await messages.thread()).toEqual<ThreadEntry[]>([
    { kind: "message", text: "Hello, who designs my logo?", mine: true },
    { kind: "system", text: BRIEF_RECEIVED },
    { kind: "message", text: reply, mine: false },
  ]);
});
