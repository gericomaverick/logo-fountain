import type { Page } from "@playwright/test";
import type { PageObjects } from "../index";
import { auth } from "./auth";
import { checkout } from "./checkout";
import { portal } from "./portal";

export function create(page: Page): PageObjects {
  return { page, auth: auth(page), checkout: checkout(page), portal: portal(page) };
}
