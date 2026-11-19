// Journey 19 (02-test-strategy.md §4, abuse): cross-tenant access through the browser. Client B, signed in, opens
// client A's project, concepts, one concept, messages and brief by URL (as a forwarded email or a guessed link would)
// and must see nothing of A's: not on screen, not in any response the app sends the browser, and no object-store
// request for A's images. The per-endpoint API matrix is contract/authz-matrix.spec.ts (story 0.7d); this proves
// the pages don't leak around it. Positive control: the same capture finds B's own data on B's own pages.
import type { Page, Response } from "@playwright/test";
import { expect, test } from "../fixtures";
import { PARITY_PASSWORD } from "../adapters/api";
import { seed } from "../adapters/seed";
import { navigationPagesFor, pagesFor } from "../pages";
import { conceptId, projectId } from "./contract/_client-helpers";

test.use({ db: "exclusive" });
test.describe.configure({ timeout: 180_000 });

const pA = projectId("two-tenants", "pA");
const pB = projectId("two-tenants", "pB");
const cA1 = conceptId("two-tenants", 1, "pA");
const cB1 = conceptId("two-tenants", 1, "pB");

// Data only client A's project has (fixtures/scenarios/two-tenants.json): brief answers, client name, member email,
// and the object-store key prefix of A's concept files ({projectId}/{conceptId}/v1.*).
const A_MARKERS = ["Northvale Coffee", "Coffee roastery", "Ada Client", "client.a@parity.test", `${pA}/${cA1}/`];
const B_MARKERS = ["Harbour Physio", `${pB}/${cB1}/`];

/** Everything the app sends the browser while `fn` runs (documents, RSC/JSON payloads, scripts' data), as text. */
async function capture(page: Page, fn: () => Promise<void>) {
  const bodies: string[] = [];
  const storage: string[] = [];
  const pending: Promise<void>[] = [];
  const onResponse = (res: Response) => {
    const url = new URL(res.url());
    if (url.searchParams.has("X-Amz-Signature") && url.pathname.includes(`/${pA}/`)) storage.push(res.url());
    const type = res.headers()["content-type"] ?? "";
    if (!/json|html|text|x-component/.test(type) || type.includes("event-stream")) return;
    // A body that never completes (a stream) can't carry a finished payload; don't wait on it forever.
    const timeout = new Promise<void>((resolve) => setTimeout(resolve, 10_000));
    pending.push(Promise.race([res.text().then((t) => { bodies.push(t); }, () => undefined), timeout]));
  };
  page.on("response", onResponse);
  try { await fn(); } finally { page.off("response", onResponse); }
  await Promise.all(pending);
  return { text: bodies.join("\n") + "\n" + (await page.content()) + "\n" + (await page.locator("body").innerText()), storage };
}

async function visit(page: Page, path: string) {
  await page.goto(path);
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(1_000); // client pages fetch their data after hydration and poll
}

test("C-20/A-16 J19 client B opening client A's project, concept and message URLs in the browser sees nothing of A's @security @ui @authz", async ({ page }) => {
  seed("two-tenants");
  const { auth } = await pagesFor(page);
  const nav = await navigationPagesFor(page);
  await auth.signIn("client.b@parity.test", PARITY_PASSWORD);

  // Positive control: on B's own pages the capture does see B's data, so an empty result below means something.
  const own = await capture(page, async () => { for (const path of nav.clientProjectPaths(pB, cB1)) await visit(page, path); });
  for (const marker of B_MARKERS) expect(own.text, `B's own pages show ${marker}`).toContain(marker);

  for (const path of nav.clientProjectPaths(pA, cA1)) {
    const seen = await capture(page, () => visit(page, path));
    for (const marker of A_MARKERS) expect(seen.text.includes(marker), `${path} leaks "${marker}"`).toBe(false);
    expect(seen.storage, `${path} fetched A's stored objects`).toEqual([]);
  }
});
