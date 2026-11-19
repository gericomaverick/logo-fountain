// Concepts, feedback and allowance page-object interfaces (story 0.8b). Implementations: pages/next/concepts.ts,
// pages/laravel/areas-0-8b.ts. They fit both the Next screens and the redesigned Laravel ones (ux-design.md §5.1
// Concepts tab with a "new" dot, §7 "Concepts arrive" and "Feedback and revision": one composer, comment vs revision).

/** One allowance as the person sees it. `pending` = reserved by a revision request not yet delivered (K-14). */
export type Allowance = { limit: number; used: number; pending: number; left: number };
export type AllowanceKind = "concepts" | "revisions";
/** A concept as the gallery lists it. */
export type ConceptCard = { number: number; version: number };
/** One entry of a concept's feedback thread. */
export type ThreadEntry = { kind: "comment" | "revision"; body: string; status?: string };

export interface ConceptPages {
  /** Opens the open project's overview fresh and says whether it flags new concepts (Next: "New" on Concepts; Laravel: the tab dot). */
  hasNewConcepts(): Promise<boolean>;
  /** Opens the open project's concepts gallery and returns what it lists. Visiting it marks the concepts seen. */
  openGallery(): Promise<ConceptCard[]>;
  /** Opens concept number `n` from the gallery (call openGallery first). */
  openConcept(n: number): Promise<void>;
  /** Waits for the open concept's main image to load and returns its URL and natural size. */
  shownImage(): Promise<{ src: string; naturalWidth: number; naturalHeight: number }>;
  /** Sends a free comment on the open concept (doesn't use an allowance). Resolves once it is in the thread. */
  comment(text: string): Promise<void>;
  /** Requests a revision of the open concept (uses one revision). Resolves once the app has accepted it and it is in the thread. */
  requestRevision(text: string): Promise<void>;
  /** The open concept's feedback thread, oldest first. */
  thread(): Promise<ThreadEntry[]>;
  /** The allowance shown for the open project (opens its overview). */
  allowance(kind: AllowanceKind): Promise<Allowance>;
}
