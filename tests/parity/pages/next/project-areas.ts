// Shared bits of the Next.js project pages for the 0.8b page objects: every project screen lives under /project/{id}.
import type { Page } from "@playwright/test";

const UNDER_PROJECT = /^\/project\/([0-9a-f-]{36})(\/|$)/i;

/** The project ID of whichever project screen is open (throws when none is). */
export function projectIdIn(page: Page): string {
  const id = new URL(page.url()).pathname.match(UNDER_PROJECT)?.[1];
  if (!id) throw new Error(`no project is open (at ${page.url()})`);
  return id;
}

/** Opens the project hub fresh (app/project/[id]/page.tsx renders the snapshot server-side, so this is current). */
export async function openHub(page: Page): Promise<string> {
  const id = projectIdIn(page);
  await page.goto(`/project/${id}`);
  await page.getByRole("heading", { level: 1 }).waitFor();
  await page.waitForLoadState("networkidle"); // hydrated: sessionStorage-driven parts (upsell snooze) have settled
  return id;
}

/** Opens one of the hub's area cards (project-hub.tsx:67 AreaRow, aria-label "Open {title}"). */
export async function openProjectArea(page: Page, title: "Brief" | "Concepts" | "Messages"): Promise<void> {
  await openHub(page);
  await page.getByRole("link", { name: `Open ${title}`, exact: true }).click();
}
