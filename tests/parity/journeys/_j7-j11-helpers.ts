// Shared arrangement for journeys 8-11 (story 0.8c). Black-box only: HTTP, Mailpit and stripe-fake.
import { expect } from "../fixtures";
import { PARITY_PASSWORD } from "../adapters/api";
import { mailbox, proofLink, SUBJECTS, type Mail } from "../adapters/mail";
import { fulfilledProjectId } from "../adapters/stripe";
import { client, purchase, uniqueEmail } from "./contract/_auth-helpers";

export type Inbox = Awaited<ReturnType<typeof mailbox>>;

/** Lifecycle email subjects (apps/web/src/lib/project-lifecycle-email.ts; inventory N-06…N-09, N-11). */
export const LIFECYCLE = {
  clientNewMessage: "New message from your Logo Fountain designer", // N-06
  clientConceptApproved: "Concept approved - final files in progress", // N-07
  adminConceptApproved: "Client approved a concept", // N-08
  clientFinalsReady: "Your final logo files are ready", // N-09
  adminClientMessage: "New client message", // N-11
} as const;

/**
 * A new customer of their own: a real purchase through stripe-fake, then the first password from the setup link
 * (journey 1 covers that path in the browser). Only adds data, so it fits a shared DB lease.
 */
export async function freshCustomer(tag: string, password = PARITY_PASSWORD): Promise<{ email: string; projectId: string }> {
  const email = uniqueEmail(tag);
  const inbox = await mailbox(email);
  const projectId = await fulfilledProjectId(await purchase(email, "essential"));
  const [setup] = await inbox.next(1);
  expect(setup.subject).toBe(SUBJECTS.setup);
  const anon = await client();
  const set = await anon.post("/api/auth/reset-password", { data: { token: proofLink(setup).token, newPassword: password } });
  expect(set.ok(), await set.text()).toBe(true);
  await anon.dispose();
  return { email, projectId };
}

/**
 * Waits for exactly one new email with `subject` (and, when given, a body containing `needle`) in `inbox`,
 * then waits `settleMs` more and asserts no duplicate arrived. Other subjects in the inbox are ignored.
 */
export async function oneNew(inbox: Inbox, subject: string, needle?: string, { timeoutMs = 20_000, settleMs = 1_000 } = {}): Promise<Mail> {
  const matching = async () => {
    let all: Mail[] = [];
    try { all = await inbox.next(1, 0); } catch { /* nothing new yet */ }
    return all.filter((m) => m.subject === subject && (!needle || `${m.text}\n${m.html}`.includes(needle)));
  };
  const until = Date.now() + timeoutMs;
  let found = await matching();
  while (found.length === 0 && Date.now() < until) {
    await new Promise((r) => setTimeout(r, 200));
    found = await matching();
  }
  expect(found.length, `no "${subject}" email${needle ? ` about ${needle}` : ""}`).toBeGreaterThan(0);
  await new Promise((r) => setTimeout(r, settleMs));
  found = await matching();
  expect(found, `exactly one "${subject}" email`).toHaveLength(1);
  return found[0];
}

/** The http(s) links in an email's text body. */
export const linksIn = (mail: Mail) => [...mail.text.matchAll(/https?:\/\/[^\s"'<>]+/g)].map((m) => m[0]);
