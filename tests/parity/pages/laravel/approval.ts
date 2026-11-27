// Laravel concept approval (story 6.9 UI half): Pages/Project/Concept.tsx renders Components/project/ConceptApproval.tsx,
// "Approve this concept" opening a ConfirmDialog (APPROVAL_COPY in resources/js/lib/concepts.ts) whose confirm stays
// disabled-with-reason (aria-disabled, Components/ui/Button.tsx) until the acknowledgement is ticked. The way into a
// concept is the gallery page object (areas-0-8b.ts, story 6.7).
import type { Page } from "@playwright/test";
import type { ApprovalPages } from "../approval";
import { areas08b } from "./areas-0-8b";

export function approval(page: Page): ApprovalPages {
  const gallery = areas08b(page).concepts;
  return {
    async openConcept(number) {
      await gallery.openGallery();
      await gallery.openConcept(number);
    },
    async approveOpenConcept() {
      await page.getByRole("button", { name: "Approve this concept", exact: true }).click();
      const dialog = page.getByRole("dialog", { name: "Ready to lock this in?" });
      const confirm = dialog.getByRole("button", { name: "Yes, approve this concept" });
      await confirm.waitFor();
      const blocked = (await confirm.getAttribute("aria-disabled")) === "true" || (await confirm.isDisabled());
      await dialog.getByRole("checkbox", { name: "I understand this approval is final and I want to continue." }).check();
      const posted = page.waitForResponse((r) => r.request().method() === "POST" && new URL(r.url()).pathname.endsWith("/approve"));
      await confirm.click();
      const res = await posted;
      if (res.status() !== 200) throw new Error(`approve failed: ${res.status()} ${await res.text()}`);
      await page.getByText("This concept is approved", { exact: true }).waitFor(); // ConceptApproval.tsx approved state after the reload
      return { confirmBlockedUntilAcknowledged: blocked };
    },
  };
}
