// Next.js concept approval: app/project/[id]/concepts/page.tsx (gallery) and
// app/project/[id]/concept/[conceptId]/page.tsx (detail, approve dialog with lib/final-approval.ts copy).
import type { Page } from "@playwright/test";
import type { ApprovalPages } from "../approval";

/** The project ID from any /project/{id}/… URL. */
export function projectIdIn(page: Page): string {
  const id = new URL(page.url()).pathname.match(/^\/project\/([0-9a-f-]{36})(\/|$)/i)?.[1];
  if (!id) throw new Error(`no project is open (at ${page.url()})`);
  return id;
}

export function approval(page: Page): ApprovalPages {
  return {
    async openConcept(number) {
      const id = projectIdIn(page);
      await page.goto(`/project/${id}/concepts`);
      // concepts/page.tsx:129 each card is a link "Concept #N · vX …".
      await page.getByRole("link", { name: new RegExp(`Concept #${number}\\b`) }).click();
      await page.waitForURL((url) => url.pathname.startsWith(`/project/${id}/concept/`));
    },
    async approveOpenConcept() {
      let blocked = false;
      const confirm = page.getByRole("button", { name: "Yes, approve this concept" }); // final-approval.ts:5
      await page.waitForLoadState("networkidle");
      await page.getByRole("button", { name: "Approve concept" }).click(); // concept page :390
      await confirm.waitFor();
      blocked = await confirm.isDisabled(); // :424 canConfirmFinalApproval(acknowledged)
      await page.getByRole("checkbox", { name: "I understand this approval is final and I want to continue." }).check();
      await confirm.click();
      await page.getByText("Concept approved — thank you!").waitFor(); // :285 success notice after the 200
      return { confirmBlockedUntilAcknowledged: blocked };
    },
  };
}
