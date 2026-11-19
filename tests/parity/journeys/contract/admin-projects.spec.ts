// Read-only admin endpoints: projects list, snapshot, audit, revision requests, invoices
// (brownfield/api-admin.md "Projects and dashboard"; checkout-and-payments.md §8).
import { UNKNOWN_ID, api, expect, expectError, expectOk, test } from "./_admin-helpers";

test.describe.configure({ mode: "default" });

test("D-01 projects list returns every project with its latest order and stuck flags @admin @api", async ({ scenario }) => {
  const s = await scenario("two-tenants");
  const { projects } = await expectOk(await s.admin.get("/api/admin/projects"));
  expect(projects.map((p: any) => p.id).sort()).toEqual([s.projectId("pA"), s.projectId("pB")].sort());
  const a = projects.find((p: any) => p.id === s.projectId("pA"));
  expect(a).toEqual({
    id: s.projectId("pA"),
    status: "CONCEPTS_READY",
    packageCode: "professional",
    clientName: "Ada Client",
    latestOrder: { id: expect.any(String), status: "FULFILLED", stripeCheckoutSessionId: "cs_test_parity_pA_clientA", createdAt: expect.any(String) },
    stuck: false,
    stuckReason: null,
  });
  expect(Number.isNaN(Date.parse(a.latestOrder.createdAt))).toBe(false);
});

test("D-01 projects list filters by exact status @admin @api", async ({ scenario }) => {
  const s = await scenario("two-tenants");
  const ready = await expectOk(await s.admin.get("/api/admin/projects?status=CONCEPTS_READY"));
  expect(ready.projects).toHaveLength(2);
  const none = await expectOk(await s.admin.get("/api/admin/projects?status=ON_HOLD"));
  expect(none.projects).toEqual([]);
  const partial = await expectOk(await s.admin.get("/api/admin/projects?status=CONCEPTS"));
  expect(partial.projects).toEqual([]);
});

test("D-01 projects list is empty when there are no projects @admin @api", async ({ scenario }) => {
  const s = await scenario("admin-only");
  expect(await expectOk(await s.admin.get("/api/admin/projects"))).toEqual({ projects: [] });
});

test("D-02 project snapshot returns the snapshot for any project, 404 PROJECT_NOT_FOUND otherwise @admin @api", async ({ scenario }) => {
  const s = await scenario("concepts-ready");
  const { snapshot } = await expectOk(await s.admin.get(api(s.projectId())));
  expect(snapshot).toMatchObject({ projectId: s.projectId(), status: "CONCEPTS_READY", packageCode: "professional" });
  expect(snapshot.concepts.map((c: any) => c.number).sort()).toEqual([1, 2]);
  expect(snapshot.entitlementUsage.concepts).toMatchObject({ limit: 2, consumed: 2, reserved: 0 });
  await expectError(await s.admin.get(api(UNKNOWN_ID)), 404, "PROJECT_NOT_FOUND");
});

test("D-16 audit returns events newest first with raw payloads and the actor @admin @api @audit", async ({ scenario }) => {
  const s = await scenario("on-hold");
  const { events } = await expectOk(await s.admin.get(api(s.projectId(), "/audit")));
  const states = events.filter((e: any) => e.type === "state_changed");
  expect(states.map((e: any) => e.payload.nextStatus)).toEqual(["ON_HOLD", "CONCEPTS_READY", "BRIEF_SUBMITTED", "AWAITING_BRIEF"]);
  expect(states[0]).toEqual({
    id: expect.any(String),
    type: "state_changed",
    payload: expect.objectContaining({ previousStatus: "CONCEPTS_READY", nextStatus: "ON_HOLD", reason: "Waiting for the client's trademark check." }),
    createdAt: expect.any(String),
    actor: { email: "admin@parity.test", fullName: "Dana Designer" },
  });
  // The first event of the seeded history has no actor.
  expect(states.at(-1).actor).toBeNull();
  const times = events.map((e: any) => Date.parse(e.createdAt));
  expect([...times].sort((x, y) => y - x)).toEqual(times);
  // Unknown project: an empty list, not a 404.
  expect(await expectOk(await s.admin.get(api(UNKNOWN_ID, "/audit")))).toEqual({ events: [] });
});

test("D-08 revision-requests list returns every request with concept and requester @admin @api @revisions", async ({ scenario }) => {
  const s = await scenario("revision-reserved");
  const { revisionRequests } = await expectOk(await s.admin.get(api(s.projectId(), "/revision-requests")));
  expect(revisionRequests).toEqual([
    {
      id: s.revisionId(),
      status: "requested",
      body: "Could the icon be a little bolder?",
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
      concept: { id: s.conceptId(1), number: 1 },
      user: { id: expect.any(String), email: "client.a@parity.test", fullName: "Ada Client" },
    },
  ]);
  expect(await expectOk(await s.admin.get(api(UNKNOWN_ID, "/revision-requests")))).toEqual({ revisionRequests: [] });
});

test("D-19/K-11 admin invoices list the project's orders with the document fields @admin @api @invoices", async ({ scenario }) => {
  const s = await scenario("concepts-ready");
  const { invoices } = await expectOk(await s.admin.get(api(s.projectId(), "/invoices")));
  expect(invoices).toHaveLength(1);
  const [inv] = invoices;
  expect(inv).toMatchObject({
    projectId: s.projectId(),
    projectName: expect.stringContaining("Northvale Coffee"),
    amountCents: 79500,
    currency: "gbp",
    status: "Paid",
  });
  expect(Object.keys(inv).sort()).toEqual(
    ["amountCents", "currency", "date", "documentType", "downloadUrl", "hostedInvoiceUrl", "id", "invoiceId", "invoicePdfUrl", "projectId", "projectName", "receiptUrl", "status"].sort(),
  );
  expect(["invoice", "receipt", "none"]).toContain(inv.documentType);
  expect(inv.downloadUrl).toBe(inv.invoicePdfUrl ?? inv.hostedInvoiceUrl ?? inv.receiptUrl);
  expect(await expectOk(await s.admin.get(api(UNKNOWN_ID, "/invoices")))).toEqual({ invoices: [] });
});
