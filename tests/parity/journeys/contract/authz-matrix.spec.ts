// L6 authorisation matrix (story 0.7d, test strategy §2): every endpoint in _authz-table.ts × actor
// {anonymous, client A, client B (other tenant), admin} -> expected status (and error.code where the
// table gives one). One generated test per cell; each reseeds two-tenants, so mutating cells don't leak.
// Mutations carry the canonical Origin (adapters/api.ts), so auth and the domain rules answer.
// The two DV-14 cells (an admin posting a concept comment or a project message) are @deviation tests below.
import { expect, test } from "../../fixtures";
import { ACTORS, ACTOR_EMAIL, ENDPOINTS, cA1, errorCode, label, pA, requestOptions, resolvePath, type Actor } from "./_authz-table";
import { ADMIN, anonymous, as, expectJson, useScenario } from "./_client-helpers";

useScenario("two-tenants");

const login = (actor: Actor) => (actor === "anonymous" ? anonymous() : as(ACTOR_EMAIL[actor]));

for (const endpoint of ENDPOINTS) {
  for (const actor of ACTORS) {
    const cell = endpoint.expect[actor];
    if (cell === "DV-14") continue;
    const [status, code] = Array.isArray(cell) ? cell : [cell, undefined];
    test(`C-20/D-20/A-16 L6 ${label(endpoint)} as ${actor} -> ${status}${code ? ` ${code}` : ""} @api @authz`, async () => {
      const ctx = await login(actor);
      const res = await ctx.fetch(resolvePath(endpoint.path), requestOptions(endpoint));
      const text = await res.text();
      expect(res.status(), `${label(endpoint)} as ${actor}: ${text.slice(0, 300)}`).toBe(status);
      if (code) expect(errorCode(JSON.parse(text)), text.slice(0, 300)).toBe(code);
    });
  }
}

test("C-20/D-20/A-16 L6 the endpoint table has 56 unique method endpoints (49 route files) @api @authz", async () => {
  const labels = ENDPOINTS.map(label);
  expect(new Set(labels).size).toBe(labels.length);
  expect(labels).toHaveLength(56);
});

// ---- DV-14 (F-17): admin replies. Next answers 500 (the isAdmin profile upsert hits the DB trigger).
test("DV-14/C-10 an admin's concept comment is 201 with author.isAdmin true @deviation @api @authz @concepts", async () => {
  const admin = await as(ADMIN);
  const body = await expectJson(await admin.post(`/api/projects/${pA}/concepts/${cA1}/comments`, { data: { body: "Designer reply" } }), 201);
  expect(body).toEqual({ ok: true, comment: expect.objectContaining({ body: "Designer reply", author: expect.objectContaining({ email: ADMIN, isAdmin: true }) }) });
  const { comments } = await expectJson(await (await as(ACTOR_EMAIL.clientA)).get(`/api/projects/${pA}/concepts/${cA1}/comments`));
  expect(comments.map((c: { body: string }) => c.body)).toContain("Designer reply");
});

test("DV-14/C-14/D-17 an admin's project message is 201 with sender.isAdmin true @deviation @api @authz @messages", async () => {
  const admin = await as(ADMIN);
  const body = await expectJson(await admin.post(`/api/projects/${pA}/messages`, { data: { body: "Designer message" } }), 201);
  expect(body).toEqual({ ok: true, message: expect.objectContaining({ body: "Designer message", sender: expect.objectContaining({ email: ADMIN, isAdmin: true }) }) });
  const { messages } = await expectJson(await (await as(ACTOR_EMAIL.clientA)).get(`/api/projects/${pA}/messages`));
  expect(messages.map((m: { body: string }) => m.body)).toContain("Designer message");
});
