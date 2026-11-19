// Journey 7 (02-test-strategy.md §4, ux-design.md §10 J3/J5): with concepts ready, the client approves one through
// the acknowledgement step -> client (N-07) and admin (N-08) emails -> the studio uploads the final ZIP (admin API)
// -> client email (N-09) -> the client downloads exactly that ZIP under `{brand}-{YYYY-MM-DD}.zip` -> delivered.
import { randomBytes } from "node:crypto";
import { expect, test } from "../fixtures";
import { apiClient, baseURL, PARITY_PASSWORD } from "../adapters/api";
import { mailbox } from "../adapters/mail";
import { seed } from "../adapters/seed";
import { approvalPagesFor, finalsPagesFor, pagesFor } from "../pages";
import { makeZip, uploadFinals } from "./contract/_admin-helpers";
import { ADMIN, CLIENT_A, conceptId, projectId } from "./contract/_client-helpers";
import { LIFECYCLE, linksIn, oneNew } from "./_j7-j11-helpers";

// The seeded client.a project is reseeded here, so the test holds the DB alone.
test.use({ db: "exclusive" });
test.describe.configure({ timeout: 180_000 });

const utcDay = (d: Date) => d.toISOString().slice(0, 10);

test("C-12/C-13/N-07/N-08/N-09/D-11 J7 the client approves a concept with the acknowledgement, the studio uploads the finals, the client downloads that exact ZIP and the project is delivered @ui @approval @finals @email", async ({ page }) => {
  seed("concepts-ready");
  const id = projectId("concepts-ready");
  const { auth, portal } = await pagesFor(page);
  const approval = await approvalPagesFor(page);
  const finals = await finalsPagesFor(page);
  const clientBox = await mailbox(CLIENT_A);
  const adminBox = await mailbox(ADMIN);

  await auth.signIn(CLIENT_A, PARITY_PASSWORD);
  await portal.openProject();
  expect(await portal.currentProjectId()).toBe(id);
  expect(await portal.projectStatus()).toBe("CONCEPTS_READY");
  expect(await portal.currentTurn()).toBe("client");

  // C-12: approval needs the explicit acknowledgement before it can be confirmed.
  await approval.openConcept(2);
  expect(await approval.approveOpenConcept()).toEqual({ confirmBlockedUntilAcknowledged: true });
  const afterApproval = (await (await page.request.get(`/api/projects/${id}`)).json()).snapshot;
  expect(afterApproval.status).toBe("AWAITING_APPROVAL");
  expect(afterApproval.concepts.map((c: { id: string; status: string }) => [c.id, c.status])).toEqual([[conceptId("concepts-ready", 2), "approved"]]);

  // N-07 to the client, N-08 to the admin, each once, each linking to the project.
  const approvedMail = await oneNew(clientBox, LIFECYCLE.clientConceptApproved, id);
  expect(linksIn(approvedMail)).toContain(`${baseURL}/project/${id}`);
  const adminMail = await oneNew(adminBox, LIFECYCLE.adminConceptApproved, id);
  expect(linksIn(adminMail)).toContain(`${baseURL}/admin/projects/${id}`);

  // The studio publishes the final ZIP (the admin screen is journey 15's; here the admin API).
  const zip = makeZip("logo.svg", `<svg xmlns='http://www.w3.org/2000/svg'><!-- ${randomBytes(8).toString("hex")} --></svg>`);
  const admin = await apiClient({ signInAs: ADMIN });
  const dayBefore = utcDay(new Date());
  const upload = await uploadFinals(admin, id, { name: "finals.zip", mimeType: "application/zip", buffer: zip });
  const dayAfter = utcDay(new Date());
  expect(upload.status(), await upload.text()).toBe(200);
  expect((await upload.json()).project).toEqual(expect.objectContaining({ id, status: "FINAL_FILES_READY" }));
  await admin.dispose();

  // N-09: the client is told the files are ready, with a link to the project.
  const readyMail = await oneNew(clientBox, LIFECYCLE.clientFinalsReady, id);
  expect(linksIn(readyMail)).toContain(`${baseURL}/project/${id}`);

  // C-13: the client downloads exactly the uploaded bytes, named {brand}-{YYYY-MM-DD}.zip (lib/final-deliverable-filename.ts).
  expect(await finals.finalFilesOffered()).toBe(true);
  const file = await finals.downloadFinalFiles();
  expect(Buffer.compare(file.bytes, zip)).toBe(0);
  expect(file.filename).toMatch(/^ada-client-\d{4}-\d\d-\d\d\.zip$/); // the client's name, slugged (no company field)
  expect([dayBefore, dayAfter]).toContain(file.filename.slice("ada-client-".length, -".zip".length));

  // The first client download completes the project: nobody's turn any more.
  await page.reload();
  expect(await portal.projectStatus()).toBe("DELIVERED");
  expect(await portal.currentTurn()).toBe("none");
  expect(await finals.finalFilesOffered()).toBe(true); // the files stay available
});
