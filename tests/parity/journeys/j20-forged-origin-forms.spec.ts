// Journey 20 (02-test-strategy.md §4, abuse): cross-site request forgery from a real foreign page. Client A is
// signed in; a page on another site (served by the test at http://evil.example) auto-submits HTML forms and a
// no-cors fetch at the app's mutations. The browser sends its own Origin, so every one must be refused with
// 403 INVALID_ORIGIN and change nothing; A stays signed in. Complements the header-level sweep in
// contract/origin-guard.spec.ts (story 0.7d), which can't show what a browser actually sends.
import type { Page } from "@playwright/test";
import { expect, test } from "../fixtures";
import { apiClient, baseURL, PARITY_PASSWORD } from "../adapters/api";
import { seed } from "../adapters/seed";
import { pagesFor } from "../pages";
import { conceptId, projectId } from "./contract/_client-helpers";

test.use({ db: "exclusive" });
// The test app listens on loopback, so Chromium's Private/Local Network Access checks would block the foreign
// page's fetch before it leaves the browser (in production the app is public and nothing stops it). Turn them
// off so the request really reaches the app, as an attacker's would. Form navigations aren't affected either way.
test.use({ launchOptions: { args: ["--disable-features=BlockInsecurePrivateNetworkRequests,PrivateNetworkAccessSendPreflights,PrivateNetworkAccessRespectPreflightResults,LocalNetworkAccessChecks"] } });
test.describe.configure({ timeout: 180_000 });

const EVIL = "http://evil.example";
const pA = projectId("two-tenants", "pA");
const cA1 = conceptId("two-tenants", 1, "pA");
const INVALID_ORIGIN = { error: { code: "INVALID_ORIGIN", message: "Request origin is not allowed." } };

// text/plain forms can smuggle a JSON body (`name=value` → `{"…":"…="}`); urlencoded is the plain form.
const json = (o: Record<string, unknown>) => {
  const s = JSON.stringify(o);
  return { name: s.slice(0, -1) + ',"pad":"', value: '"}' };
};
const TARGETS: Array<{ path: string; enctype: "text/plain" | "application/x-www-form-urlencoded"; field: { name: string; value: string } }> = [
  { path: `/api/projects/${pA}/messages`, enctype: "text/plain", field: json({ body: "forged message" }) },
  { path: `/api/projects/${pA}/messages`, enctype: "application/x-www-form-urlencoded", field: { name: "body", value: "forged message" } },
  { path: `/api/projects/${pA}/revision-requests`, enctype: "text/plain", field: json({ conceptId: cA1, body: "forged revision" }) },
  { path: `/api/projects/${pA}/approve`, enctype: "text/plain", field: json({ conceptId: cA1, acknowledged: true }) },
  { path: `/api/projects/${pA}/concepts/${cA1}/comments`, enctype: "text/plain", field: json({ body: "forged comment" }) },
  { path: "/api/auth/password", enctype: "text/plain", field: json({ currentPassword: PARITY_PASSWORD, newPassword: "Forged-Pass-2026!" }) },
  { path: "/api/auth/logout", enctype: "application/x-www-form-urlencoded", field: { name: "x", value: "1" } },
];

const escapeAttr = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

/** Serves one attacker page at http://evil.example/ and opens it; resolves with the app's answer to its request. */
async function fromEvilPage(page: Page, html: string, path: string) {
  await page.route(`${EVIL}/**`, (route) => route.fulfill({ status: 200, contentType: "text/html", body: html }));
  const answer = page.waitForResponse((r) => new URL(r.url()).origin === baseURL && new URL(r.url()).pathname === path, { timeout: 30_000 });
  await page.goto(`${EVIL}/attack`);
  const res = await answer;
  const origin = await res.request().headerValue("origin");
  const body = await res.text().catch(() => "");
  await page.unroute(`${EVIL}/**`);
  return { status: res.status(), origin, body };
}

async function state() {
  const a = await apiClient({ signInAs: "client.a@parity.test" });
  try {
    const snap = (await (await a.get(`/api/projects/${pA}`)).json()).snapshot;
    const comments = await (await a.get(`/api/projects/${pA}/concepts/${cA1}/comments`)).json();
    return { status: snap.status, messages: snap.messages.length, revisions: snap.revisionRequests.length, concepts: snap.concepts.map((c: any) => c.status), comments: JSON.stringify(comments).length };
  } finally {
    await a.dispose();
  }
}

test("X-01/A-16 J20 forged form posts and a no-cors fetch from a foreign page are refused 403 INVALID_ORIGIN and change nothing @security @ui @authz", async ({ page }) => {
  seed("two-tenants");
  const before = await state();
  const { auth } = await pagesFor(page);
  await auth.signIn("client.a@parity.test", PARITY_PASSWORD);

  for (const t of TARGETS) {
    const html = `<!doctype html><form method="post" action="${baseURL}${t.path}" enctype="${t.enctype}">` +
      `<input type="hidden" name="${escapeAttr(t.field.name)}" value="${escapeAttr(t.field.value)}"></form>` +
      `<script>document.forms[0].submit()</script>`;
    const res = await fromEvilPage(page, html, t.path);
    expect({ target: `${t.enctype} ${t.path}`, origin: res.origin, status: res.status }).toEqual({ target: `${t.enctype} ${t.path}`, origin: EVIL, status: 403 });
    expect(JSON.parse(res.body)).toEqual(INVALID_ORIGIN);
  }

  // A script on the foreign page firing a credentialed no-cors request (it can't read the answer; the app must still refuse).
  const path = `/api/projects/${pA}/messages`;
  const fetchHtml = `<!doctype html><script>fetch(${JSON.stringify(baseURL + path)}, { method: "POST", mode: "no-cors", credentials: "include", headers: { "content-type": "text/plain" }, body: JSON.stringify({ body: "forged by fetch" }) })</script>`;
  const fetched = await fromEvilPage(page, fetchHtml, path);
  expect({ origin: fetched.origin, status: fetched.status }).toEqual({ origin: EVIL, status: 403 });

  expect(await state()).toEqual(before);
  // Still signed in (the forged logout did nothing), and the password is unchanged.
  await page.goto("/");
  const session = await (await page.request.get("/api/auth/session")).json();
  expect(session).toMatchObject({ authenticated: true, email: "client.a@parity.test" });
  const check = await apiClient({ signInAs: "client.a@parity.test", password: PARITY_PASSWORD });
  await check.dispose();
});
