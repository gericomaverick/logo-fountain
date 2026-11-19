// Journey 16 (02-test-strategy.md §4): an entitlement override with a reason, then a clean-slate reset. The reset
// returns the project to BRIEF_SUBMITTED, zeroes usage but keeps the limits, and keeps the stored objects (links
// issued before it still download); the audit log shows each action (D-14, D-15, D-16, X-08).
import { expect, test } from "../fixtures";
import { apiClient, PARITY_PASSWORD } from "../adapters/api";
import { scenarioId, seed } from "../adapters/seed";
import { adminPagesFor, pagesFor } from "../pages";

test.use({ db: "exclusive" });
test.describe.configure({ timeout: 150_000 });

test("D-14/D-15/D-16/X-08 J16 the admin overrides an allowance with a reason and resets the project; stored files survive and the audit log shows both @admin @ui @entitlements @audit @storage", async ({ page, request }) => {
  seed("delivered");
  const projectId = scenarioId("delivered", "project", "p1");
  const { auth } = await pagesFor(page);
  await auth.signIn("admin@parity.test", PARITY_PASSWORD);
  const admin = await adminPagesFor(page);
  await admin.openProject(projectId);
  expect(await admin.allowances()).toEqual({ concepts: { limit: 2, used: 2, reserved: 0 }, revisions: { limit: 2, used: 0, reserved: 0 } });

  expect(await admin.overrideEntitlements({ revisions: 4 }, "Goodwill: two extra revisions after the delay")).toEqual({ done: true });
  await expect.poll(async () => (await admin.allowances()).revisions).toEqual({ limit: 4, used: 0, reserved: 0 });
  expect((await admin.allowances()).concepts).toEqual({ limit: 2, used: 2, reserved: 0 }); // untouched

  // Links issued before the reset: the final ZIP (through the workspace) and a concept image.
  const finalLink = (await admin.downloadFinals()).url;
  const api = await apiClient({ signInAs: "admin@parity.test" });
  const { concepts } = await (await api.get(`/api/admin/projects/${projectId}/concepts`)).json();
  const conceptLink: string = concepts.find((c: any) => c.imageUrl).imageUrl;
  await api.dispose();

  expect(await admin.resetProject()).toEqual({ done: true });
  await expect.poll(() => admin.projectStatus()).toBe("BRIEF_SUBMITTED"); // the brief is kept
  expect(await admin.allowances()).toEqual({ concepts: { limit: 2, used: 0, reserved: 0 }, revisions: { limit: 4, used: 0, reserved: 0 } });
  expect(await admin.concepts()).toEqual([]);

  // The objects were kept: both links still download until they expire.
  for (const link of [finalLink, conceptLink]) expect((await request.get(link)).status(), link.split("?")[0]).toBe(200);

  await admin.openProject(projectId, "audit");
  await expect.poll(async () => (await admin.auditLog()).map((e) => e.type).filter((t) => ["entitlement_limit_overridden", "project_reset"].includes(t)))
    .toEqual(["project_reset", "entitlement_limit_overridden"]);
  const log = await admin.auditLog();
  for (const type of ["project_reset", "entitlement_limit_overridden"]) {
    expect(log.find((e) => e.type === type)?.actorEmail, type).toBe("admin@parity.test");
  }
});
