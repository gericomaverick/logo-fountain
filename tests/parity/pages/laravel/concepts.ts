// Laravel concept feedback (story 6.8 UI half): Pages/Project/Concept.tsx renders Components/project/ConceptFeedback.tsx,
// one composer ("Your feedback") with two outcomes, "Send comment" (free) and "Request a revision" (uses one), above a
// Thread (Components/ui/Thread.tsx) labelled "Feedback on this concept" that merges comments and revision requests.
import type { Page } from "@playwright/test";
import type { ConceptPages, ThreadEntry } from "../concepts";

const CONCEPT_PATH = /^\/project\/([0-9a-f-]{36})\/concept\/([0-9a-f-]{36})$/i;
const REVISION_PREFIX = "Revision requested: "; // ConceptFeedback.tsx: a request's thread body is "Revision requested: {body}"

type Feedback = Pick<ConceptPages, "comment" | "requestRevision" | "thread">;

export function conceptFeedback(page: Page): Feedback {
  const ids = () => {
    const m = new URL(page.url()).pathname.match(CONCEPT_PATH);
    if (!m) throw new Error(`no concept is open (at ${page.url()})`);
    return { projectId: m[1], conceptId: m[2] };
  };
  const section = () => page.getByRole("region", { name: "Feedback" });
  const thread = () => section().getByRole("list", { name: "Feedback on this concept" });
  // Thread.tsx: an outer <li> per day holding an <ol> of messages; a message <li> is the sender line then the body <div>.
  const entryWith = (body: string) => thread().locator(":scope > li > ol > li").filter({ hasText: body });
  const send = async (button: "Send comment" | "Request a revision", text: string, path: RegExp, done: string, shown: string) => {
    ids();
    await section().getByRole("textbox", { name: "Your feedback" }).fill(text);
    const posted = page.waitForResponse((r) => r.request().method() === "POST" && path.test(new URL(r.url()).pathname));
    await section().getByRole("button", { name: button, exact: true }).click();
    const res = await posted;
    if (res.status() !== 201) throw new Error(`${button} failed: ${res.status()} ${await res.text()}`);
    await section().getByText(done).waitFor(); // the success InlineAlert
    await entryWith(shown).first().waitFor();
  };

  return {
    async comment(text) {
      await send("Send comment", text, /\/concepts\/[^/]+\/comments$/, "Comment sent.", text);
    },
    async requestRevision(text) {
      await send("Request a revision", text, /\/revision-requests$/, "Revision requested.", REVISION_PREFIX + text);
    },
    async thread() {
      const { projectId, conceptId } = ids();
      await section().waitFor();
      // The comments load after the page (ConceptFeedback.tsx load()): wait for the list or the empty state.
      await thread().or(section().getByText("No feedback on this concept yet.")).first().waitFor();
      if ((await thread().count()) === 0) return [];
      const shown = await thread().locator(":scope > li > ol > li:not([data-kind=system])").evaluateAll((items) =>
        items.map((li) => (li.querySelector(":scope > div")?.textContent ?? "").trim()),
      );
      // GAP: the Laravel concept thread does not show a revision request's status (Next shows a pill). The status is
      // read from the project snapshot the page itself was given (GET /api/projects/{id}, revisionRequests), matched by body.
      let requests: { body: string; status: string; concept: { id: string } | null }[] | null = null;
      const entries: ThreadEntry[] = [];
      for (const text of shown) {
        if (!text.startsWith(REVISION_PREFIX)) {
          entries.push({ kind: "comment", body: text });
          continue;
        }
        const body = text.slice(REVISION_PREFIX.length);
        if (!requests) {
          const res = await page.request.get(`/api/projects/${projectId}`);
          if (!res.ok()) throw new Error(`snapshot failed: ${res.status()}`);
          requests = (await res.json()).snapshot.revisionRequests ?? [];
        }
        const match = requests!.find((r) => r.concept?.id === conceptId && r.body === body);
        entries.push(match ? { kind: "revision", body, status: match.status } : { kind: "revision", body });
      }
      return entries;
    },
  };
}
