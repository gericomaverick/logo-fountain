#!/usr/bin/env node
// stripe-fake compatibility selftest (story 0.2). Uses the REAL Stripe Node SDK, at the version
// apps/web resolves (20.4.0) and the same apiVersion, pointed at the fake with host/port/protocol.
// Every call below mirrors a call site in apps/web/src (file named in each check).
// A local receiver gets the fake's webhooks and verifies them with stripe.webhooks.constructEvent.
import { createServer } from "node:http";
import Stripe from "stripe";
import { infra } from "./lib/env.mjs";

const { host, port, url: fakeUrl, secretKey, webhookSecret } = infra.stripe;
const stripe = new Stripe(secretKey, { apiVersion: "2026-02-25.clover", host, port, protocol: "http", maxNetworkRetries: 0 });
const PRICES = { essential: "price_1ToTEhFM0K9Qd7oXM0WRTWjd", professional: "price_1ToTFQFM0K9Qd7oXmHYwoZAT", complete: "price_1ToTGBFM0K9Qd7oX2D5r9Z6i", extra_revision: "price_1ToTbLFM0K9Qd7oXscIEu2Bt" };

const results = [];
async function check(name, fn) {
  try { const detail = await fn(); results.push(true); console.log(`PASS  ${name}${detail ? `  (${detail})` : ""}`); }
  catch (error) { results.push(false); console.log(`FAIL  ${name}  (${error.message})`); }
}
const assert = (cond, msg) => { if (!cond) throw new Error(msg); };
const admin = (path, body) => fetch(`${fakeUrl}${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body ?? {}) }).then((r) => r.json());

// ---- webhook receiver (the fake runs in Docker, so it reaches us via host.docker.internal) ----
const received = [];
const receiver = createServer((req, res) => {
  const chunks = [];
  req.on("data", (c) => chunks.push(c));
  req.on("end", () => {
    const raw = Buffer.concat(chunks).toString("utf8");
    let event = null, error = null;
    try { event = stripe.webhooks.constructEvent(raw, req.headers["stripe-signature"], webhookSecret); } catch (e) { error = e.message; }
    received.push({ event, error });
    res.writeHead(error ? 400 : 200, { "content-type": "application/json" });
    res.end(JSON.stringify(error ? { error } : { received: true }));
  });
});
await new Promise((r) => receiver.listen(0, "0.0.0.0", r));
const hookHost = process.env.PARITY_WEBHOOK_HOST || "host.docker.internal";
const { webhookUrl: previousTarget } = await admin("/__config", {});
await admin("/__config", { webhookUrl: `http://${hookHost}:${receiver.address().port}/api/stripe/webhook` });

const pay = (id, outcome) => fetch(`${fakeUrl}/pay/${id}/complete`, { method: "POST", headers: { accept: "application/json", "content-type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({ outcome, email: "Selftest.Buyer@Example.test", first_name: "Self", last_name: "Test" }) }).then((r) => r.json());

try {
  await admin("/__fixtures/load", { reset: true, names: ["package-essential-paid", "package-professional-paid", "package-complete-paid"] });
  let session;

  await check("checkout.sessions.create, package params (checkout/start/route.ts)", async () => {
    session = await stripe.checkout.sessions.create({
      mode: "payment", customer_creation: "always", billing_address_collection: "auto", phone_number_collection: { enabled: false },
      success_url: "http://127.0.0.1:4310/checkout/success?session_id={CHECKOUT_SESSION_ID}", cancel_url: "http://127.0.0.1:4310/#packages",
      line_items: [{ price: PRICES.professional, quantity: 1 }], invoice_creation: { enabled: true },
      custom_fields: [
        { key: "first_name", label: { type: "custom", custom: "First name" }, type: "text", text: { minimum_length: 1, maximum_length: 80 }, optional: false },
        { key: "last_name", label: { type: "custom", custom: "Last name" }, type: "text", text: { minimum_length: 1, maximum_length: 80 }, optional: false },
      ],
      metadata: { package_code: "professional", campaign_slug: "spring" },
    });
    assert(session.id.startsWith("cs_test_") && session.url === `${fakeUrl}/pay/${session.id}`, `url ${session.url}`);
    assert(session.amount_total === 79500 && session.payment_status === "unpaid" && session.status === "open", "amounts/status");
    assert(session.custom_fields[0].text.maximum_length === 80 && session.custom_fields[0].optional === false, "custom_fields decoded");
    assert(session.invoice_creation.enabled === true && session.phone_number_collection.enabled === false, "booleans decoded");
    assert(session.metadata.campaign_slug === "spring", "metadata");
    return session.id;
  });

  await check("checkout.sessions.create, upsell params (api/projects/[id]/checkout/session/route.ts)", async () => {
    const s = await stripe.checkout.sessions.create({ mode: "payment", customer_creation: "always",
      success_url: "http://127.0.0.1:4310/project/p1?upsell=1&kind=addon&session_id={CHECKOUT_SESSION_ID}", cancel_url: "http://127.0.0.1:4310/project/p1",
      line_items: [{ price: PRICES.extra_revision, quantity: 1 }], metadata: { kind: "addon", projectId: "p1", addonKey: "extra_revision", fromPackage: "essential" } });
    assert(s.invoice_creation.enabled === false && s.metadata.kind === "addon" && s.amount_total === 9500, JSON.stringify(s.invoice_creation));
  });

  await check("unknown price is a Stripe invalid_request_error", async () => {
    try { await stripe.checkout.sessions.create({ mode: "payment", success_url: "http://x/", line_items: [{ price: "price_nope", quantity: 1 }] }); }
    catch (e) { assert(e instanceof Stripe.errors.StripeInvalidRequestError && e.statusCode === 400 && e.code === "resource_missing", `${e.type} ${e.statusCode}`); return e.message; }
    throw new Error("no error");
  });

  await check("checkout.sessions.retrieve", async () => {
    const s = await stripe.checkout.sessions.retrieve(session.id);
    assert(s.id === session.id && s.object === "checkout.session", "id");
  });

  await check("checkout.sessions.listLineItems(limit 10) (lib/checkout-fulfillment.ts)", async () => {
    const items = await stripe.checkout.sessions.listLineItems(session.id, { limit: 10 });
    assert(items.object === "list" && items.data.length === 1 && items.data[0].price.id === PRICES.professional, JSON.stringify(items.data.map((i) => i.price?.id)));
    return items.data[0].price.id;
  });

  await check("hosted page renders with Pay and Fail buttons", async () => {
    const html = await (await fetch(session.url)).text();
    assert(html.includes('value="pay"') && html.includes('value="fail"'), "buttons missing");
  });

  await check("Pay -> session paid + signed checkout.session.completed verified by constructEvent", async () => {
    const before = received.length;
    const out = await pay(session.id, "pay");
    assert(out.webhooks.length === 1 && out.webhooks[0].status === 200, `delivery ${JSON.stringify(out.webhooks)}`);
    const got = received.slice(before);
    assert(got.length === 1 && !got[0].error, got[0]?.error ?? "no webhook");
    const ev = got[0].event;
    assert(ev.type === "checkout.session.completed" && ev.data.object.id === session.id && ev.data.object.payment_status === "paid", ev.type);
    const obj = ev.data.object;
    assert(obj.custom_fields.find((f) => f.key === "first_name").text.value === "Self" && typeof obj.customer === "string" && typeof obj.payment_intent === "string", "payload fields");
    return `${ev.id}, email ${obj.customer_details.email}`;
  });

  await check("retrieve expand [invoice, payment_intent.latest_charge] (lib/client-invoices.ts)", async () => {
    const s = await stripe.checkout.sessions.retrieve(session.id, { expand: ["invoice", "payment_intent.latest_charge"] });
    assert(typeof s.invoice === "object" && s.invoice.status === "paid" && s.invoice.invoice_pdf, "invoice not expanded");
    const charge = s.payment_intent.latest_charge;
    assert(typeof charge === "object" && charge.receipt_url && charge.status === "succeeded", "latest_charge not expanded");
    return `receipt ${charge.receipt_url}`;
  });

  await check("retrieve expand [customer] (api/admin/checkout/reprocess/route.ts)", async () => {
    const s = await stripe.checkout.sessions.retrieve(session.id, { expand: ["customer"] });
    assert(typeof s.customer === "object" && s.customer.email === "Selftest.Buyer@Example.test", "customer not expanded");
  });

  await check("customers.retrieve / invoices.retrieve / paymentIntents.retrieve(expand latest_charge)", async () => {
    const s = await stripe.checkout.sessions.retrieve(session.id);
    const cus = await stripe.customers.retrieve(s.customer);
    const inv = await stripe.invoices.retrieve(s.invoice);
    const pi = await stripe.paymentIntents.retrieve(s.payment_intent, { expand: ["latest_charge"] });
    assert(cus.object === "customer" && cus.email, "customer");
    assert(inv.object === "invoice" && inv.amount_remaining === 0 && inv.status_transitions.paid_at, "invoice");
    assert(pi.status === "succeeded" && typeof pi.latest_charge === "object" && pi.latest_charge.receipt_url, "payment intent");
  });

  await check("accounts.retrieve() (api/admin/health/route.ts)", async () => {
    const acct = await stripe.accounts.retrieve();
    assert(acct.id === "acct_parity_fake", acct.id);
    return acct.id;
  });

  await check("Fail -> unpaid session; completed(unpaid) then async_payment_failed, both signed", async () => {
    const s = await stripe.checkout.sessions.create({ mode: "payment", success_url: "http://127.0.0.1:4310/checkout/success?session_id={CHECKOUT_SESSION_ID}", line_items: [{ price: PRICES.essential, quantity: 1 }] });
    const before = received.length;
    await pay(s.id, "fail");
    const got = received.slice(before);
    assert(got.length === 2 && got.every((g) => !g.error), JSON.stringify(got.map((g) => g.error)));
    assert(got[0].event.type === "checkout.session.completed" && got[0].event.data.object.payment_status === "unpaid", got[0].event.type);
    assert(got[1].event.type === "checkout.session.async_payment_failed", got[1].event.type);
    const fresh = await stripe.checkout.sessions.retrieve(s.id);
    assert(fresh.payment_status === "unpaid" && fresh.status === "complete", fresh.payment_status);

    const later = await admin(`/__webhook/${s.id}`, { type: "checkout.session.async_payment_succeeded", markPaid: true });
    const ev = received.at(-1).event;
    assert(later.status === 200 && ev.type === "checkout.session.async_payment_succeeded" && ev.data.object.payment_status === "paid", "async success");
  });

  await check("POST /__webhook/:id with badSignature is rejected by constructEvent", async () => {
    const out = await admin(`/__webhook/cs_test_parity_essential_paid`, { badSignature: true });
    const last = received.at(-1);
    assert(out.status === 400 && last.error && /signature/i.test(last.error), last.error ?? "accepted");
    return last.error.slice(0, 60);
  });

  await check("seeded fixtures: one paid session per tier, line items map to the tier price", async () => {
    for (const tier of ["essential", "professional", "complete"]) {
      const s = await stripe.checkout.sessions.retrieve(`cs_test_parity_${tier}_paid`, { expand: ["invoice", "payment_intent.latest_charge"] });
      const items = await stripe.checkout.sessions.listLineItems(s.id, { limit: 10 });
      assert(s.payment_status === "paid" && s.metadata.package_code === tier && items.data[0].price.id === PRICES[tier], tier);
      assert(s.invoice.status === "paid" && s.payment_intent.latest_charge.receipt_url, `${tier} documents`);
    }
  });

  await check("missing object -> resource_missing 404; bad API key -> authentication error", async () => {
    try { await stripe.checkout.sessions.retrieve("cs_test_missing"); throw new Error("no error"); }
    catch (e) { assert(e.statusCode === 404 && e.code === "resource_missing", `${e.statusCode} ${e.code}`); }
    const bad = new Stripe("sk_live_not_allowed", { apiVersion: "2026-02-25.clover", host, port, protocol: "http", maxNetworkRetries: 0 });
    try { await bad.accounts.retrieve(); throw new Error("no error"); }
    catch (e) { assert(e instanceof Stripe.errors.StripeAuthenticationError, e.type); }
  });
} finally {
  await admin("/__config", { webhookUrl: previousTarget });
  await admin("/__reset");
  receiver.close();
}

const passed = results.filter(Boolean).length;
console.log(`\nstripe-fake selftest: ${passed}/${results.length} passed (stripe ${Stripe.PACKAGE_VERSION ?? "node"} -> ${fakeUrl})`);
if (passed !== results.length) process.exit(1);
