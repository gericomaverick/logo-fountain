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
