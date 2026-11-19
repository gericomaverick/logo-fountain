// stripe-fake (story 0.2): the Stripe REST endpoints Logo Fountain calls, in memory, no dependencies.
// Both apps point their Stripe SDK here in parity mode (Node: host/port/protocol; PHP: api_base).
//
// Stripe API (form-encoded like the real API, Bearer sk_test_* auth):
//   POST /v1/checkout/sessions                     create (returns url -> fake hosted page)
//   GET  /v1/checkout/sessions/:id                 retrieve (expand: customer, invoice, payment_intent[.latest_charge], line_items)
//   GET  /v1/checkout/sessions/:id/line_items      list line items
//   GET  /v1/customers/:id | /v1/invoices/:id | /v1/payment_intents/:id (expand latest_charge[.invoice])
//   GET  /v1/account | /v1/accounts/:id
// Fake hosted checkout:
//   GET  /pay/:id                  page with Pay / Fail buttons
//   POST /pay/:id/complete         outcome=pay|fail -> mark the session, send signed webhook(s), redirect to success_url
// Admin (tests):
//   POST /__fixtures/load          {"names": ["package-essential-paid"], "reset"?: true} or {"fixture": {...}}
//   POST /__webhook/:sessionId     {"type"?, "markPaid"?, "target"?, "badSignature"?} -> send a signed event now
//   POST /__config                 {"webhookUrl": "..."} -> change the default webhook target at runtime
//   POST /__reset                  empty state, then the startup fixtures again
//   GET  /__state | /__deliveries | /__health
import { createHmac, randomBytes } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { createServer } from "node:http";
import { join } from "node:path";

import { renderHostedPage } from "./hosted-page.mjs";

const PORT = Number(process.env.PORT || 12111);
const FIXTURES_DIR = process.env.FIXTURES_DIR || new URL("../../fixtures/stripe", import.meta.url).pathname;
const PUBLIC_URL = (process.env.STRIPE_FAKE_PUBLIC_URL || `http://127.0.0.1:${PORT}`).replace(/\/$/, "");
let WEBHOOK_URL = process.env.STRIPE_FAKE_WEBHOOK_URL || "";
const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || "whsec_parity_test_only_0000000000000000";
const API_VERSION = "2026-02-25.clover";

// ---------- state ----------
const TYPES = { cs: "checkout_sessions", cus: "customers", pi: "payment_intents", ch: "charges", in: "invoices", price: "prices" };
let db;
let deliveries = [];
const idempotency = new Map();

function emptyState() {
  return { checkout_sessions: new Map(), customers: new Map(), payment_intents: new Map(), charges: new Map(), invoices: new Map(),
    prices: new Map(), line_items: new Map() };
}

const clone = (v) => structuredClone(v);
const now = () => Math.floor(Date.now() / 1000);
const rid = (prefix, len = 24) => `${prefix}_${randomBytes(len).toString("base64url").replace(/[-_]/g, "").slice(0, len)}`;
const tableFor = (id) => TYPES[String(id).split("_")[0]];

export function loadFixture(fixture) {
  for (const price of fixture.prices ?? []) db.prices.set(price.id, clone(price));
  for (const key of ["customers", "payment_intents", "charges", "invoices"]) {
    for (const obj of fixture[key] ?? []) db[key].set(obj.id, clone(obj));
  }
  for (const raw of fixture.checkout_sessions ?? []) {
    const { line_items: items = [], ...session } = clone(raw);
    db.checkout_sessions.set(session.id, normalizeSession(session));
    db.line_items.set(session.id, items.map((item) => lineItem(item.price, item.quantity ?? 1)));
  }
}

function fixtureFiles() {
  return readdirSync(FIXTURES_DIR).filter((f) => f.endsWith(".json")).sort();
}

function loadNamed(name) {
  const file = name.endsWith(".json") ? name : `${name}.json`;
  if (!fixtureFiles().includes(file)) throw new Error(`Unknown fixture "${name}" (have: ${fixtureFiles().join(", ")})`);
  loadFixture(JSON.parse(readFileSync(join(FIXTURES_DIR, file), "utf8")));
}

function reset() {
  db = emptyState();
  deliveries = [];
  idempotency.clear();
  loadNamed("prices"); // line items resolve against the catalogue, so it loads first
  for (const file of fixtureFiles()) if (file !== "prices.json") loadNamed(file);
}

// ---------- object builders ----------
function lineItem(priceId, quantity) {
  const price = db.prices.get(priceId);
  if (!price) throw stripeError(400, "invalid_request_error", `No such price: '${priceId}'`, "resource_missing", "line_items[0][price]");
  const amount = price.unit_amount * quantity;
  return { id: rid("li"), object: "item", amount_discount: 0, amount_subtotal: amount, amount_tax: 0, amount_total: amount,
    currency: price.currency, description: price.product_name ?? null, price: clone(price), quantity };
}

function normalizeSession(s) {
  return {
    object: "checkout.session", adaptive_pricing: null, after_expiration: null, allow_promotion_codes: null,
    automatic_tax: { enabled: false, liability: null, provider: null, status: null }, billing_address_collection: null,
    client_reference_id: null, client_secret: null, consent: null, consent_collection: null, created: now(), currency: "gbp",
    custom_fields: [], custom_text: { after_submit: null, shipping_address: null, submit: null, terms_of_service_acceptance: null },
    customer: null, customer_creation: null, customer_details: null, customer_email: null, expires_at: now() + 86400,
    invoice: null, invoice_creation: null, livemode: false, locale: null, metadata: {}, mode: "payment", payment_intent: null,
    payment_method_types: ["card"], payment_status: "unpaid", phone_number_collection: { enabled: false }, status: "open",
    total_details: { amount_discount: 0, amount_shipping: 0, amount_tax: 0 }, ui_mode: "hosted", url: null,
    ...s,
  };
}

const bool = (v) => v === true || v === "true";
const int = (v) => (v === undefined || v === null || v === "" ? null : Number(v));

function createSession(params) {
  if (!params.mode) throw stripeError(400, "invalid_request_error", "Missing required param: mode.", "parameter_missing", "mode");
  if (!params.success_url) throw stripeError(400, "invalid_request_error", "Missing required param: success_url.", "parameter_missing", "success_url");
  const requested = Array.isArray(params.line_items) ? params.line_items : [];
  if (!requested.length) throw stripeError(400, "invalid_request_error", "Missing required param: line_items.", "parameter_missing", "line_items");
  const items = requested.map((li) => lineItem(li.price, Number(li.quantity ?? 1)));
  const total = items.reduce((sum, li) => sum + li.amount_total, 0);
  const id = `cs_test_${randomBytes(30).toString("base64url").replace(/[-_]/g, "").slice(0, 58)}`;
  const session = normalizeSession({
    id, mode: params.mode, success_url: params.success_url, cancel_url: params.cancel_url ?? null,
    amount_subtotal: total, amount_total: total, currency: items[0].currency,
    billing_address_collection: params.billing_address_collection ?? null,
    customer_creation: params.customer_creation ?? "if_required", customer_email: params.customer_email ?? null,
    client_reference_id: params.client_reference_id ?? null,
    phone_number_collection: { enabled: bool(params.phone_number_collection?.enabled) },
    allow_promotion_codes: params.allow_promotion_codes === undefined ? null : bool(params.allow_promotion_codes),
    invoice_creation: params.mode === "payment" ? {
      enabled: bool(params.invoice_creation?.enabled),
      invoice_data: { account_tax_ids: null, custom_fields: null, description: null, footer: null, issuer: null, metadata: {}, rendering_options: null },
    } : null,
    custom_fields: (Array.isArray(params.custom_fields) ? params.custom_fields : []).map((f) => ({
      key: f.key, label: { custom: f.label?.custom ?? null, type: f.label?.type ?? "custom" }, optional: bool(f.optional), type: f.type,
      ...(f.type === "text" ? { text: { default_value: null, maximum_length: int(f.text?.maximum_length), minimum_length: int(f.text?.minimum_length), value: null } } : {}),
    })),
    metadata: params.metadata ?? {},
    url: `${PUBLIC_URL}/pay/${id}`,
  });
  db.checkout_sessions.set(id, session);
  db.line_items.set(id, items);
  return session;
}

/** Marks a session paid (or failed), creating customer, payment intent, charge and invoice like Checkout does. */
export function settleSession(id, { outcome, email, firstName, lastName }) {
  const s = db.checkout_sessions.get(id);
  const ts = now();
  const name = [firstName, lastName].filter(Boolean).join(" ") || null;
  if (!s.customer && (s.customer_creation === "always" || email)) {
    const cus = { id: rid("cus", 14), object: "customer", address: null, created: ts, description: null, email, livemode: false, metadata: {}, name, phone: null };
    db.customers.set(cus.id, cus);
    s.customer = cus.id;
  }
  s.customer_details = { address: null, email, name, phone: null, tax_exempt: "none", tax_ids: [] };
  for (const f of s.custom_fields) {
    if (f.type === "text") f.text.value = f.key === "first_name" ? firstName : f.key === "last_name" ? lastName : f.text.value;
  }
  const pi = { id: rid("pi"), object: "payment_intent", amount: s.amount_total, amount_received: 0, created: ts, currency: s.currency,
    customer: s.customer, latest_charge: null, livemode: false, metadata: {}, payment_method_types: ["card"], status: "requires_payment_method" };
  s.payment_intent = pi.id;
  s.status = "complete";
  if (outcome === "pay") {
    const charge = { id: rid("ch"), object: "charge", amount: s.amount_total, amount_captured: s.amount_total, amount_refunded: 0, captured: true,
      created: ts, currency: s.currency, customer: s.customer, livemode: false, metadata: {}, paid: true, payment_intent: pi.id,
      receipt_email: email, receipt_url: null, refunded: false, status: "succeeded" };
    charge.receipt_url = `${PUBLIC_URL}/receipts/${charge.id}`;
    db.charges.set(charge.id, charge);
    Object.assign(pi, { amount_received: s.amount_total, latest_charge: charge.id, status: "succeeded" });
    if (s.invoice_creation?.enabled) {
      const inv = { id: rid("in"), object: "invoice", amount_due: s.amount_total, amount_paid: s.amount_total, amount_remaining: 0,
        created: ts, currency: s.currency, customer: s.customer, customer_email: email, hosted_invoice_url: null, invoice_pdf: null,
        livemode: false, metadata: {}, number: `PARITY-${String(db.invoices.size + 1).padStart(4, "0")}`, status: "paid",
        status_transitions: { finalized_at: ts, marked_uncollectible_at: null, paid_at: ts, voided_at: null } };
      inv.hosted_invoice_url = `${PUBLIC_URL}/invoices/${inv.id}/hosted`;
      inv.invoice_pdf = `${PUBLIC_URL}/invoices/${inv.id}/pdf`;
      db.invoices.set(inv.id, inv);
      s.invoice = inv.id;
    }
    s.payment_status = "paid";
  } else {
    s.payment_status = "unpaid";
  }
  db.payment_intents.set(pi.id, pi);
  return s;
}

// ---------- expansion ----------
function expandObject(obj, paths, kind) {
  const out = clone(obj);
  for (const path of paths) {
    const [head, ...rest] = path.split(".");
    if (kind === "checkout.session" && head === "line_items") {
      out.line_items = listOf(db.line_items.get(out.id) ?? [], `/v1/checkout/sessions/${out.id}/line_items`);
      continue;
    }
    if (!(head in out)) throw stripeError(400, "invalid_request_error", `This property cannot be expanded (${head}).`, null, "expand");
    let value = out[head];
    if (typeof value === "string") {
      const table = tableFor(value);
      const found = table && db[table].get(value);
      if (!found) throw stripeError(404, "invalid_request_error", `No such object: '${value}'`, "resource_missing", "expand");
      value = clone(found);
    }
    if (value && typeof value === "object" && rest.length) value = expandObject(value, [rest.join(".")], value.object);
    out[head] = value;
  }
  return out;
}

const listOf = (data, url) => ({ object: "list", data: clone(data), has_more: false, url });

// ---------- webhooks ----------
export function signPayload(payload, secret = WEBHOOK_SECRET, timestamp = now()) {
  const v1 = createHmac("sha256", secret).update(`${timestamp}.${payload}`).digest("hex");
  return `t=${timestamp},v1=${v1}`;
}

async function sendEvent(sessionId, type, { target, badSignature } = {}) {
  const url = target || WEBHOOK_URL;
  const event = { id: rid("evt"), object: "event", api_version: API_VERSION, created: now(), data: { object: clone(db.checkout_sessions.get(sessionId)) },
    livemode: false, pending_webhooks: 1, request: { id: null, idempotency_key: null }, type };
  const payload = JSON.stringify(event, null, 2);
  const signature = signPayload(payload, badSignature ? "whsec_wrong_secret" : WEBHOOK_SECRET);
  const record = { eventId: event.id, type, sessionId, target: url, at: new Date().toISOString(), status: null, body: null, error: null };
  deliveries.push(record);
  if (!url) { record.error = "no webhook target (set STRIPE_FAKE_WEBHOOK_URL or pass target)"; return { ...record, event }; }
  try {
    const res = await fetch(url, { method: "POST", signal: AbortSignal.timeout(30000),
      headers: { "content-type": "application/json; charset=utf-8", "stripe-signature": signature, "user-agent": "Stripe/1.0 (+https://stripe.com/docs/webhooks)" },
      body: payload });
    record.status = res.status;
    record.body = (await res.text()).slice(0, 2000);
  } catch (error) {
    record.error = error.message;
  }
  return { ...record, event };
}

// ---------- HTTP ----------
class StripeHttpError extends Error {
  constructor(status, body) { super(body.error.message); this.status = status; this.body = body; }
}
function stripeError(status, type, message, code, param) {
  return new StripeHttpError(status, { error: { type, message, ...(code ? { code } : {}), ...(param ? { param } : {}) } });
}
const missing = (kind, id) => stripeError(404, "invalid_request_error", `No such ${kind}: '${id}'`, "resource_missing", "id");

/** Stripe-style form/query decoding: a[b][0][c]=x -> {a: {b: [{c: "x"}]}} */
export function decodeForm(text) {
  const root = {};
  for (const [rawKey, value] of new URLSearchParams(text)) {
    const parts = rawKey.replace(/\]/g, "").split("[");
    let node = root;
    parts.forEach((part, i) => {
      const last = i === parts.length - 1;
      const nextIsIndex = !last && /^\d*$/.test(parts[i + 1]);
      if (Array.isArray(node) && part === "") part = String(node.length);
      if (last) node[part] = value;
      else node = node[part] ??= nextIsIndex ? [] : {};
    });
  }
  return root;
}

const readBody = (req) => new Promise((resolve, reject) => {
  const chunks = [];
  req.on("data", (c) => chunks.push(c));
  req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
  req.on("error", reject);
});

function send(res, status, body, headers = {}) {
  res.writeHead(status, { "content-type": "application/json", "request-id": rid("req", 14), "stripe-version": API_VERSION, ...headers });
  res.end(JSON.stringify(body));
}

function expandList(query) {
  const e = query.expand;
  return Array.isArray(e) ? e : e ? Object.values(e) : [];
}

function apiRoute(method, path, params) {
  let m;
  if (method === "POST" && path === "/v1/checkout/sessions") return createSession(params);
  if (method === "GET" && (m = path.match(/^\/v1\/checkout\/sessions\/([^/]+)\/line_items$/))) {
    if (!db.checkout_sessions.has(m[1])) throw missing("checkout.session", m[1]);
    const limit = Math.min(Number(params.limit ?? 10), 100);
    const all = db.line_items.get(m[1]) ?? [];
    return { ...listOf(all.slice(0, limit), path), has_more: all.length > limit };
  }
  if (method === "GET" && (m = path.match(/^\/v1\/checkout\/sessions\/([^/]+)$/))) {
    const s = db.checkout_sessions.get(m[1]);
    if (!s) throw missing("checkout.session", m[1]);
    return expandObject(s, expandList(params), "checkout.session");
  }
  for (const [route, table, kind] of [["customers", "customers", "customer"], ["invoices", "invoices", "invoice"], ["payment_intents", "payment_intents", "payment_intent"], ["charges", "charges", "charge"]]) {
    if (method === "GET" && (m = path.match(new RegExp(`^/v1/${route}/([^/]+)$`)))) {
      const obj = db[table].get(m[1]);
      if (!obj) throw missing(kind, m[1]);
      return expandObject(obj, expandList(params), kind);
    }
  }
  if (method === "GET" && (path === "/v1/account" || /^\/v1\/accounts\/[^/]+$/.test(path))) {
    return { id: "acct_parity_fake", object: "account", business_profile: { name: "Logo Fountain (parity stripe-fake)" }, business_type: "company",
      charges_enabled: true, country: "GB", created: 1767225600, default_currency: "gbp", details_submitted: true, email: null, metadata: {},
      payouts_enabled: true, type: "standard" };
  }
  throw stripeError(404, "invalid_request_error", `Unrecognized request URL (${method}: ${path}). stripe-fake implements only the endpoints Logo Fountain calls.`);
}

async function handleApi(req, res, url) {
  const auth = req.headers.authorization ?? "";
  const key = auth.startsWith("Bearer ") ? auth.slice(7) : auth.startsWith("Basic ") ? Buffer.from(auth.slice(6), "base64").toString().split(":")[0] : "";
  if (!/^(sk|rk)_test_/.test(key)) {
    return send(res, 401, { error: { type: "invalid_request_error", message: key ? `Invalid API Key provided: ${key.slice(0, 8)}***` : "You did not provide an API key." } });
  }
  const body = req.method === "POST" ? await readBody(req) : "";
  const params = req.method === "POST" ? decodeForm(body) : decodeForm(url.search.slice(1));
  const idemKey = req.method === "POST" ? req.headers["idempotency-key"] : null;
  const cacheKey = idemKey ? `${key}:${url.pathname}:${idemKey}` : null;
  if (cacheKey && idempotency.has(cacheKey)) {
    const cached = idempotency.get(cacheKey);
    return send(res, cached.status, cached.body, { "idempotent-replayed": "true" });
  }
  let status = 200;
  let result;
  try { result = apiRoute(req.method, url.pathname, params); } catch (error) {
    if (!(error instanceof StripeHttpError)) throw error;
    status = error.status; result = error.body;
  }
  if (cacheKey) idempotency.set(cacheKey, { status, body: result });
  return send(res, status, result);
}

async function handleHosted(req, res, url) {
  let m;
  if (req.method === "GET" && (m = url.pathname.match(/^\/pay\/([^/]+)$/))) {
    const s = db.checkout_sessions.get(m[1]);
    if (!s) { res.writeHead(404, { "content-type": "text/plain" }); return res.end("Unknown checkout session"); }
    res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
    return res.end(renderHostedPage(s, db.line_items.get(s.id) ?? []));
  }
  if (req.method === "POST" && (m = url.pathname.match(/^\/pay\/([^/]+)\/complete$/))) {
    const s = db.checkout_sessions.get(m[1]);
    if (!s) return send(res, 404, { error: "Unknown checkout session" });
    const raw = await readBody(req);
    const form = (req.headers["content-type"] ?? "").includes("json") ? JSON.parse(raw || "{}") : Object.fromEntries(new URLSearchParams(raw));
    if (s.status !== "open") return send(res, 409, { error: `Session is already ${s.status}` });
    const outcome = form.outcome === "fail" ? "fail" : "pay";
    settleSession(s.id, { outcome, email: (form.email || "buyer@example.test").trim(), firstName: (form.first_name || "Parity").trim(), lastName: (form.last_name || "Buyer").trim() });
    const sent = [await sendEvent(s.id, "checkout.session.completed")];
    if (outcome === "fail") sent.push(await sendEvent(s.id, "checkout.session.async_payment_failed"));
    const webhooks = sent.map(({ event, ...r }) => (void event, r));
    if ((req.headers.accept ?? "").includes("application/json")) return send(res, 200, { session: db.checkout_sessions.get(s.id), webhooks });
    res.writeHead(303, { location: s.success_url.replace("{CHECKOUT_SESSION_ID}", s.id) });
    return res.end();
  }
  if (req.method === "GET" && /^\/(receipts|invoices)\//.test(url.pathname)) {
    res.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
    return res.end(`stripe-fake document ${url.pathname}\n`);
  }
  return null;
}

async function handleAdmin(req, res, url) {
  let m;
  const json = async () => { const raw = await readBody(req); return raw ? JSON.parse(raw) : {}; };
  if (req.method === "GET" && url.pathname === "/__health") return send(res, 200, { ok: true, sessions: db.checkout_sessions.size });
  if (req.method === "POST" && url.pathname === "/__reset") { reset(); return send(res, 200, { ok: true, fixtures: fixtureFiles() }); }
  if (req.method === "POST" && url.pathname === "/__fixtures/load") {
    const body = await json();
    if (body.reset) { db = emptyState(); deliveries = []; idempotency.clear(); loadNamed("prices"); }
    try {
      for (const name of body.names ?? (body.name ? [body.name] : [])) loadNamed(name);
      if (body.fixture) loadFixture(body.fixture);
    } catch (error) { return send(res, 400, { error: error.message }); }
    return send(res, 200, { ok: true, sessions: [...db.checkout_sessions.keys()] });
  }
  if (req.method === "POST" && (m = url.pathname.match(/^\/__webhook\/([^/]+)$/))) {
    const body = await json();
    const s = db.checkout_sessions.get(m[1]);
    if (!s) return send(res, 404, { error: `Unknown checkout session ${m[1]}` });
    if (body.markPaid && s.payment_status !== "paid") {
      // e.g. a delayed payment that later succeeds (async_payment_succeeded): keep what the buyer entered.
      const field = (key) => s.custom_fields.find((f) => f.key === key)?.text?.value;
      settleSession(s.id, { outcome: "pay", email: body.email ?? s.customer_details?.email ?? "buyer@example.test",
        firstName: field("first_name") ?? "Parity", lastName: field("last_name") ?? "Buyer" });
    }
    const result = await sendEvent(s.id, body.type || "checkout.session.completed", body);
    return send(res, 200, result);
  }
  if (req.method === "POST" && url.pathname === "/__config") {
    const body = await json();
    if (typeof body.webhookUrl === "string") WEBHOOK_URL = body.webhookUrl;
    return send(res, 200, { webhookUrl: WEBHOOK_URL });
  }
  if (req.method === "GET" && url.pathname === "/__deliveries") return send(res, 200, { deliveries });
  if (req.method === "GET" && url.pathname === "/__state") {
    return send(res, 200, Object.fromEntries(Object.entries(db).map(([k, v]) => [k, Object.fromEntries(v)])));
  }
  return null;
}

reset();
const server = createServer(async (req, res) => {
  const url = new URL(req.url, PUBLIC_URL);
  try {
    if (url.pathname.startsWith("/v1/")) return await handleApi(req, res, url);
    if ((await handleHosted(req, res, url)) !== null) return;
    if ((await handleAdmin(req, res, url)) !== null) return;
    return send(res, 404, { error: { type: "invalid_request_error", message: `Unrecognized request URL (${req.method}: ${url.pathname}).` } });
  } catch (error) {
    console.error(error);
    if (!res.headersSent) send(res, 500, { error: { type: "api_error", message: `stripe-fake: ${error.message}` } });
  }
});
server.listen(PORT, () => console.log(`stripe-fake on :${PORT} (public ${PUBLIC_URL}, webhooks -> ${WEBHOOK_URL || "none"}, fixtures ${fixtureFiles().join(", ")})`));
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => server.close(() => process.exit(0)));
