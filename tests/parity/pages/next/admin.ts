// Next.js admin screens: app/admin/page.tsx (queue), app/admin/projects/[id]/page.tsx (overview: polls every 2 s),
// …/concepts/page.tsx (concepts manager), …/audit/page.tsx (polls every 2.5 s), app/admin/health/page.tsx.
// Where the Next UI has NO control for an action the API offers, the object sends that same request from the
// signed-in browser session (cookies + Origin, like the page's own fetch) and reloads; each such place says so.
import type { Dialog, Page, Response } from "@playwright/test";
import type {
  AdminAllowance, AdminAuditEntry, AdminConcept, AdminHealthArea, AdminOutcome, AdminPages, AdminQueueRow, AdminQueueSection, AdminSection,
} from "../admin";
import type { ProjectStatus } from "../index";

const SECTIONS: Record<string, AdminQueueSection> = { "Needs action": "needs-action", "In progress": "in-progress", Delivered: "done" };
/** Badge copy -> state (lib/project-state-machine.ts:39); "Approved" is a display-only override (project-status-badge.tsx:24). */
const LABEL_TO_STATUS: Record<string, ProjectStatus> = {
  "Awaiting brief": "AWAITING_BRIEF", "Brief submitted": "BRIEF_SUBMITTED", "In design": "IN_DESIGN",
  "Concepts ready": "CONCEPTS_READY", "Revisions in progress": "REVISIONS_IN_PROGRESS", "Awaiting approval": "AWAITING_APPROVAL",
  Approved: "AWAITING_APPROVAL", "Final files ready": "FINAL_FILES_READY", Delivered: "DELIVERED", "On hold": "ON_HOLD",
  Cancelled: "CANCELLED", Refunded: "REFUNDED",
};
const PROJECT_PATH = /^\/admin\/projects\/([0-9a-f-]{36})(?:\/|$)/i;
const NOT_OFFERED = (what: string) => ({ done: false as const, message: `not offered: ${what}` });

export function createAdmin(page: Page): AdminPages {
  const projectId = () => {
    const id = new URL(page.url()).pathname.match(PROJECT_PATH)?.[1];
    if (!id) throw new Error(`no admin project is open (at ${page.url()})`);
    return id;
  };
  const isPath = (path: string) => new URL(page.url()).pathname === path;
  const go = async (path: string) => {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
  };
  const properties = () => page.getByRole("complementary", { name: "Project properties" });
  const overviewLoaded = async () => {
    // The overview renders before its first poll; the status badge reads "UNKNOWN" until the snapshot is in.
    await properties().waitFor();
    await page.waitForFunction(() => {
      const dt = [...document.querySelectorAll("aside dt")].find((el) => el.textContent?.trim() === "Status");
      const text = dt?.nextElementSibling?.textContent?.trim();
      return Boolean(text && text !== "UNKNOWN");
    });
  };
  const ensureSection = async (section: AdminSection) => {
    const id = projectId();
    const path = section === "overview" || section === "files" ? `/admin/projects/${id}` : `/admin/projects/${id}/${section}`;
    if (!isPath(path)) await go(path);
    if (path === `/admin/projects/${id}`) await overviewLoaded();
  };
  /** Clicks, waits for the page's own request and reports the app's answer (error copy from the alert/notice). */
  const act = async (click: () => Promise<void>, match: (res: Response) => boolean): Promise<{ res: Response; body: any }> => {
    const [res] = await Promise.all([page.waitForResponse((r) => r.request().method() !== "GET" && match(r)), click()]);
    const body = await res.json().catch(() => null);
    return { res, body };
  };
  const alertText = async () => {
    const alert = page.getByRole("alert").first();
    await alert.waitFor({ timeout: 5_000 }).catch(() => {});
    return (await alert.isVisible()) ? (await alert.innerText()).trim() : "";
  };
  /** No Next control: the same request from the signed-in browser session, then a reload. */
  const viaSession = async (method: "POST" | "DELETE" | "PATCH", path: string, data?: unknown): Promise<AdminOutcome> => {
    const origin = new URL(page.url()).origin;
    const res = await page.request.fetch(path, { method, data, headers: { Origin: origin } });
    const body = await res.json().catch(() => null);
    await page.reload();
    await page.waitForLoadState("networkidle");
    return res.ok() ? { done: true } : { done: false, message: body?.error?.message ?? `HTTP ${res.status()}` };
  };
  const adminTools = async () => {
    const summary = page.getByText("Admin tools", { exact: true });
    const details = properties().locator("details");
    if (!(await details.evaluate((el) => (el as HTMLDetailsElement).open))) await summary.click();
  };
  const finalsSection = () => page.locator("#final-deliverables-upload");

  const self: AdminPages = {
    async queue() {
      if (!isPath("/admin")) await go("/admin");
      else { await page.reload(); await page.waitForLoadState("networkidle"); }
      const rows: AdminQueueRow[] = [];
      for (const [name, section] of Object.entries(SECTIONS)) {
        const region = page.getByRole("region", { name, exact: true });
        await region.waitFor();
        for (const li of await region.locator("li").all()) {
          // app/admin/page.tsx:162-221. The two "New" chips have no accessible name; the message one is
          // text-accent with MessageIcon, the concepts one text-success with ImageIcon (:194-205).
          const row = await li.evaluate((el) => {
            const href = el.querySelector("a")?.getAttribute("href") ?? "";
            const lines = [...el.querySelectorAll(":scope > div:first-of-type > p")].map((p) => p.textContent?.trim() ?? "");
            const chips = [...el.querySelectorAll("span.rounded-full")].map((s) => ({ text: s.textContent?.trim() ?? "", cls: s.className }));
            return { href, lines, chips };
          });
          const feedback = row.chips.find((c) => /^\d+ feedback$/.test(c.text));
          rows.push({
            projectId: row.href.match(/\/admin\/projects\/([0-9a-f-]{36})/i)?.[1] ?? "",
            title: row.lines[0] ?? "",
            section,
            pendingFeedback: feedback ? Number.parseInt(feedback.text, 10) : 0,
            newMessages: row.chips.some((c) => c.text === "New" && c.cls.includes("text-accent")),
            newConcepts: row.chips.some((c) => c.text === "New" && c.cls.includes("text-success")),
            stuckReason: row.lines[2] || null,
          });
        }
      }
      return rows;
    },
    async openProject(id, section = "overview") {
      await go(section === "overview" || section === "files" ? `/admin/projects/${id}` : `/admin/projects/${id}/${section}`);
      if (section === "overview" || section === "files") await overviewLoaded();
    },
    async projectStatus() {
      await ensureSection("overview");
      const label = (await properties().locator("dt", { hasText: /^Status$/ }).locator("xpath=following-sibling::dd[1]").innerText()).trim();
      const status = LABEL_TO_STATUS[label];
      if (!status) throw new Error(`unknown project status badge "${label}"`);
      return status;
    },
    async changeStatus(action, reason) {
      await ensureSection("overview");
      const id = projectId();
      if (action === "resume") {
        // page.tsx:365-373: shown only while ON_HOLD; the reason comes from window.prompt.
        const button = page.getByRole("button", { name: "Resume recorded phase" });
        if (!(await button.isVisible())) return NOT_OFFERED("resume (the project is not on hold)");
        page.once("dialog", (dialog) => void dialog.accept(reason));
        const { res } = await act(() => button.click(), (r) => r.url().endsWith(`/api/admin/projects/${id}/status`));
        return res.ok() ? { done: true } : { done: false, message: await alertText() };
      }
      // No hold or cancel control on the Next overview (only Resume, page.tsx:365); the API is the only way.
      return viaSession("POST", `/api/admin/projects/${id}/status`, { status: action === "hold" ? "ON_HOLD" : "CANCELLED", reason });
    },
    async uploadConcept(file, options = {}) {
      const id = projectId();
      // Always from a fresh concepts page: the request key lives in sessionStorage (lib/concept-upload-key.ts:12),
      // so a retry after a lost response re-sends the same key, exactly like an admin reloading and retrying.
      await go(`/admin/projects/${id}/concepts`);
      const form = page.locator("form").filter({ has: page.getByRole("button", { name: /Upload concept|Uploading/ }) });
      await form.locator('input[type="file"]').setInputFiles(file); // its <label> isn't associated (concepts/page.tsx:238)
      if (options.notes !== undefined) await form.locator("textarea").fill(options.notes);
      const url = `/api/admin/projects/${id}/concepts`;
      if (options.loseResponse) {
        let processed!: () => void;
        const done = new Promise<void>((resolve) => { processed = resolve; });
        await page.route((u) => u.pathname === url, async (route) => {
          if (route.request().method() !== "POST") return route.continue();
          await route.fetch(); // the app gets and commits the upload…
          await route.abort("connectionreset"); // …but its answer never reaches the browser
          processed();
        }, { times: 1 });
        await form.getByRole("button", { name: "Upload concept" }).click();
        await done;
        await page.unroute((u) => u.pathname === url);
        return { outcome: "unconfirmed" };
      }
      const { res, body } = await act(() => form.getByRole("button", { name: "Upload concept" }).click(), (r) => new URL(r.url()).pathname === url);
      if (!res.ok()) return { outcome: "refused", message: await alertText() };
      const notice = page.getByText(/^Concept #\d+ uploaded and published\.$/); // concepts/page.tsx:124
      await notice.waitFor();
      const number = Number((await notice.innerText()).match(/#(\d+)/)?.[1]);
      if (number !== body?.concept?.number) throw new Error(`upload notice says #${number}, the app answered ${JSON.stringify(body)}`);
      return { outcome: "published", conceptNumber: number };
    },
    async concepts() {
      await ensureSection("concepts");
      await page.getByText("Loading…").waitFor({ state: "hidden" });
      const cards = page.getByRole("article").filter({ hasText: /Concept #\d+ · v\d+/ });
      const out: AdminConcept[] = [];
      for (const card of await cards.all()) {
        const title = (await card.getByText(/^Concept #\d+ · v\d+$/).innerText()).match(/#(\d+) · v(\d+)/)!;
        // The status chip is "Approved"/"Published"/"Archived", or the raw status for others (concepts/page.tsx:42-47).
        const chip = (await card.locator("span.rounded-full").first().innerText()).trim().toLowerCase();
        out.push({ number: Number(title[1]), version: Number(title[2]), status: chip as AdminConcept["status"] });
      }
      return out.sort((a, b) => a.number - b.number);
    },
    async deleteConcept(conceptNumber) {
      await ensureSection("concepts");
      // No delete control anywhere in the Next admin (finding: concepts/page.tsx has none); the card's anchor id
      // carries the concept ID (concepts/page.tsx:260), then the API is the only way.
      const card = page.getByRole("article").filter({ hasText: new RegExp(`Concept #${conceptNumber} · v\\d+`) });
      const conceptId = (await card.getAttribute("id"))?.replace(/^concept-/, "");
      if (!conceptId) return NOT_OFFERED(`concept #${conceptNumber} isn't listed`);
      return viaSession("DELETE", `/api/admin/projects/${projectId()}/concepts/${conceptId}`);
    },
    async uploadFinals(file) {
      await ensureSection("files");
      const section = finalsSection();
      const input = section.getByLabel("Final ZIP file");
      if (!(await input.isVisible())) return NOT_OFFERED("final upload (no approved concept)");
      await input.setInputFiles(file);
      const id = projectId();
      const { res } = await act(() => section.getByRole("button", { name: "Upload and publish" }).click(), (r) => new URL(r.url()).pathname === `/api/admin/projects/${id}/finals`);
      if (!res.ok()) return { done: false, message: await alertText() };
      const notice = section.getByText("Final deliverables published");
      await notice.waitFor();
      return { done: true, message: (await alertText()) || undefined };
    },
    async downloadFinals() {
      await ensureSection("files");
      const id = projectId();
      // page.tsx:230-244: POST …/finals/download, then window.open(signed URL).
      const popup = page.waitForEvent("popup").catch(() => null);
      const { res, body } = await act(() => page.getByRole("button", { name: "Download current ZIP" }).click(), (r) => new URL(r.url()).pathname === `/api/admin/projects/${id}/finals/download`);
      if (!res.ok() || typeof body?.url !== "string") throw new Error(`final download failed: ${res.status()} ${JSON.stringify(body)}`);
      await (await popup)?.close().catch(() => {});
      return { url: body.url };
    },
    async retryFinalNotification() {
      await ensureSection("files");
      const id = projectId();
      const button = page.getByRole("button", { name: "Send/retry client notification" });
      if (!(await button.isVisible())) return NOT_OFFERED("notification retry");
      const { res } = await act(() => button.click(), (r) => new URL(r.url()).pathname === `/api/admin/projects/${id}/finals/notify`);
      if (!res.ok()) return { done: false, message: await alertText() };
      await finalsSection().getByText("Final deliverables published").waitFor();
      return { done: true };
    },
    async allowances() {
      await ensureSection("overview");
      const read = async (label: "Concepts" | "Revisions"): Promise<AdminAllowance> => {
        const meter = page.getByRole("meter", { name: new RegExp(`^${label}:`) });
        if (await meter.count()) {
          // components/allowances.tsx:57: "<label>: X used, Y pending, Z left", aria-valuemax = limit.
          const name = (await meter.getAttribute("aria-label")) ?? "";
          const [, used, reserved] = name.match(/(\d+) used, (\d+) pending/) ?? [];
          return { limit: Number(await meter.getAttribute("aria-valuemax")), used: Number(used), reserved: Number(reserved) };
        }
        const card = properties().locator("div.py-3").filter({ hasText: new RegExp(`^${label}`) });
        if (await card.getByText("Unlimited", { exact: true }).count()) {
          return { limit: null, used: Number(await card.locator(".portal-display").innerText()), reserved: 0 };
        }
        throw new Error(`allowance ${label}: no meter (limit 0 or over 12 is not read by this object yet)`);
      };
      return { concepts: await read("Concepts"), revisions: await read("Revisions") };
    },
    async overrideEntitlements(limits, reason) {
      await ensureSection("overview");
      await adminTools();
      if (limits.concepts !== undefined) await page.getByLabel("Concept limit").fill(limits.concepts === null ? "" : String(limits.concepts));
      if (limits.revisions !== undefined) await page.getByLabel("Revision limit").fill(limits.revisions === null ? "" : String(limits.revisions));
      await page.getByLabel(/^Reason \(required/).fill(reason);
      const id = projectId();
      const { res } = await act(() => page.getByRole("button", { name: "Save entitlement override" }).click(), (r) => new URL(r.url()).pathname === `/api/admin/projects/${id}/entitlements`);
      return res.ok() ? { done: true } : { done: false, message: await alertText() };
    },
    async resetProject() {
      await ensureSection("overview");
      await adminTools();
      // page.tsx:619-620: two window.confirm prompts.
      const accept = (dialog: Dialog) => void dialog.accept();
      page.on("dialog", accept);
      try {
        const id = projectId();
        const { res } = await act(() => page.getByRole("button", { name: "Reset project (clean slate)" }).click(), (r) => new URL(r.url()).pathname === `/api/admin/projects/${id}/reset`);
        return res.ok() ? { done: true } : { done: false, message: await alertText() };
      } finally {
        page.off("dialog", accept);
      }
    },
    async auditLog() {
      await ensureSection("audit");
      const region = page.getByRole("region", { name: "Audit events" });
      await region.getByText("Loading…").waitFor({ state: "hidden" });
      const entries: AdminAuditEntry[] = [];
      for (const li of await region.locator("li").all()) {
        const p = li.locator("p");
        const actor = (await p.nth(2).innerText()).trim();
        entries.push({ type: (await p.nth(0).innerText()).trim(), summary: (await p.nth(1).innerText()).trim(), actorEmail: actor === "System" ? null : actor });
      }
      return entries;
    },
    async health() {
      await go("/admin/health");
      await page.getByText("Running checks…").waitFor({ state: "hidden" });
      const status = page.getByText(/^Status:/);
      await status.waitFor();
      const checks: Array<{ label: string; area: AdminHealthArea; passed: boolean }> = [];
      for (const item of await page.locator("main section ul > li").all()) {
        const line = (await item.locator("p").first().innerText()).trim(); // "✅ label" / "❌ label" (health/page.tsx:111)
        const label = line.replace(/^(✅|❌)\s*/, "");
        checks.push({ label, area: areaOf(label), passed: line.startsWith("✅") });
      }
      return { ok: (await status.innerText()).includes("PASS"), checks };
    },
    async reprocessCheckout(sessionId) {
      await ensureSection("overview");
      // page.tsx:510-521: only on a stuck project; the input has no label, only a placeholder.
      const input = page.getByPlaceholder("cs_test_...");
      if (!(await input.isVisible())) return NOT_OFFERED("reprocess (the project is not stuck)");
      await input.fill(sessionId);
      const { res } = await act(() => page.getByRole("button", { name: "Reprocess checkout session" }).click(), (r) => new URL(r.url()).pathname === "/api/admin/checkout/reprocess");
      return res.ok() ? { done: true } : { done: false, message: await alertText() };
    },
  };
  return self;
}

/** health/route.ts labels: env checks are the variable names; then "Database connectivity", "Stripe …", "Private R2 bucket: …". */
function areaOf(label: string): AdminHealthArea {
  if (/^[A-Z0-9_]+$/.test(label) || /^Public site URL$|allowlist/i.test(label)) return "config";
  if (/database/i.test(label)) return "database";
  if (/stripe/i.test(label)) return "payments";
  if (/bucket|storage/i.test(label)) return "storage";
  if (/postmark|email/i.test(label)) return "email";
  return "config";
}

