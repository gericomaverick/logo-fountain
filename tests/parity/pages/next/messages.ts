// Next.js project messages: app/project/[id]/messages/page.tsx. One labelled list per day ("Messages on …",
// :138); a system message is a plain line (:141), a person's message is an article headed by the sender label,
// "You" for the viewer (lib/chat-messages.ts:42). The page loads once (no polling), so thread() reloads.
import type { Page } from "@playwright/test";
import type { MessagesPages, ThreadEntry } from "../messages";
import { projectIdIn } from "./approval";

export function messages(page: Page): MessagesPages {
  const items = page.getByRole("list", { name: /^Messages on / }).getByRole("listitem");
  const composer = page.getByLabel("Write a message");
  const settle = async () => {
    await page.getByRole("heading", { name: "Project messages" }).waitFor({ state: "attached" });
    await page.waitForLoadState("networkidle");
  };
  const self: MessagesPages = {
    async open() {
      const id = projectIdIn(page);
      await page.goto(`/project/${id}/messages`);
      await settle();
    },
    async send(text) {
      await composer.fill(text);
      await page.getByRole("button", { name: "Send", exact: true }).click();
      // On success the composer is cleared and the thread refetched (:107-109); a failure shows an alert (:189).
      await page.waitForFunction(() => (document.getElementById("message-body") as HTMLTextAreaElement | null)?.value === "");
      await items.filter({ hasText: text }).last().waitFor();
    },
    async thread() {
      await page.reload();
      await settle();
      const entries: ThreadEntry[] = [];
      for (const item of await items.all()) {
        const article = item.getByRole("article");
        if ((await article.count()) === 0) {
          // The body text plus a trailing clock time (<time>).
          const time = (await item.locator("time").innerText()).trim();
          entries.push({ kind: "system", text: (await item.innerText()).trim().slice(0, -time.length).trim() });
        } else {
          const paragraphs = article.locator("p");
          const sender = (await paragraphs.first().innerText()).trim();
          entries.push({ kind: "message", text: (await paragraphs.last().innerText()).trim(), mine: sender === "You" });
        }
      }
      return entries;
    },
  };
  return self;
}
