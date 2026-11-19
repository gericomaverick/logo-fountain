// Next.js customer portal: app/dashboard/page.tsx (project list) and app/project/[id]/project-hub.tsx (overview).
import type { Page } from "@playwright/test";
import type { PortalPages, ProjectStatus, Turn } from "../index";

const PROJECT_PATH = /^\/project\/([0-9a-f-]{36})\/?$/i;
/** Badge copy -> state (lib/project-state-machine.ts:39 PROJECT_STATE_LABELS; "Approved" is a display-only override). */
const LABEL_TO_STATUS: Record<string, ProjectStatus> = {
  "Awaiting brief": "AWAITING_BRIEF", "Brief submitted": "BRIEF_SUBMITTED", "In design": "IN_DESIGN",
  "Concepts ready": "CONCEPTS_READY", "Revisions in progress": "REVISIONS_IN_PROGRESS", "Awaiting approval": "AWAITING_APPROVAL",
  "Final files ready": "FINAL_FILES_READY", Delivered: "DELIVERED", "On hold": "ON_HOLD", Cancelled: "CANCELLED", Refunded: "REFUNDED",
};
/** The dashboard's "needs action" group (dashboard/page.tsx:38 NEEDS_ACTION_STATES): the customer's move. */
const CLIENT_TURN: ProjectStatus[] = ["AWAITING_BRIEF", "CONCEPTS_READY", "ON_HOLD"];
const NOBODY_TURN: ProjectStatus[] = ["DELIVERED", "CANCELLED", "REFUNDED"];

export function portal(page: Page): PortalPages {
  const projectIdFromUrl = () => new URL(page.url()).pathname.match(PROJECT_PATH)?.[1] ?? null;

  const self: PortalPages = {
    async openProject(name) {
      if (projectIdFromUrl() && !name) return;
      if (new URL(page.url()).pathname !== "/dashboard") await page.goto("/dashboard");
      // Each dashboard section is a labelled region whose rows are links to /project/{id}.
      const links = page.getByRole("region").getByRole("link", name ? { name: new RegExp(escape(name), "i") } : undefined);
      await links.first().waitFor();
      const count = await links.count();
      if (count !== 1) throw new Error(`openProject(${name ?? ""}): expected exactly one matching project, found ${count}`);
      await links.click();
      await page.waitForURL((url) => PROJECT_PATH.test(url.pathname));
    },
    async currentProjectId() {
      const id = projectIdFromUrl();
      if (!id) throw new Error(`no project is open (at ${page.url()})`);
      return id;
    },
    async projectStatus() {
      // project-hub.tsx: the status badge sits right before the project title (the page's only h1).
      const title = page.getByRole("heading", { level: 1 });
      await title.waitFor();
      const label = (await title.locator("xpath=preceding-sibling::span[1]").innerText()).trim();
      const status = LABEL_TO_STATUS[label];
      if (!status) throw new Error(`unknown project status badge "${label}"`);
      return status;
    },
    async currentTurn(): Promise<Turn> {
      // The Next hub has no explicit turn indicator; it follows the dashboard grouping of the shown status.
      const status = await self.projectStatus();
      return CLIENT_TURN.includes(status) ? "client" : NOBODY_TURN.includes(status) ? "none" : "studio";
    },
  };
  return self;
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
