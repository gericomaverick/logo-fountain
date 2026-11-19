// C-17 profile GET/PUT, K-11/C-18 invoice listings (shape only). Spec: brownfield/api-client.md,
// checkout-and-payments.md §8. Document resolution needs Stripe; without stripe-fake (story 0.5) every
// Stripe call fails and the resolver degrades to documentType "none" — these tests accept any documented
// documentType and assert the fields that do not depend on Stripe.
import { expect, test } from "../../fixtures";
import {
  ADMIN, CLIENT_A, CLIENT_B, ISO, UUID, anonymous, as, expectError, expectJson, expectKeys, projectId, useScenario,
} from "./_client-helpers";

const PROFILE_KEYS = ["id", "email", "firstName", "lastName", "fullName"];
const INVOICE_KEYS = [
  "id", "projectId", "projectName", "amountCents", "currency", "status", "date", "invoiceId", "invoicePdfUrl",
  "hostedInvoiceUrl", "receiptUrl", "documentType", "downloadUrl",
];

test.describe("profile", () => {
  useScenario("concepts-ready");

  test("C-17 GET /api/profile returns {profile:{id,email,firstName,lastName,fullName}} @api @client @settings", async () => {
    const body = await expectJson(await (await as(CLIENT_A)).get("/api/profile"));
    expectKeys(body, ["profile"]);
    expectKeys(body.profile, PROFILE_KEYS);
    expect(body.profile).toMatchObject({ email: CLIENT_A, firstName: "Ada", lastName: "Client", fullName: "Ada Client" });
    expect(body.profile.id).toMatch(UUID);
  });

  test("C-17 PUT /api/profile trims, truncates to 80, maps empty to null and recomputes fullName @api @client @settings", async () => {
    const a = await as(CLIENT_A);
    let res = await expectJson(await a.put("/api/profile", { data: { firstName: "  Grace  " } }));
    expectKeys(res, ["profile"]);
    expectKeys(res.profile, PROFILE_KEYS);
    expect(res.profile).toMatchObject({ firstName: "Grace", lastName: "Client", fullName: "Grace Client" });

    res = await expectJson(await a.put("/api/profile", { data: { lastName: null } }));
    expect(res.profile).toMatchObject({ firstName: "Grace", lastName: null, fullName: "Grace" });

    res = await expectJson(await a.put("/api/profile", { data: { firstName: "   ", lastName: "y".repeat(90) } }));
    expect(res.profile).toMatchObject({ firstName: null, lastName: "y".repeat(80), fullName: "y".repeat(80) });

    // No VAT field exists (F-3): unknown keys are ignored.
    res = await expectJson(await a.put("/api/profile", { data: { vatNumber: "GB123456789" } }));
    expectKeys(res.profile, PROFILE_KEYS);

    expect((await expectJson(await a.get("/api/profile"))).profile).toEqual(res.profile);
  });

  test("C-17 PUT /api/profile rejects non-string names and bad JSON @api @client @settings", async () => {
    const a = await as(CLIENT_A);
    await expectError(await a.put("/api/profile", { data: { firstName: 5 } }), 400, "INVALID_FIRST_NAME");
    await expectError(await a.put("/api/profile", { data: { lastName: true } }), 400, "INVALID_LAST_NAME");
    await expectError(await a.put("/api/profile", { data: { firstName: "Ok", lastName: ["x"] } }), 400, "INVALID_LAST_NAME");
    await expectError(await a.put("/api/profile", { data: Buffer.from("{oops"), headers: { "content-type": "application/json" } }), 400, "INVALID_JSON");
    expect((await expectJson(await a.get("/api/profile"))).profile).toMatchObject({ firstName: "Ada", lastName: "Client" });
  });

  test("C-17 /api/profile requires a session (401 UNAUTHORIZED) @api @client @settings @authz", async () => {
    const anon = await anonymous();
    await expectError(await anon.get("/api/profile"), 401, "UNAUTHORIZED");
    await expectError(await anon.put("/api/profile", { data: { firstName: "X" } }), 401, "UNAUTHORIZED");
  });
});

function expectInvoiceShape(inv: any, extra: string[] = []) {
  expectKeys(inv, [...INVOICE_KEYS, ...extra]);
  expect(inv.id).toMatch(UUID);
  expect(inv.date).toMatch(ISO);
  expect(["invoice", "receipt", "none"]).toContain(inv.documentType);
  for (const k of ["invoiceId", "invoicePdfUrl", "hostedInvoiceUrl", "receiptUrl"]) expect(inv[k] === null || typeof inv[k] === "string").toBe(true);
  expect(inv.downloadUrl).toBe(inv.invoicePdfUrl ?? inv.hostedInvoiceUrl ?? inv.receiptUrl);
  if (inv.documentType === "none") expect(inv.downloadUrl).toBeNull();
}

test.describe("invoices (two-tenants)", () => {
  useScenario("two-tenants");
  const pA = projectId("two-tenants", "pA");

  test("K-11/C-18 GET /api/invoices lists the caller's orders with the documented item shape @api @client @invoices", async () => {
    const body = await expectJson(await (await as(CLIENT_A)).get("/api/invoices"));
    expectKeys(body, ["invoices"]);
    expect(body.invoices).toHaveLength(1);
    const [inv] = body.invoices;
    expectInvoiceShape(inv);
    expect(inv).toMatchObject({ projectId: pA, projectName: "Northvale Coffee", amountCents: 79500, status: "Paid" });
    expect(typeof inv.currency).toBe("string");

    const b = await expectJson(await (await as(CLIENT_B)).get("/api/invoices"));
    expect(b.invoices.map((i: any) => [i.projectId, i.projectName])).toEqual([[projectId("two-tenants", "pB"), "Harbour Physio"]]);
  });

  test("K-11/C-18 GET /api/projects/{id}/invoices adds documentLabel and is member-only @api @client @invoices @authz", async () => {
    const path = `/api/projects/${pA}/invoices`;
    const body = await expectJson(await (await as(CLIENT_A)).get(path));
    expect(body.invoices).toHaveLength(1);
    const [inv] = body.invoices;
    expectInvoiceShape(inv, ["documentLabel"]);
    expect(inv.documentLabel).toBe(inv.documentType === "receipt" ? "Payment receipt (paid-safe)" : "Invoice");
    expect(inv).toMatchObject({ projectId: pA, amountCents: 79500, status: "Paid" });

    await expectError(await (await anonymous()).get(path), 401, "UNAUTHORIZED");
    await expectError(await (await as(CLIENT_B)).get(path), 404, "PROJECT_NOT_FOUND");
    await expectError(await (await as(ADMIN)).get(path), 404, "PROJECT_NOT_FOUND");
    await expectError(await (await anonymous()).get("/api/invoices"), 401, "UNAUTHORIZED");
  });

  // Needs stripe-fake fixtures (story 0.5): a FULFILLED order resolves the charge receipt first
  // (documentType "receipt", downloadUrl = receiptUrl), per checkout-and-payments.md §8.
  test.fixme("K-11/C-18 a settled order resolves its Stripe receipt as the download @api @client @invoices", async () => {
    const [inv] = (await expectJson(await (await as(CLIENT_A)).get("/api/invoices"))).invoices;
    expect(inv.documentType).toBe("receipt");
    expect(inv.downloadUrl).toBe(inv.receiptUrl);
  });
});

test.describe("invoices (awaiting-brief)", () => {
  useScenario("awaiting-brief");
  test("K-11/C-18 without a brief the invoice is titled Your logo project @api @client @invoices", async () => {
    const [inv] = (await expectJson(await (await as(CLIENT_A)).get("/api/invoices"))).invoices;
    expect(inv.projectName).toBe("Your logo project");
  });
});
