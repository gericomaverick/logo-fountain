// Next.js final files: app/project/[id]/project-hub.tsx:401-412 (the "final deliverables are ready" card).
// The button POSTs /api/projects/{id}/finals and window.open()s the signed storage URL in a new tab (:314),
// which the browser turns into a download (Content-Disposition: attachment, lib/storage/r2.ts:32).
import { readFile } from "node:fs/promises";
import type { Download, Page } from "@playwright/test";
import type { FinalsPages } from "../finals";
import { projectIdIn } from "./project-areas";

export function finals(page: Page): FinalsPages {
  const button = page.getByRole("button", { name: "Download final ZIP" });
  const openHub = async () => {
    const id = projectIdIn(page);
    if (new URL(page.url()).pathname !== `/project/${id}`) await page.goto(`/project/${id}`);
    else await page.reload();
    await page.getByRole("heading", { level: 1 }).waitFor();
  };
  return {
    async finalFilesOffered() {
      await openHub();
      return button.isVisible();
    },
    async downloadFinalFiles() {
      await openHub();
      // Chromium reports a download from a window.open() tab on the opener, before the tab itself appears.
      // Listen on both so either reporting order works.
      let tab: Page | null = null;
      const started = new Promise<Download>((resolve) => {
        page.once("download", resolve);
        page.context().once("page", (p) => { tab = p; p.once("download", resolve); });
      });
      await page.waitForLoadState("networkidle");
      await button.click();
      const download = await started;
      const path = await download.path();
      const bytes = await readFile(path);
      const filename = download.suggestedFilename();
      await (tab as Page | null)?.close().catch(() => undefined);
      return { filename, bytes };
    },
  };
}
