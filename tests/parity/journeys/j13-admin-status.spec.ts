// Journey 13 (02-test-strategy.md §4): hold, resume and cancel from the admin workspace. Allowed actions work,
// resume returns to the recorded phase, and disallowed ones (hold twice, anything after cancel, resume without
// evidence) are refused with the project unchanged (brownfield api-admin.md "Status changes"; ux-design.md J7).
import { expect, test } from "../fixtures";
import { PARITY_PASSWORD } from "../adapters/api";
import { scenarioId, seed } from "../adapters/seed";
import { adminPagesFor, pagesFor } from "../pages";

test.use({ db: "exclusive" });
test.describe.configure({ timeout: 150_000 });

async function signedInAdmin(page: import("@playwright/test").Page) {
  const { auth } = await pagesFor(page);
  await auth.signIn("admin@parity.test", PARITY_PASSWORD);
  return adminPagesFor(page);
}

test("D-03/X-07/X-08 J13 the admin holds, resumes and cancels a project; disallowed actions are refused and only real changes are audited @admin @ui @state @audit", async ({ page }) => {
  seed("concepts-ready");
  const projectId = scenarioId("concepts-ready", "project", "p1");
  const admin = await signedInAdmin(page);
  await admin.openProject(projectId);
  expect(await admin.projectStatus()).toBe("CONCEPTS_READY");
  expect(await admin.changeStatus("resume", "Nothing to resume")).toMatchObject({ done: false });

  expect(await admin.changeStatus("hold", "Waiting for the client's trademark check")).toEqual({ done: true });
  await expect.poll(() => admin.projectStatus()).toBe("ON_HOLD");
  expect(await admin.changeStatus("hold", "Hold again")).toMatchObject({ done: false });
  expect(await admin.projectStatus()).toBe("ON_HOLD");

  expect(await admin.changeStatus("resume", "Trademark check cleared")).toEqual({ done: true });
  await expect.poll(() => admin.projectStatus()).toBe("CONCEPTS_READY"); // the recorded pre-hold phase

  expect(await admin.changeStatus("cancel", "Client withdrew")).toEqual({ done: true });
  await expect.poll(() => admin.projectStatus()).toBe("CANCELLED");
  for (const action of ["hold", "resume", "cancel"] as const) {
    expect(await admin.changeStatus(action, `Try ${action} after cancel`), action).toMatchObject({ done: false });
  }
  expect(await admin.projectStatus()).toBe("CANCELLED");

  // Hold, resume and cancel are each audited once; the refusals wrote nothing.
  await admin.openProject(projectId, "audit");
  await expect.poll(async () => (await admin.auditLog()).filter((e) => e.type === "state_changed").length).toBe(3 + 3); // 3 seeded + 3 here
  const [latest] = await admin.auditLog();
  expect(latest).toMatchObject({ type: "state_changed", actorEmail: "admin@parity.test" });
});

test("D-03 J13 resuming a hold whose phase lost its evidence is refused in the workspace and the project stays on hold @admin @ui @state", async ({ page }) => {
  seed("stale-hold");
  const admin = await signedInAdmin(page);
  // p1 was held from FINAL_FILES_READY but has no final ZIP; p2 from CONCEPTS_READY with no visible concept.
  for (const key of ["p1", "p2"]) {
    await admin.openProject(scenarioId("stale-hold", "project", key));
    expect(await admin.projectStatus(), key).toBe("ON_HOLD");
    const outcome = await admin.changeStatus("resume", "Back to work");
    expect(outcome, key).toMatchObject({ done: false, message: expect.stringMatching(/\S/) });
    await admin.openProject(scenarioId("stale-hold", "project", key));
    expect(await admin.projectStatus(), key).toBe("ON_HOLD");
  }
});
