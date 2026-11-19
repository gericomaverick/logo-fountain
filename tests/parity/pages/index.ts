// Journeys get page objects ONLY through this module, so they never branch on the target.
// Each target implements the same interfaces in pages/next/* and pages/laravel/*.
// Interfaces describe what a person does and sees (DV-UX, 02-test-strategy.md §1), never how a screen is built:
// each must also be expressible on the redesigned Laravel IA (ux-design.md §5), e.g. openProject() works
// whether the person lands on a project list or straight on their only project.
import type { Page } from "@playwright/test";
import { resolveTarget } from "../adapters/target";

export type PackageCode = "essential" | "professional" | "complete";
/** Persisted project states (apps/web/src/lib/project-state-machine.ts:39). */
export type ProjectStatus =
  | "AWAITING_BRIEF" | "BRIEF_SUBMITTED" | "IN_DESIGN" | "CONCEPTS_READY" | "REVISIONS_IN_PROGRESS" | "AWAITING_APPROVAL"
  | "FINAL_FILES_READY" | "DELIVERED" | "ON_HOLD" | "CANCELLED" | "REFUNDED";
/** Whose move it is: the customer's, the studio's, or nobody's (the project is finished or stopped). */
export type Turn = "client" | "studio" | "none";
export type Buyer = { email: string; firstName?: string; lastName?: string };

export interface AuthPages {
  /** Signs in with email and password through the sign-in screen. Resolves once signed in (off the auth screens). */
  signIn(email: string, password: string): Promise<void>;
  /** Asks for a sign-in link by email. Resolves once the app has acknowledged the request. */
  requestMagicLink(email: string): Promise<void>;
  /** Opens a sign-in link from an email, confirms explicitly (A-05: no sign-in on page load), resolves once signed in. */
  confirmMagicLink(link: string): Promise<void>;
  /** Opens a setup or reset link from an email and sets `password`. Resolves once the app accepted it. */
  setPasswordFromLink(link: string, password: string): Promise<void>;
}

export interface CheckoutPages {
  /** Starts buying `pkg` the way the marketing site links to it. Resolves on the (fake) Stripe payment page. */
  start(pkg: PackageCode): Promise<void>;
  /** Pays on the stripe-fake hosted page (shared infra, same on both targets). Resolves back on the app. */
  payOnFakeStripe(buyer: Buyer): Promise<{ sessionId: string }>;
  /** Waits on the post-payment page until it reports the purchase confirmed (it polls the app meanwhile). */
  waitForConfirmation(timeoutMs?: number): Promise<void>;
}

export interface PortalPages {
  /** Opens a project: by (part of) its title, or the only one when `name` is omitted. No-op if already on it. */
  openProject(name?: string): Promise<void>;
  /** The ID of the project being viewed (throws if no project is open). */
  currentProjectId(): Promise<string>;
  /** The project status the screen shows for the open project. */
  projectStatus(): Promise<ProjectStatus>;
  /** Whose turn the screen says it is for the open project. */
  currentTurn(): Promise<Turn>;
}

export interface PageObjects {
  readonly page: Page;
  readonly auth: AuthPages;
  readonly checkout: CheckoutPages;
  readonly portal: PortalPages;
}

export async function pagesFor(page: Page): Promise<PageObjects> {
  const target = resolveTarget();
  const impl = target === "next" ? await import("./next/index") : await import("./laravel/index");
  return impl.create(page);
}

// Story 0.8c: approval, finals, messages, settings/account (each file has its interface and resolver).
export { approvalPagesFor, type ApprovalPages } from "./approval";
export { finalsPagesFor, type DownloadedFile, type FinalsPages } from "./finals";
export { messagesPagesFor, type MessagesPages, type ThreadEntry } from "./messages";
export { accountPagesFor, settingsPagesFor, type AccountPages, type InvoiceRow, type SettingsPages } from "./settings";
