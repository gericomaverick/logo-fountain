// C-14 project messages, C-15 read-state (messages area). Spec: brownfield/api-client.md.
// Notification emails (N-06/N-11) are asserted by the UI journeys with Mailpit (story 0.8c).
import { expect, test } from "../../fixtures";
import { ADMIN, CLIENT_A, ISO, UUID, as, expectError, expectJson, expectKeys, projectId, snapshotOf, useScenario } from "./_client-helpers";

const SENDER_KEYS = ["id", "email", "isAdmin", "fullName", "firstName", "lastName"];

test.describe("concepts-ready", () => {
  useScenario("concepts-ready");
  const id = projectId("concepts-ready");
  const path = `/api/projects/${id}/messages`;

  test("C-14 GET messages lists every message, system ones included, oldest first @api @client @messages", async () => {
    for (const who of [CLIENT_A, ADMIN]) {
      const body = await expectJson(await (await as(who)).get(path));
      expectKeys(body, ["messages"]);
      expect(body.messages.map((m: any) => [m.kind, m.body])).toEqual([
        ["system", "Brief received. Your designer will review and reply soon."],
        ["system", "Concept 1 is ready for review."],
        ["user", "Hi Ada, your first concepts are ready."],
      ]);
      for (const m of body.messages) {
        expectKeys(m, ["id", "kind", "body", "createdAt", "sender"]);
        expect(m.id).toMatch(UUID);
        expect(m.createdAt).toMatch(ISO);
        expectKeys(m.sender, SENDER_KEYS);
        expect(m.sender).toMatchObject({ email: ADMIN, isAdmin: true, firstName: "Dana", lastName: "Designer", fullName: "Dana Designer" });
      }
      const times = body.messages.map((m: any) => m.createdAt);
      expect([...times].sort()).toEqual(times);
    }
  });

  test("C-14 POST messages trims the body, returns 201 {ok, message} and appends it @api @client @messages", async () => {
    const a = await as(CLIENT_A);
    const res = await expectJson(await a.post(path, { data: { body: "  Thanks, looks great  " } }), 201);
    expectKeys(res, ["ok", "message"]);
    expect(res.ok).toBe(true);
    expectKeys(res.message, ["id", "kind", "body", "createdAt", "sender"]);
    expect(res.message).toMatchObject({ kind: "user", body: "Thanks, looks great", sender: { email: CLIENT_A, isAdmin: false } });
    expectKeys(res.message.sender, SENDER_KEYS);

    const { messages } = await expectJson(await a.get(path));
    expect(messages).toHaveLength(4);
    expect(messages.at(-1).id).toBe(res.message.id);
    const s = await snapshotOf(a, id);
    expect(s.messages.at(-1)).toMatchObject({ id: res.message.id, kind: "user", sender: { email: CLIENT_A } });
    expect(s.latestMessageAt).toBe(res.message.createdAt);
  });

  test("C-14 message bodies must be 1-2000 characters after trimming (400 INVALID_MESSAGE_BODY) @api @client @messages", async () => {
    const a = await as(CLIENT_A);
    for (const data of [{}, { body: "" }, { body: " \n " }, { body: ["x"] }, { body: "x".repeat(2001) }]) {
      await expectError(await a.post(path, { data }), 400, "INVALID_MESSAGE_BODY");
    }
    await expectError(await a.post(path, { data: Buffer.from("nope"), headers: { "content-type": "application/json" } }), 400, "INVALID_MESSAGE_BODY");
    const max = await expectJson(await a.post(path, { data: { body: "x".repeat(2000) } }), 201);
    expect(max.message.body).toHaveLength(2000);
  });

  test("C-15 POST read-state {area:messages} stamps the latest non-system message time and clears hasNewMessages @api @client @messages", async () => {
    const a = await as(CLIENT_A);
    const before = await snapshotOf(a, id);
    expect(before.hasNewMessages).toBe(true);
    expect(await expectJson(await a.post(`/api/projects/${id}/read-state`, { data: { area: "messages" } }))).toEqual({ ok: true });
    const after = await snapshotOf(a, id);
    expect(after.hasNewMessages).toBe(false);
    // A DB timestamp (the latest non-system message), not the server clock.
    expect(after.readState.lastSeenMessagesAt).toBe(before.latestMessageAt);
    expect(after.hasNewConcepts).toBe(true);
    // Read state is per user: the admin's view is untouched.
    expect((await snapshotOf(await as(ADMIN), id)).readState).toEqual({});
  });
});

test.describe("awaiting-brief", () => {
  useScenario("awaiting-brief");
  const id = projectId("awaiting-brief");

  test("C-14 the first message creates the thread lazily @api @client @messages", async () => {
    const a = await as(CLIENT_A);
    expect(await expectJson(await a.get(`/api/projects/${id}/messages`))).toEqual({ messages: [] });
    const res = await expectJson(await a.post(`/api/projects/${id}/messages`, { data: { body: "Hello" } }), 201);
    const { messages } = await expectJson(await a.get(`/api/projects/${id}/messages`));
    expect(messages.map((m: any) => m.id)).toEqual([res.message.id]);
    expect((await snapshotOf(a, id)).hasNewMessages).toBe(true);
  });
});
