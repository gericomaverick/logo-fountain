export type ChatSender = {
  id: string;
  email: string;
  isAdmin?: boolean;
  fullName?: string | null;
  firstName?: string | null;
  lastName?: string | null;
};

export type ChatMessage = {
  id: string;
  kind?: string;
  body: string;
  createdAt: string;
  sender: ChatSender;
};

function normalize(value?: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function fullNameFromParts(firstName?: string | null, lastName?: string | null): string | null {
  const first = normalize(firstName);
  const last = normalize(lastName);
  const full = [first, last].filter(Boolean).join(" ");
  return full.length > 0 ? full : null;
}

export function resolveDesignerDisplayName(sender: ChatSender): string {
  return normalize(sender.fullName) ?? fullNameFromParts(sender.firstName, sender.lastName) ?? "Designer";
}

/**
 * Who sent a message, from the reader's side of it.
 *
 * Their own messages say "You". A designer's say the designer's name. Anyone
 * else on the customer's side is named if we have a name — being told your own
 * words came from "Client" reads as though someone else wrote them.
 */
export function resolveSenderLabel(sender: ChatSender, viewerId?: string | null): string {
  if (viewerId && sender.id === viewerId) return "You";
  if (sender.isAdmin) return resolveDesignerDisplayName(sender);
  return normalize(sender.fullName) ?? fullNameFromParts(sender.firstName, sender.lastName) ?? "Client";
}

export function sortMessagesNewestLast<T extends Pick<ChatMessage, "createdAt" | "id">>(messages: T[]): T[] {
  return messages
    .slice()
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime() || a.id.localeCompare(b.id));
}

/**
 * Whether a keypress in the composer should send.
 *
 * Enter sends, because that is what anyone who has used a chat window will
 * try first. Shift+Enter, and the Ctrl/Cmd+Enter some people have in their
 * fingers from mail clients, insert a newline instead. A keypress that is
 * part of composing a character — picking from an IME candidate list — never
 * sends: that Enter belongs to the word being written, not to the message.
 */
export function shouldSendOnKey(event: {
  key: string;
  shiftKey?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
  isComposing?: boolean;
}): boolean {
  if (event.key !== "Enter") return false;
  if (event.isComposing) return false;
  return !event.shiftKey && !event.ctrlKey && !event.metaKey && !event.altKey;
}

export type ChatDay<T> = { key: string; label: string; messages: T[] };

/**
 * The conversation in days, so a chat window can put a date between them
 * rather than stamping every line with one.
 *
 * `today` is passed in rather than read from the clock: a component that
 * renders on the server and again in the browser must not disagree with
 * itself about what day it is.
 */
export function groupMessagesByDay<T extends Pick<ChatMessage, "createdAt">>(messages: T[], today: Date): Array<ChatDay<T>> {
  const dayKey = (date: Date) => `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
  const todayKey = dayKey(today);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayKey = dayKey(yesterday);
  const sameYear = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long" });
  const otherYear = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric" });

  const days: Array<ChatDay<T>> = [];
  for (const message of messages) {
    const date = new Date(message.createdAt);
    // An unparseable timestamp joins the day before it rather than vanishing.
    if (Number.isNaN(date.getTime())) {
      if (days.length > 0) days[days.length - 1]!.messages.push(message);
      continue;
    }

    const key = dayKey(date);
    const label =
      key === todayKey ? "Today"
        : key === yesterdayKey ? "Yesterday"
          : date.getFullYear() === today.getFullYear() ? sameYear.format(date) : otherYear.format(date);

    const last = days[days.length - 1];
    if (last && last.key === key) last.messages.push(message);
    else days.push({ key, label, messages: [message] });
  }

  return days;
}
