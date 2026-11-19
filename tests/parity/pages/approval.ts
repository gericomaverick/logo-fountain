// Concept approval (C-12; story 0.8c). Redesign: concept detail with a primary "Approve this concept" and a
// confirmation dialog with the acknowledgement checkbox (ux-design.md §7 "Approval", J3).
import type { Page } from "@playwright/test";
import { resolveTarget } from "../adapters/target";

export interface ApprovalPages {
  /** Opens concept `number` of the open project (portal.openProject first). */
  openConcept(number: number): Promise<void>;
  /**
   * Approves the open concept through its confirmation step, ticking the acknowledgement. Reports whether the
   * final confirm was refused until the acknowledgement was given. Resolves once the app confirms the approval.
   */
  approveOpenConcept(): Promise<{ confirmBlockedUntilAcknowledged: boolean }>;
}

export async function approvalPagesFor(page: Page): Promise<ApprovalPages> {
  const impl = resolveTarget() === "next" ? await import("./next/approval") : await import("./laravel/approval");
  return impl.approval(page);
}
