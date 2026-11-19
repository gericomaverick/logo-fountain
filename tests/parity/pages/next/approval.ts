// Next.js concept approval: app/project/[id]/concept/[conceptId]/page.tsx (detail, approve dialog with
// lib/final-approval.ts copy). The way into a concept is 0.8b's gallery page object (pages/next/concepts.ts).
import type { Page } from "@playwright/test";
import type { ApprovalPages } from "../approval";
import { concepts } from "./concepts";

export function approval(page: Page): ApprovalPages {
  const gallery = concepts(page);
  return {
    async openConcept(number) {
      await gallery.openGallery();
      await gallery.openConcept(number);
    },
    async approveOpenConcept() {
      const confirm = page.getByRole("button", { name: "Yes, approve this concept" }); // final-approval.ts:5
      await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => {}); // bounded: polling pages never go idle (story 0.9)
      await page.getByRole("button", { name: "Approve concept" }).click(); // concept page :390
      await confirm.waitFor();
      const blocked = await confirm.isDisabled(); // :424 canConfirmFinalApproval(acknowledged)
      await page.getByRole("checkbox", { name: "I understand this approval is final and I want to continue." }).check();
      await confirm.click();
      await page.getByText("Concept approved — thank you!").waitFor(); // :285 success notice after the 200
      return { confirmBlockedUntilAcknowledged: blocked };
    },
  };
}
