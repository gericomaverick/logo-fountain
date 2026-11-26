// Laravel portal Overview, upsell panel and purchase banner (stories 6.2b, 6.3, 6.4). Accessible locators first.
import type { Page } from "@playwright/test";
import type { Allowance, AllowanceKind } from "../concepts";
import type { PortalPages, ProjectStatus, Turn } from "../index";
import { onFakeStripe } from "../stripe-fake";
import type { UpsellOffer, UpsellPages } from "../upsell";

const PROJECT_PATH = /^\/project\/([0-9a-f-]{36})$/i;
const LABEL_TO_STATUS: Record<string, ProjectStatus> = {
  "Awaiting brief": "AWAITING_BRIEF", "Brief submitted": "BRIEF_SUBMITTED", "In design": "IN_DESIGN",
  "Concepts ready": "CONCEPTS_READY", "Revisions in progress": "REVISIONS_IN_PROGRESS", "Awaiting approval": "AWAITING_APPROVAL",
  Approved: "AWAITING_APPROVAL", "Final files ready": "FINAL_FILES_READY", Delivered: "DELIVERED",
  "On hold": "ON_HOLD", Cancelled: "CANCELLED", Refunded: "REFUNDED",
};
const CLIENT_TURN: ProjectStatus[] = ["AWAITING_BRIEF", "CONCEPTS_READY", "FINAL_FILES_READY", "ON_HOLD"];
const NOBODY_TURN: ProjectStatus[] = ["DELIVERED", "CANCELLED", "REFUNDED"];

const PROJECT_PATH_ANY = /\/project\/[0-9a-f-]{36}$/i;
const idFromUrl = (page: Page) => new URL(page.url()).pathname.match(PROJECT_PATH)?.[1] ?? null;

export function portalOverview(page: Page): PortalPages {
  const self: PortalPages = {
    // Story 6.1: one project lands on its Overview after sign-in; with several, /dashboard is the real list and the
    // project is opened by its card (named, or the only one if `name` is omitted).
    async openProject(name) {
      if (idFromUrl(page) && !name) return;
      await page.goto("/dashboard");
      if (!idFromUrl(page)) {
        const cards = page.getByRole("list", { name: "Your projects" }).getByRole("link", name ? { name } : undefined);
        const count = await cards.count();
        if (count !== 1) throw new Error(`openProject(${name ?? ""}): expected exactly one matching project, found ${count}`);
        await cards.click();
        await page.waitForURL(PROJECT_PATH_ANY);
      }
      await page.getByRole("heading", { level: 1 }).waitFor();
    },
    async currentProjectId() {
      const id = idFromUrl(page);
      if (!id) throw new Error(`no project is open (at ${page.url()})`);
      return id;
    },
    async projectStatus() {
      const current = page.getByRole("region", { name: "Progress" }).locator('[aria-current="step"]');
      await current.waitFor();
      const label = (await current.innerText()).split("\n")[0].replace(/,.*$/, "").trim();
      const status = LABEL_TO_STATUS[label];
      if (!status) throw new Error(`unknown stage "${label}"`);
      return status;
    },
    async currentTurn(): Promise<Turn> {
      const status = await self.projectStatus();
      return CLIENT_TURN.includes(status) ? "client" : NOBODY_TURN.includes(status) ? "none" : "studio";
    },
  };
  return self;
}

export async function overviewAllowance(page: Page, kind: AllowanceKind): Promise<Allowance> {
  const id = idFromUrl(page);
  if (!id) throw new Error(`no project is open (at ${page.url()})`);
  await page.goto(`/project/${id}`);
  const label = kind === "concepts" ? "Concepts" : "Revisions";
  const meter = page.getByRole("group", { name: label });
  const legend = (await meter.getByRole("img").first().getAttribute("aria-label")) ?? "";
  const m = legend.match(/(\d+) used · (\d+) in progress/);
  if (!m) throw new Error(`unreadable allowance "${legend}"`);
  const [used, pending] = [Number(m[1]), Number(m[2])];
  const of = legend.match(/(\d+) of (\d+)/);
  if (!of) throw new Error(`unreadable allowance "${legend}"`);
  return { limit: Number(of[2]), used, pending, left: Number(of[1]) };
}

export function upsellOverview(page: Page): UpsellPages {
  const panel = () => page.getByRole("region", { name: "Need more flexibility?" });
  const addon = () => panel().getByRole("button", { name: /^Buy extra revision \(/ });
  const upgrade = () => panel().getByRole("button", { name: /^Upgrade to / });
  return {
    async offer() {
      const id = idFromUrl(page);
      if (!id) throw new Error(`no project is open (at ${page.url()})`);
      await page.goto(`/project/${id}`);
      await page.getByRole("heading", { level: 1 }).waitFor();
      if ((await panel().count()) === 0) return null;
      const offer: UpsellOffer = { addon: null, upgrade: null };
      if (await addon().count()) offer.addon = { price: (await addon().innerText()).match(/\((.+)\)$/)![1] };
      if (await upgrade().count()) {
        const m = (await upgrade().innerText()).match(/^Upgrade to (Professional|Complete) \((.+)\)$/)!;
        offer.upgrade = { to: m[1] === "Professional" ? "professional" : "complete", price: m[2] };
      }
      return offer;
    },
    async snooze() {
      await panel().getByRole("button", { name: "Not now" }).click();
      await panel().waitFor({ state: "detached" });
    },
    async buy(what) {
      await (what === "addon" ? addon() : upgrade()).click();
      await page.waitForURL(onFakeStripe, { timeout: 30_000 });
    },
    async waitForPurchaseConfirmed(timeoutMs = 60_000) {
      await page.getByText("Purchase confirmed", { exact: true }).waitFor({ timeout: timeoutMs });
    },
  };
}
