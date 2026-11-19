// Next.js concepts screens: hub (app/project/[id]/project-hub.tsx), gallery (app/project/[id]/concepts/page.tsx),
// concept detail (app/project/[id]/concept/[conceptId]/page.tsx), allowances (components/allowances.tsx).
import type { Page } from "@playwright/test";
import { baseURL } from "../../adapters/api";
import type { Allowance, ConceptPages, ThreadEntry } from "../concepts";
import { openHub, openProjectArea, projectIdIn } from "./project-areas";

const CONCEPT_PATH = /^\/project\/[^/]+\/concept\/([0-9a-f-]{36})$/i;

export function concepts(page: Page): ConceptPages {
  let openNumber: number | null = null;
  const conceptId = () => {
    const id = new URL(page.url()).pathname.match(CONCEPT_PATH)?.[1];
    if (!id) throw new Error(`no concept is open (at ${page.url()})`);
    return id;
  };
  const detailLoaded = async () => {
    await page.getByRole("heading", { name: "Concept detail" }).waitFor();
    await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => {}); // bounded: polling pages never go idle (story 0.9)
    await page.getByText("Loading…").waitFor({ state: "hidden" });
  };
  // concept/[conceptId]/page.tsx:434-493: the thread is the list under "Concept thread"; each entry is an <article>
  // with the body as its <p> and the kind/status pills in its last row.
  const threadSection = () => page.locator("section").filter({ has: page.getByRole("heading", { name: "Concept thread" }) });

  const self: ConceptPages = {
    async hasNewConcepts() {
      await openHub(page);
      // project-hub.tsx:80: a "New" pill inside the Concepts area card (hasNewConcepts in the snapshot).
      return (await page.getByRole("link", { name: "Open Concepts", exact: true }).getByText("New", { exact: true }).count()) > 0;
    },
    async openGallery() {
      // concepts/page.tsx:57-64 loads the concepts and POSTs read-state {area:"concepts"} in parallel.
      const seen = page.waitForResponse((r) => r.request().method() === "POST" && new URL(r.url()).pathname.endsWith("/read-state"));
      await openProjectArea(page, "Concepts");
      await page.getByRole("heading", { name: "Concepts gallery" }).waitFor();
      if (!(await seen).ok()) throw new Error("concepts read-state POST failed");
      await page.getByText("Loading…").waitFor({ state: "hidden" });
      // Each card is a link "Concept #{n} · v{version}" (concepts/page.tsx:129).
      const texts = await page.getByRole("link", { name: /Concept #\d+ · v\d+/ }).allInnerTexts();
      return texts.map((t) => {
        const m = t.match(/Concept #(\d+) · v(\d+)/)!;
        return { number: Number(m[1]), version: Number(m[2]) };
      });
    },
    async openConcept(n) {
      await page.getByRole("link", { name: new RegExp(`Concept #${n} · v\\d+`) }).click();
      await page.waitForURL((url) => CONCEPT_PATH.test(url.pathname));
      await detailLoaded();
      openNumber = n;
    },
    async shownImage() {
      conceptId();
      const img = page.getByRole("img", { name: `Concept ${openNumber}`, exact: true }); // page.tsx:314
      await img.waitFor();
      await page.waitForFunction((el) => (el as HTMLImageElement).complete, await img.elementHandle(), { timeout: 15_000 });
      return img.evaluate((el: HTMLImageElement) => ({ src: el.currentSrc || el.src, naturalWidth: el.naturalWidth, naturalHeight: el.naturalHeight }));
    },
    async comment(text) {
      // Next has NO client comment composer: concept/[conceptId]/page.tsx:496-535 shows clients only the revision
      // form (the reply form is admin-only). The comments API is open to members, so this posts with the browser's
      // own session, as the page's fetch would, and reloads so the thread shows it.
      const res = await page.request.post(`/api/projects/${projectIdIn(page)}/concepts/${conceptId()}/comments`, { headers: { Origin: baseURL }, data: { body: text } });
      if (res.status() !== 201) throw new Error(`comment failed: ${res.status()} ${await res.text()}`);
      await page.reload();
      await detailLoaded();
    },
    async requestRevision(text) {
      const form = page.locator("form").filter({ has: page.getByRole("button", { name: "Submit revision request" }) });
      await form.getByRole("textbox").fill(text);
      const posted = page.waitForResponse((r) => r.request().method() === "POST" && new URL(r.url()).pathname.endsWith("/revision-requests"));
      await form.getByRole("button", { name: "Submit revision request" }).click();
      const res = await posted;
      if (res.status() !== 201) throw new Error(`revision request failed: ${res.status()} ${await res.text()}`);
      await page.getByText(/^Feedback sent\./).waitFor(); // page.tsx:156, shown before the refresh (page.tsx:157) lands
      await threadSection().locator("article").filter({ hasText: text }).waitFor();
    },
    async thread() {
      return threadSection().locator("article").evaluateAll((articles) => articles.map((a) => {
        const pills = Array.from(a.lastElementChild?.querySelectorAll("span") ?? []).map((s) => (s.textContent ?? "").trim());
        const entry: { kind: "comment" | "revision"; body: string; status?: string } = {
          kind: pills[0] === "Revision request" ? "revision" : "comment",
          body: (a.querySelector(":scope > p")?.textContent ?? "").trim(),
        };
        if (pills[1]) entry.status = pills[1].toLowerCase();
        return entry;
      })) as Promise<ThreadEntry[]>;
    },
    async allowance(kind) {
      await openHub(page);
      // allowances.tsx:68: role=meter, aria-label "{Label}: {used} used, {pending} pending, {left} left", max = limit.
      const meter = page.getByRole("meter", { name: new RegExp(`^${kind === "concepts" ? "Concepts" : "Revisions"}:`) });
      const label = (await meter.getAttribute("aria-label")) ?? "";
      const m = label.match(/: (\d+) used, (\d+) pending, (\d+) left$/);
      if (!m) throw new Error(`unreadable allowance meter "${label}"`);
      const result: Allowance = { limit: Number(await meter.getAttribute("aria-valuemax")), used: Number(m[1]), pending: Number(m[2]), left: Number(m[3]) };
      return result;
    },
  };
  return self;
}
