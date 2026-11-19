// D-04 admin brief view and X-16 system-message de-duplication (story 0.9 coverage gaps).
import { api, expect, expectOk, uploadConcept, test, CLIENT_A } from "./_admin-helpers";

test("D-04 the admin brief page shows the submitted brief to an admin only @admin @api @brief", async ({ scenario, client }) => {
  const s = await scenario("brief-submitted");
  const path = `/admin/projects/${s.projectId()}/brief`;
  const asAdmin = await s.admin.get(path);
  expect(asAdmin.status()).toBe(200);
  const html = await asAdmin.text();
  for (const answer of ["Northvale Coffee", "Coffee roastery", "Independent cafe owners in the North West."]) expect(html).toContain(answer);

  const anonymous = await (await client()).get(path, { maxRedirects: 0 });
  expect([302, 303, 307, 308]).toContain(anonymous.status());
  expect(anonymous.headers()["location"] ?? "").toMatch(/\/login/);

  const asClient = await (await client(CLIENT_A)).get(path, { maxRedirects: 0 });
  expect(asClient.status()).not.toBe(200);
});

test("X-16 a system message with the same body is never posted twice in a project thread @admin @api @messages", async ({ scenario }) => {
  const s = await scenario("concepts-ready");
  const p = s.projectId();
  const countReady = async () =>
    ((await expectOk(await s.admin.get(`/api/projects/${p}/messages`))).messages as Array<{ kind: string; body: string }>)
      .filter((m) => m.kind === "system" && m.body === "Concept 1 is ready for review.").length;
  expect(await countReady()).toBe(1);
  // A clean-slate reset keeps system messages and lets concept numbering restart at 1.
  await expectOk(await s.admin.post(api(p, "/reset"), { data: { confirm: true, mode: "clean-slate" } }));
  const uploaded = await expectOk(await uploadConcept(s.admin, p, {}));
  expect(uploaded.concept.number).toBe(1);
  expect(await countReady()).toBe(1);
});
