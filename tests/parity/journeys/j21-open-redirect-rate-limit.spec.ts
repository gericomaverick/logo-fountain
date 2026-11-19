// Journey 21 (02-test-strategy.md §4, abuse): open-redirect `next` payloads through the real sign-in screen and the
// real magic-link callback must end on a page of the app (never another site, never a script URL), and a
// rate-limited sign-in must look exactly like a wrong password. The rule itself (every shape) is pinned by
// fixtures/rules/safe-next.json (story 0.6b); these prove the screens apply it.
import type { BrowserContext, Page } from "@playwright/test";
import { expect, test } from "../fixtures";
import { apiClient, baseURL, PARITY_PASSWORD } from "../adapters/api";
import { mailbox, proofLink, SUBJECTS } from "../adapters/mail";
import { navigationPagesFor, pagesFor } from "../pages";
import { freshCustomer } from "./_j7-j11-helpers";

test.use({ db: { shared: "awaiting-brief" } }); // fresh customers only: no seeded account is signed in or locked
test.describe.configure({ timeout: 240_000 });

const EVIL_HOST = "evil.example";
const LOGIN_PAYLOADS = [
  "https://evil.example/path",
  "//evil.example/path",
  "///evil.example/path",
  "/\\evil.example/path",
  "\\\\evil.example/path",
  "/%2fevil.example/path",
  "/%5cevil.example/path",
  "javascript:alert(document.domain)",
];
const CALLBACK_PAYLOADS = ["//evil.example/path", "https://evil.example/path", "/%2F%2Fevil.example"];

/** Catches any visit to the attacker's site and any script URL run, in this browser context. */
async function watchEscapes(context: BrowserContext, page: Page) {
  const escapes: string[] = [];
  await context.route((url) => url.hostname.endsWith(EVIL_HOST), (route) => {
    escapes.push(route.request().url());
    return route.fulfill({ status: 200, contentType: "text/html", body: "<h1>attacker</h1>" });
  });
  page.on("dialog", (d) => { escapes.push(`dialog:${d.message()}`); void d.dismiss(); });
  return escapes;
}

test("A-13/A-01 J21 open-redirect next payloads through the sign-in screen end on a page of the app @security @ui @auth", async ({ browser }) => {
  const { email } = await freshCustomer("j21.login");
  for (const next of LOGIN_PAYLOADS) {
    const context = await browser.newContext();
    const page = await context.newPage();
    const escapes = await watchEscapes(context, page);
    const nav = await navigationPagesFor(page);
    await nav.signInWithNext(next, email, PARITY_PASSWORD);
    await page.waitForTimeout(1_000);
    expect({ next, escapes, origin: new URL(page.url()).origin }).toEqual({ next, escapes: [], origin: baseURL });
    expect((await (await page.request.get("/api/auth/session")).json()).authenticated, `signed in (${next})`).toBe(true);
    await context.close();
  }
});

test("A-13/A-05/A-18 J21 a sign-in link whose next was rewritten to another site ends on a page of the app @security @ui @auth", async ({ browser }) => {
  const { email } = await freshCustomer("j21.callback");
  const anon = await apiClient();
  for (const next of CALLBACK_PAYLOADS) {
    const inbox = await mailbox(email);
    const res = await anon.post("/api/auth/magic-link", { data: { email } });
    expect(res.status(), await res.text()).toBe(200);
    const [mail] = (await inbox.next(1)).filter((m) => m.subject === SUBJECTS.signIn);
    const link = proofLink(mail);
    // The attacker forwards the email with the fragment's next swapped out.
    const fragment = new URLSearchParams(link.url.hash.slice(1));
    fragment.set("next", next);
    const forged = `${link.origin}${link.path}${link.query}#${fragment.toString()}`;

    const context = await browser.newContext();
    const page = await context.newPage();
    const escapes = await watchEscapes(context, page);
    const { auth } = await pagesFor(page);
    await auth.confirmMagicLink(forged);
    await page.waitForLoadState("networkidle");
    expect({ next, escapes, origin: new URL(page.url()).origin }).toEqual({ next, escapes: [], origin: baseURL });
    expect((await (await page.request.get("/api/auth/session")).json()).authenticated, `signed in (${next})`).toBe(true);
    await context.close();
  }
  await anon.dispose();
});

test("A-01/X-06 J21 a rate-limited sign-in shows exactly the wrong-password message, even with the right password @security @ui @auth", async ({ page }) => {
  const { email } = await freshCustomer("j21.limit");
  const nav = await navigationPagesFor(page);
  const wrong: string[] = [];
  // Five failures fill the per-email failure budget (lib/auth/rate-limit.ts:9 LOGIN_FAILURE_LIMIT).
  for (let i = 0; i < 5; i++) wrong.push(String(await nav.attemptSignIn(email, `Wrong-Pass-${i}-2026!`)));
  expect(new Set(wrong).size, `one wrong-password message: ${JSON.stringify(wrong)}`).toBe(1);
  expect(wrong[0]).not.toBe("null");
  // Now limited: the right password is refused, and the screen can't tell it apart from a wrong one.
  const limited = await nav.attemptSignIn(email, PARITY_PASSWORD);
  expect(limited).toBe(wrong[0]);
  const limitedWrong = await nav.attemptSignIn(email, "Wrong-Pass-x-2026!");
  expect(limitedWrong).toBe(wrong[0]);
});
