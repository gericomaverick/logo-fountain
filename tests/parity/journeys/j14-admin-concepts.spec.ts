// Journey 14 (02-test-strategy.md §4): the admin uploads a concept, the answer is lost on the way back, and the
// retry of the same upload replays the receipt instead of publishing twice (D-05, X-13). Then a concept is deleted,
// and the last visible one can't be (D-07).
import { expect, test } from "../fixtures";
import { apiClient, PARITY_PASSWORD } from "../adapters/api";
import { scenarioId, seed } from "../adapters/seed";
import { adminPagesFor, pagesFor } from "../pages";
import { pngFile } from "./contract/_admin-helpers";

test.use({ db: "exclusive" });
test.describe.configure({ timeout: 150_000 });

test("D-05/D-07/X-13 J14 a concept upload retried after a lost response is published once; a concept is deleted, the last visible one can't be @admin @ui @concepts @uploads", async ({ page }) => {
  seed("brief-submitted");
  const projectId = scenarioId("brief-submitted", "project", "p1");
  const { auth } = await pagesFor(page);
  await auth.signIn("admin@parity.test", PARITY_PASSWORD);
  const admin = await adminPagesFor(page);
  await admin.openProject(projectId, "concepts");
  const visible = async () => (await admin.concepts()).filter((c) => c.status !== "deleted").map((c) => [c.number, c.status]);

  // The upload reaches the app, but its answer never reaches the browser.
  const first = pngFile(11, "direction-a.png");
  expect(await admin.uploadConcept(first, { notes: "Direction A", loseResponse: true })).toEqual({ outcome: "unconfirmed" });
  // …it was committed all the same (read back over HTTP).
  const api = await apiClient({ signInAs: "admin@parity.test" });
  const committed = await (await api.get(`/api/admin/projects/${projectId}/concepts`)).json();
  expect(committed.concepts.map((c: any) => [c.number, c.status])).toEqual([[1, "published"]]);
  await api.dispose();
  // The admin retries the same upload: the app replays its receipt, so there is still exactly one concept.
  expect(await admin.uploadConcept(first, { notes: "Direction A" })).toEqual({ outcome: "published", conceptNumber: 1 });
  expect(await visible()).toEqual([[1, "published"]]);
  await admin.openProject(projectId);
  expect((await admin.allowances()).concepts).toEqual({ limit: 2, used: 1, reserved: 0 });
  expect(await admin.projectStatus()).toBe("CONCEPTS_READY");

  // A different file is a new concept.
  expect(await admin.uploadConcept(pngFile(12, "direction-b.png"), { notes: "Direction B" })).toEqual({ outcome: "published", conceptNumber: 2 });
  expect(await visible()).toEqual([[1, "published"], [2, "published"]]);

  // Delete concept 2; the last visible concept can't be deleted while concepts are ready.
  expect(await admin.deleteConcept(2)).toEqual({ done: true });
  expect(await visible()).toEqual([[1, "published"]]);
  expect(await admin.deleteConcept(1)).toMatchObject({ done: false });
  expect(await visible()).toEqual([[1, "published"]]);
  await admin.openProject(projectId);
  expect((await admin.allowances()).concepts).toMatchObject({ used: 2 }); // deleting never gives the slot back

  await admin.openProject(projectId, "audit");
  await expect.poll(async () => (await admin.auditLog()).map((e) => e.type).filter((t) => ["concept_uploaded", "concept_deleted"].includes(t)))
    .toEqual(["concept_deleted", "concept_uploaded", "concept_uploaded"]);
});
