// Laravel page objects for the brief, concepts and upsell areas (story 0.8b): typed stubs until the screens exist.
// Each throws naming the story that builds the screen. Accessible locators first; data-testid is allowed here.
import type { Page } from "@playwright/test";
import type { BriefPages, ProjectThreadPages } from "../brief";
import type { ConceptPages } from "../concepts";
import type { UpsellPages } from "../upsell";

const todo = (what: string, story: string) => (): never => {
  throw new Error(`Laravel page object ${what}: not implemented (story ${story})`);
};

export function areas08b(_page: Page): { brief: BriefPages; thread: ProjectThreadPages; concepts: ConceptPages; upsell: UpsellPages } {
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
      hasNewConcepts: todo("concepts.hasNewConcepts", "6.2b"),
      openGallery: todo("concepts.openGallery", "6.7"),
      openConcept: todo("concepts.openConcept", "6.7"),
      shownImage: todo("concepts.shownImage", "6.7"),
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
