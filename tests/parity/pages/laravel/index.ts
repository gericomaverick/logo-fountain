import type { Page } from "@playwright/test";
import type { PageObjects } from "../index";

export function create(page: Page): PageObjects {
  return { page };
}
