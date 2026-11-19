import type { Page } from "@playwright/test";
import type { PageObjects } from "../index";
import { auth } from "./auth";
import { checkout } from "./checkout";
import { portal } from "./portal";
import { brief, thread } from "./brief"; // 0.8b
import { concepts } from "./concepts"; // 0.8b
import { upsell } from "./upsell"; // 0.8b

export function create(page: Page): PageObjects {
  return { page, auth: auth(page), checkout: checkout(page), portal: portal(page),
    brief: brief(page), thread: thread(page), concepts: concepts(page), upsell: upsell(page) }; // 0.8b
}
