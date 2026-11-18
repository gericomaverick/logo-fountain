// Journeys get page objects ONLY through this module, so they never branch on the target.
// Each target implements the same interfaces in pages/next/* and pages/laravel/*.
import type { Page } from "@playwright/test";
import { resolveTarget } from "../adapters/target";

export interface PageObjects {
  /** Placeholder until journeys need real page objects (story 0.8a). */
  readonly page: Page;
}

export async function pagesFor(page: Page): Promise<PageObjects> {
  const target = resolveTarget();
  const impl = target === "next" ? await import("./next/index") : await import("./laravel/index");
  return impl.create(page);
}
