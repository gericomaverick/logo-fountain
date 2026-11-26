// Laravel page objects for the brief, concepts and upsell areas (story 0.8b): typed stubs until the screens exist.
// Each throws naming the story that builds the screen. Accessible locators first; data-testid is allowed here.
import type { Page } from "@playwright/test";
import type { BriefPages, ProjectThreadPages } from "../brief";
import type { ConceptPages } from "../concepts";
import type { UpsellPages } from "../upsell";

const todo = (what: string, story: string) => (): never => {
  throw new Error(`Laravel page object ${what}: not implemented (story ${story})`);
};

export function areas08b(page: Page): { brief: BriefPages; thread: ProjectThreadPages; concepts: ConceptPages; upsell: UpsellPages } {
  let openNumber = 0;
  return {
    brief: {
      open: todo("brief.open", "6.5"),
      fill: todo("brief.fill", "6.5"),
      next: todo("brief.next", "6.5"),
      waitUntilSaved: todo("brief.waitUntilSaved", "6.5"),
      shownAnswers: todo("brief.shownAnswers", "6.5"),
      reload: todo("brief.reload", "6.5"),
      submit: todo("brief.submit", "6.6"),
    },
    thread: { systemMessages: todo("thread.systemMessages", "6.10") },
    concepts: {
      // Story 6.7 UI half. Laravel flags new concepts as a dot on the Concepts tab (its link name says "new").
      async hasNewConcepts() {
        if (!/\/project\/[0-9a-f-]{36}/.test(page.url())) throw new Error(`hasNewConcepts: not on a project URL (${page.url()})`);
        await page.goto(page.url().replace(/(\/project\/[0-9a-f-]{36}).*/, "$1"));
        await page.getByRole("heading", { level: 1 }).waitFor();
        return (await page.getByRole("link", { name: "Concepts, new" }).count()) > 0;
      },
      async openGallery() {
        const seen = page.waitForResponse((r) => r.request().method() === "POST" && new URL(r.url()).pathname.endsWith("/read-state"));
        await page.goto(page.url().replace(/(\/project\/[0-9a-f-]{36}).*/, "$1/concepts"));
        await page.getByRole("heading", { level: 1, name: "Concepts" }).waitFor();
        if (!(await seen).ok()) throw new Error("concepts read-state POST failed");
        const list = page.getByRole("list", { name: "Concepts" });
        await list.waitFor();
        const texts = await list.getByRole("listitem").allInnerTexts();
        return texts.map((t) => {
          const m = t.match(/Concept (\d+)[\s\S]*?Version (\d+)/)!;
          return { number: Number(m[1]), version: Number(m[2]) };
        });
      },
      async openConcept(n: number) {
        await page.getByRole("list", { name: "Concepts" }).getByRole("link", { name: `Concept ${n}`, exact: true }).click();
        await page.waitForURL(/\/project\/[0-9a-f-]{36}\/concept\/[0-9a-f-]{36}$/);
        openNumber = n;
      },
      async shownImage() {
        const img = page.getByRole("img", { name: new RegExp(`^Concept ${openNumber}, version \\d+$`) }).first();
        await img.waitFor();
        await page.waitForFunction((el) => (el as HTMLImageElement).complete, await img.elementHandle(), { timeout: 15_000 });
        return img.evaluate((el: HTMLImageElement) => ({ src: el.currentSrc || el.src, naturalWidth: el.naturalWidth, naturalHeight: el.naturalHeight }));
      },
      comment: todo("concepts.comment", "6.8"),
      requestRevision: todo("concepts.requestRevision", "6.8"),
      thread: todo("concepts.thread", "6.8"),
      allowance: todo("concepts.allowance", "6.2b"),
    },
    upsell: {
      offer: todo("upsell.offer", "6.3"),
      snooze: todo("upsell.snooze", "6.3"),
      buy: todo("upsell.buy", "6.3"),
      waitForPurchaseConfirmed: todo("upsell.waitForPurchaseConfirmed", "6.4"),
    },
  };
}
