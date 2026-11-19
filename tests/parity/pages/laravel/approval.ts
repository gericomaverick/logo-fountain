// Laravel concept approval: typed stubs until the concepts gallery (story 6.7) and approval (story 6.9) exist.
import type { Page } from "@playwright/test";
import type { ApprovalPages } from "../approval";

const todo = (what: string, story: string) => (): never => {
  throw new Error(`Laravel page object approval.${what}: not implemented (story ${story})`);
};

export function approval(_page: Page): ApprovalPages {
  return { openConcept: todo("openConcept", "6.7"), approveOpenConcept: todo("approveOpenConcept", "6.9") };
}
