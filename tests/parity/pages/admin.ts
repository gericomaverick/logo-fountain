// Admin page objects (story 0.8d): what an admin does and sees, never how a screen is built (DV-UX).
// Every method must also be expressible on the redesigned admin workspace (ux-design.md §5.2, §7, J6/J7):
// a Queue (needs action / in progress / done, each row saying why), a project workspace with sections
// (Overview, Concepts, Messages, Brief, Files, Audit), an Actions area for hold/cancel/resume, overrides and
// reset, a Payment card with Reprocess, and Health. Implementations: pages/next/admin.ts, pages/laravel/admin.ts.
import type { Page } from "@playwright/test";
import { resolveTarget } from "../adapters/target";
import type { ProjectStatus } from "./index";

/** Queue groups. Next calls the last one "Delivered"; the redesign calls it "Done". */
export type AdminQueueSection = "needs-action" | "in-progress" | "done";
export type AdminQueueRow = {
  projectId: string;
  /** The row's title as shown (brand name when the brief has one). */
  title: string;
  section: AdminQueueSection;
  /** Why the row needs attention (UX J6: "each row says why"). */
  pendingFeedback: number;
  newMessages: boolean;
  newConcepts: boolean;
  /** The stuck-order reason shown on the row, or null. */
  stuckReason: string | null;
};
export type AdminSection = "overview" | "concepts" | "messages" | "brief" | "files" | "audit";
export type AdminStatusAction = "hold" | "cancel" | "resume";
/** `done: false` covers both "the app refused it" (message from the app) and "the screen doesn't offer it". */
export type AdminOutcome = { done: true; message?: string } | { done: false; message: string };
export type UploadFile = { name: string; mimeType: string; buffer: Buffer };
export type ConceptUploadOutcome =
  | { outcome: "published"; conceptNumber: number }
  /** The response never reached the browser (network loss after the app received the upload). */
  | { outcome: "unconfirmed" }
  | { outcome: "refused"; message: string };
export type AdminConcept = { number: number; version: number; status: "draft" | "published" | "approved" | "archived" | "deleted" };
/** `limit: null` = unlimited. */
export type AdminAllowance = { limit: number | null; used: number; reserved: number };
export type AdminAuditEntry = { type: string; actorEmail: string | null; summary: string };
export type AdminHealthArea = "config" | "database" | "payments" | "storage" | "email";
export type AdminHealthReport = { ok: boolean; checks: Array<{ label: string; area: AdminHealthArea; passed: boolean }> };

export interface AdminPages {
  /** The queue as shown, in display order (needs action first). */
  queue(): Promise<AdminQueueRow[]>;
  /** Opens a project's workspace on `section` (default overview). */
  openProject(projectId: string, section?: AdminSection): Promise<void>;
  /** The status the open project's workspace shows. */
  projectStatus(): Promise<ProjectStatus>;
  /** Hold, cancel or resume the open project with a reason. */
  changeStatus(action: AdminStatusAction, reason: string): Promise<AdminOutcome>;
  /**
   * Uploads a new concept to the open project. `loseResponse` makes the network drop the app's answer (the
   * app still receives and processes the upload), to prove a retry of the same upload is idempotent.
   */
  uploadConcept(file: UploadFile, options?: { notes?: string; loseResponse?: boolean }): Promise<ConceptUploadOutcome>;
  /** Every concept the concepts section lists for the open project, by number. */
  concepts(): Promise<AdminConcept[]>;
  deleteConcept(conceptNumber: number): Promise<AdminOutcome>;
  /** Uploads (or replaces) the final ZIP of the open project. */
  uploadFinals(file: UploadFile): Promise<AdminOutcome>;
  /** Asks for the current final ZIP; resolves with the (signed) link the browser was sent to. */
  downloadFinals(): Promise<{ url: string }>;
  /** Sends or retries the client's "final files ready" notification. */
  retryFinalNotification(): Promise<AdminOutcome>;
  allowances(): Promise<{ concepts: AdminAllowance; revisions: AdminAllowance }>;
  /** Overrides the limits given (null = unlimited; omitted = unchanged) with a reason. */
  overrideEntitlements(limits: { concepts?: number | null; revisions?: number | null }, reason: string): Promise<AdminOutcome>;
  /** Clean-slate reset of the open project, confirming every prompt. */
  resetProject(): Promise<AdminOutcome>;
  /** The open project's audit log, newest first. */
  auditLog(): Promise<AdminAuditEntry[]>;
  /** Runs the health checks and reads the result. */
  health(): Promise<AdminHealthReport>;
  /** Reprocesses a Checkout Session from the open (stuck) project's payment/recovery area. */
  reprocessCheckout(sessionId: string): Promise<AdminOutcome>;
}

export async function adminPagesFor(page: Page): Promise<AdminPages> {
  const impl = resolveTarget() === "next" ? await import("./next/admin") : await import("./laravel/admin");
  return impl.createAdmin(page);
}
