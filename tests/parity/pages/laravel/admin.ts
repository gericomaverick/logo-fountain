// Laravel admin page objects: typed stubs until the Epic 7 screens exist. Each throws naming the story that
// builds the screen (epics.md Epic 7). Accessible locators first; data-testid is allowed here (pages/README.md).
import type { Page } from "@playwright/test";
import type { AdminPages } from "../admin";

const todo = (what: string, story: string) => (): never => {
  throw new Error(`Laravel page object admin.${what}: not implemented (story ${story})`);
};

export function createAdmin(_page: Page): AdminPages {
  return {
    queue: todo("queue", "7.1"),
    openProject: todo("openProject", "7.2"),
    projectStatus: todo("projectStatus", "7.2"),
    changeStatus: todo("changeStatus", "7.3"),
    uploadConcept: todo("uploadConcept", "7.5a"),
    concepts: todo("concepts", "7.5a"),
    deleteConcept: todo("deleteConcept", "7.6"),
    uploadFinals: todo("uploadFinals", "7.8a"),
    downloadFinals: todo("downloadFinals", "7.8b"),
    retryFinalNotification: todo("retryFinalNotification", "7.8b"),
    allowances: todo("allowances", "7.2"),
    overrideEntitlements: todo("overrideEntitlements", "7.9"),
    resetProject: todo("resetProject", "7.9"),
    auditLog: todo("auditLog", "7.10"),
    health: todo("health", "7.11"),
    reprocessCheckout: todo("reprocessCheckout", "7.2 / 5.6"),
  };
}
