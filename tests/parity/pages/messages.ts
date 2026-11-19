// Project messages (C-14; story 0.8c). Redesign: the project's Messages tab, a chat with your designer
// (ux-design.md §5.1). System messages appear in the same thread, set apart from people's messages.
import type { Page } from "@playwright/test";
import { resolveTarget } from "../adapters/target";

/** One thread entry as shown, oldest first. `mine` is set for people's messages: true when the viewer sent it. */
export type MessageEntry = { kind: "system"; text: string } | { kind: "message"; text: string; mine: boolean };

export interface MessagesPages {
  /** Opens the messages of the open project (portal.openProject first). */
  open(): Promise<void>;
  /** Sends `text`. Resolves once the app accepted it and it shows in the thread. */
  send(text: string): Promise<void>;
  /** The thread as the app shows it now (re-read from the app), oldest first. */
  thread(): Promise<MessageEntry[]>;
}

export async function messagesPagesFor(page: Page): Promise<MessagesPages> {
  const impl = resolveTarget() === "next" ? await import("./next/messages") : await import("./laravel/messages");
  return impl.messages(page);
}
