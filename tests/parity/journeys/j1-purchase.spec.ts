// Journey 1 (02-test-strategy.md §4, ux-design.md §10 J1): buy a package -> the success page polls until the
// purchase is confirmed -> setup email -> set a password from the fragment link -> sign in -> the new project,
// waiting on the customer's brief. Behaviour only: URLs, statuses, email subjects and links (DV-UX).
import { expect, test } from "../fixtures";
import { baseURL, PARITY_PASSWORD } from "../adapters/api";
import { mailbox, proofLink, SUBJECTS } from "../adapters/mail";
import { fulfilledProjectId } from "../adapters/stripe";
import { pagesFor } from "../pages";
import { uniqueEmail } from "./contract/_auth-helpers";

// The buyer is new and unique, so this only adds data: share the baseline with the webhook suites.
test.use({ db: { shared: "awaiting-brief" } });
test.describe.configure({ timeout: 180_000 });

test("K-01/K-02/K-06/A-06/N-01/C-01 J1 a new buyer pays, the success page confirms, the setup link sets a password and the project awaits the brief @ui @checkout @auth @email", async ({ page }) => {
  const { auth, checkout, portal } = await pagesFor(page);
  const email = uniqueEmail("j1");
  const inbox = await mailbox(email);
  const statusPolls: URL[] = [];
  page.on("request", (req) => {
    const url = new URL(req.url());
    if (url.origin === baseURL && url.pathname === "/api/checkout/status") statusPolls.push(url);
  });

  await checkout.start("essential");
  const { sessionId } = await checkout.payOnFakeStripe({ email, firstName: "Jo", lastName: "Parity" });
  await checkout.waitForConfirmation();
  // K-02: the confirmation came from polling the coarse status endpoint for this session.
  expect(statusPolls.some((url) => url.searchParams.get("session_id") === sessionId)).toBe(true);
  const projectId = await fulfilledProjectId(sessionId);

  // N-01: exactly one email, the setup link (a new buyer never gets the plain sign-in link).
  const [setup] = await inbox.next(1);
  expect(setup.subject).toBe(SUBJECTS.setup);
  expect(await inbox.countAfterSettle(1_000)).toBe(1);
  const link = proofLink(setup);
  expect(link.origin).toBe(baseURL);
  expect(link.token).not.toBe(""); // the bearer token travels in the fragment, never the query
  expect(link.query).not.toContain(link.token);
  expect(setup.text).toMatch(/one hour/i); // rule copy: the link's lifetime

  // A-06: set the first password from the link, then sign in with it.
  await auth.setPasswordFromLink(link.url.href, PARITY_PASSWORD);
  await auth.signIn(email, PARITY_PASSWORD);

  // C-01: the customer reaches their one project (via the list on Next, directly on Laravel: DV-UX).
  await portal.openProject();
  expect(await portal.currentProjectId()).toBe(projectId);
  expect(await portal.projectStatus()).toBe("AWAITING_BRIEF");
  expect(await portal.currentTurn()).toBe("client");

  // The browser holds the buyer's session, and it sees exactly this project.
  const session = await (await page.request.get("/api/auth/session")).json();
  expect(session).toMatchObject({ authenticated: true, email });
  const snapshot = (await (await page.request.get(`/api/projects/${projectId}`)).json()).snapshot;
  expect(snapshot.status).toBe("AWAITING_BRIEF");

  // A-05/A-06: the setup link was single-use.
  const reuse = await page.request.post("/api/auth/reset-password", { headers: { Origin: baseURL }, data: { token: link.token, newPassword: "Another-Pass-2026!" } });
  expect(reuse.ok()).toBe(false);
});
