// Mailpit adapter (story 0.5): both apps' mail ends up in Mailpit (Next via postmark-shim, Laravel via SMTP).
// Mailpit is shared by every test in a run, so search by recipient (tests use unique addresses) rather than clearing.
// API: https://mailpit.axllent.org/docs/api-v1/
export const mailpitUrl = (process.env.PARITY_MAILPIT_URL || `http://127.0.0.1:${process.env.PARITY_MAILPIT_PORT || "58025"}`).replace(/\/$/, "");

export type MailSummary = {
  ID: string;
  Subject: string;
  From: { Address: string; Name: string };
  To: Array<{ Address: string; Name: string }>;
  Created: string;
  Snippet: string;
};
export type MailMessage = MailSummary & { Text: string; HTML: string };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const quote = (value: string) => `"${value.replace(/"/g, '\\"')}"`;

/** Mailpit search syntax, e.g. `to:"a@b.test" subject:"New project created"`. Newest first. */
export async function searchMessages(query: string): Promise<MailSummary[]> {
  const res = await fetch(`${mailpitUrl}/api/v1/search?limit=200&query=${encodeURIComponent(query)}`);
  if (!res.ok) throw new Error(`Mailpit search failed: ${res.status} ${await res.text()}`);
  return ((await res.json()) as { messages?: MailSummary[] }).messages ?? [];
}

/** Messages to one address, optionally with an exact subject (Mailpit matches subject words; we re-check exactly). */
export async function messagesTo(address: string, subject?: string): Promise<MailSummary[]> {
  const found = await searchMessages(`to:${quote(address)}${subject ? ` subject:${quote(subject)}` : ""}`);
  return found.filter((m) => m.To.some((t) => t.Address.toLowerCase() === address.toLowerCase()) && (!subject || m.Subject === subject));
}

/** Messages to `address` with exactly `subject` whose text body contains `needle` (e.g. a project ID). */
export async function messagesContaining(address: string, subject: string, needle: string): Promise<MailSummary[]> {
  const candidates = await messagesTo(address, subject);
  const bodies = await Promise.all(candidates.map((m) => getMessage(m.ID)));
  return candidates.filter((_, i) => `${bodies[i].Text}\n${bodies[i].HTML}`.includes(needle));
}

export async function getMessage(id: string): Promise<MailMessage> {
  const res = await fetch(`${mailpitUrl}/api/v1/message/${id}`);
  if (!res.ok) throw new Error(`Mailpit message ${id}: ${res.status}`);
  return (await res.json()) as MailMessage;
}

/**
 * Polls until `count` messages match, then waits `settleMs` more so an unexpected extra message is caught,
 * and returns what is there (assert the length yourself for "exactly once").
 */
export async function waitForMessages(
  find: () => Promise<MailSummary[]>,
  { count = 1, timeoutMs = 10_000, settleMs = 750 }: { count?: number; timeoutMs?: number; settleMs?: number } = {},
): Promise<MailSummary[]> {
  const deadline = Date.now() + timeoutMs;
  let found = await find();
  while (found.length < count && Date.now() < deadline) {
    await sleep(150);
    found = await find();
  }
  if (settleMs > 0) {
    await sleep(settleMs);
    found = await find();
  }
  return found;
}

/** Every http(s) link in the text and HTML bodies, de-duplicated, HTML entities decoded. */
export function extractLinks(message: Pick<MailMessage, "Text" | "HTML">): string[] {
  const decode = (s: string) => s.replace(/&amp;/g, "&").replace(/&#x3D;|&#61;/g, "=").replace(/&quot;/g, '"');
  const links = new Set<string>();
  for (const m of (message.Text ?? "").matchAll(/https?:\/\/[^\s<>"']+/g)) links.add(m[0]);
  for (const m of (message.HTML ?? "").matchAll(/href="(https?:\/\/[^"]+)"/g)) links.add(decode(m[1]));
  return [...links];
}

/** Deletes the messages matching a query (never everything: Mailpit is shared). */
export async function deleteMessages(query: string): Promise<void> {
  if (!query.trim()) throw new Error("deleteMessages needs a query; Mailpit is shared by the whole run");
  const res = await fetch(`${mailpitUrl}/api/v1/search?query=${encodeURIComponent(query)}`, { method: "DELETE" });
  if (!res.ok) throw new Error(`Mailpit delete failed: ${res.status}`);
}

/** Email subjects, from apps/web/src/lib/auth/mail.ts:21 and lib/project-lifecycle-email.ts:281 (inventory N-01, N-02, N-10). */
export const SUBJECTS = {
  setup: "Finish setting up your Logo Fountain account",
  signIn: "Your Logo Fountain sign-in link",
  reset: "Reset your Logo Fountain password",
  adminNewProject: "New project created",
} as const;
