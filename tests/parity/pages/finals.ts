// Final files (C-13; story 0.8c). Redesign: the Overview turn banner "Your final files are ready" + "Download ZIP",
// and the Files tab (ux-design.md §5.1, §7 "Final files", J5). Either place satisfies this interface.
import type { Page } from "@playwright/test";
import { resolveTarget } from "../adapters/target";

export type DownloadedFile = { filename: string; bytes: Buffer };

export interface FinalsPages {
  /** Whether the open project currently offers its final files for download. */
  finalFilesOffered(): Promise<boolean>;
  /** Downloads the open project's final files with the one action the screen offers. Returns the saved file. */
  downloadFinalFiles(): Promise<DownloadedFile>;
}

export async function finalsPagesFor(page: Page): Promise<FinalsPages> {
  const impl = resolveTarget() === "next" ? await import("./next/finals") : await import("./laravel/finals");
  return impl.finals(page);
}
