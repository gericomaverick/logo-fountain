// Decided deviations DV-1 (promotion codes) and DV-5 (canonical Stripe return URLs), story 0.8e.
// Black box: start every kind of Checkout Session the app creates and read the session stripe-fake received.
// Both FAIL on Next (expected-next-failures.txt): Next never sets allow_promotion_codes
// (app/checkout/start/route.ts:33, app/api/projects/[id]/checkout/session/route.ts:87,117) and builds the URLs
// from X-Forwarded-Host/Host (lib/request-origin.ts:28 getRequestOrigin).
import type { APIRequestContext } from "@playwright/test";
import { expect, test } from "../../fixtures";
import { baseURL } from "../../adapters/api";
import { signInSerialised } from "../../adapters/stripe";
import { client, stripeSession } from "../contract/_auth-helpers";
import { projectId } from "../contract/_client-helpers";

// Starting a checkout only creates a session at stripe-fake: nothing is written, so the shared baseline is enough.
test.use({ db: { shared: "awaiting-brief" } });

const P1 = projectId("awaiting-brief"); // client A's professional project: add-on and upgrade to complete are offered
const FORGED = { "x-forwarded-host": "evil.example", "x-forwarded-proto": "https" };

type Started = { kind: string; sessionId: string };
const sessionIdOf = (url: string) => {
  const id = url.match(/\/pay\/([^/?#]+)/)?.[1];
  if (!id) throw new Error(`not a stripe-fake hosted page: ${url}`);
  return decodeURIComponent(id);
};

async function startPackage(pkg: string, headers: Record<string, string> = {}, query = ""): Promise<Started> {
  const anon = await client({ origin: null, headers });
  try {
    const res = await anon.get(`/checkout/start?package_code=${pkg}${query}`, { maxRedirects: 0 });
    expect(res.status(), await res.text()).toBe(303);
    return { kind: `package:${pkg}`, sessionId: sessionIdOf(res.headers()["location"] ?? "") };
  } finally {
    await anon.dispose();
  }
}

async function startUpsell(member: APIRequestContext, body: Record<string, string>, headers: Record<string, string> = {}): Promise<Started> {
  const res = await member.post(`/api/projects/${P1}/checkout/session`, { data: body, headers });
  expect(res.status(), await res.text()).toBe(200);
  return { kind: `upsell:${body.kind}`, sessionId: sessionIdOf((await res.json()).url) };
}

test("DV-1/K-13 every Checkout Session the app creates allows promotion codes (packages, add-on, upgrade) @deviation @api @checkout @upsell", async () => {
  const member = await signInSerialised("client.a@parity.test");
  const started = [
    await startPackage("essential"),
    await startPackage("professional"),
    await startPackage("complete"),
    await startPackage("essential", {}, "&campaign_slug=spring-launch"), // a marketing link with a campaign slug
    await startUpsell(member, { kind: "addon", addonKey: "extra_revision" }),
    await startUpsell(member, { kind: "upgrade", toPackage: "complete" }),
  ];
  const seen = await Promise.all(started.map(async (s) => ({ kind: s.kind, allow_promotion_codes: (await stripeSession(s.sessionId) as any).allow_promotion_codes })));
  expect(seen).toEqual(started.map((s) => ({ kind: s.kind, allow_promotion_codes: true })));
  await member.dispose();
});

test("DV-5/K-01/K-08 Stripe success and cancel URLs come from the canonical origin even when Host/X-Forwarded-Host is forged @deviation @api @checkout @upsell @security", async () => {
  const member = await signInSerialised("client.a@parity.test");
  const started = [
    await startPackage("essential", FORGED),
    await startUpsell(member, { kind: "addon", addonKey: "extra_revision" }, FORGED),
    await startUpsell(member, { kind: "upgrade", toPackage: "complete" }, FORGED),
  ];
  for (const s of started) {
    const session = await stripeSession(s.sessionId);
    const cancel = (session as any).cancel_url as string | null;
    // success_url returns to the portal: exactly the canonical origin (PUBLIC_SITE_URL = the suite's base URL).
    expect({ kind: s.kind, success: new URL(session.success_url).origin }).toEqual({ kind: s.kind, success: baseURL });
    // cancel_url goes to the portal (upsell) or the marketing site (packages): never the forged host.
    expect({ kind: s.kind, cancelHost: cancel ? new URL(cancel).host : null }).not.toEqual({ kind: s.kind, cancelHost: "evil.example" });
    expect(`${session.success_url} ${cancel}`).not.toContain("evil.example");
  }
  await member.dispose();
});
