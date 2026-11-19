// Next.js brief wizard (app/project/[id]/brief/brief-form.tsx, components/brief-field-input.tsx) and the project
// messages page (app/project/[id]/messages/page.tsx).
import type { Page } from "@playwright/test";
import type { BriefAnswers, BriefFieldKey, BriefPages, ProjectThreadPages } from "../brief";
import { messages } from "./messages";
import { openProjectArea } from "./project-areas";

/** Question labels and choice options (lib/brief.ts:78-300). Choice questions render as a fieldset (legend = label). */
const FIELDS: Record<BriefFieldKey, { label: string; options?: string[] }> = {
  brandName: { label: "Brand name" },
  tagline: { label: "Tagline / strapline" },
  industry: { label: "Industry" },
  offerSummary: { label: "What do you sell or offer?" },
  audiencePrimary: { label: "Primary target audience" },
  audienceSecondary: { label: "Secondary audience (optional)" },
  businessGoals: { label: "What should this logo help achieve?" },
  brandPersonality: { label: "Brand personality", options: ["Modern", "Classic", "Minimal", "Bold", "Playful", "Premium", "Approachable", "Technical", "Handcrafted", "Trustworthy", "Energetic", "Calm"] },
  styleDirection: { label: "Style direction", options: ["Wordmark", "Lettermark", "Icon with wordmark", "Abstract symbol", "Emblem or badge", "Illustrated or mascot", "Not sure yet"] },
  colorPreferences: { label: "Colour preferences", options: ["Keep our existing colours", "Warm reds and oranges", "Cool blues and greens", "Earthy and natural", "Bright and vivid", "Muted and understated", "Black and white only", "No preference"] },
  mustInclude: { label: "Must include" },
  avoidanceNotes: { label: "Avoid / anti-goals" },
  usageContexts: { label: "Where will this logo be used most?", options: ["Website", "Social media", "App icon", "Business cards", "Signage", "Packaging", "Clothing or merch", "Vehicles", "Email signature", "Print advertising", "Invoices and documents"] },
  deliverablesContext: { label: "Deliverable context (optional)" },
  competitors: { label: "Competitors or references" },
  additionalNotes: { label: "Anything else we should know?" },
};

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const startsWith = (s: string) => new RegExp(`^${escape(s)}`);

export function brief(page: Page): BriefPages {
  // brief-field-input.tsx:41-42: free text = <label for=key>, choices = <fieldset><legend> + aria-pressed buttons.
  const textbox = (key: BriefFieldKey) => page.getByLabel(startsWith(FIELDS[key].label));
  const choices = (key: BriefFieldKey) => page.getByRole("group", { name: startsWith(FIELDS[key].label) });
  const isChoice = (key: BriefFieldKey) => Boolean(FIELDS[key].options?.length);
  const ready = async () => {
    await page.waitForLoadState("networkidle");
    // brief-feedback.ts:23: "Loading your draft…" until the account draft has been fetched (autosave waits for it too).
    await page.getByText("Loading your draft…").waitFor({ state: "hidden" });
  };

  const self: BriefPages = {
    async open() {
      await openProjectArea(page, "Brief"); // project-hub.tsx:427 "Open Brief"
      await page.waitForURL((url) => /\/project\/[^/]+\/brief$/.test(url.pathname));
      await ready();
    },
    async fill(answers) {
      for (const [key, value] of Object.entries(answers) as Array<[BriefFieldKey, string]>) {
        if (!isChoice(key)) {
          await textbox(key).fill(value);
          continue;
        }
        const wanted = value.split(", ").filter(Boolean);
        const unknown = wanted.filter((v) => !FIELDS[key].options!.includes(v));
        if (unknown.length) throw new Error(`brief.fill(${key}): not offered options ${JSON.stringify(unknown)}`);
        const group = choices(key);
        for (const option of FIELDS[key].options!) {
          const button = group.getByRole("button", { name: new RegExp(`^${escape(option)}\\s*(·|$)`) });
          const pressed = (await button.getAttribute("aria-pressed")) === "true";
          if (pressed !== wanted.includes(option)) await button.click();
        }
      }
    },
    async next() {
      // The step title is the editor form's only h2 (brief-form.tsx:378/383).
      const stepTitle = () => page.locator("form#brief-editor-form h2").innerText();
      const before = await stepTitle();
      await page.getByRole("button", { name: "Continue", exact: true }).click();
      // brief-form.tsx:183 goNext: a gated section stays put and shows "Please complete: …".
      await page.waitForFunction((prev) => document.querySelector("form#brief-editor-form h2")?.textContent !== prev, before, { timeout: 10_000 })
        .catch(async () => { throw new Error(`brief.next(): still on "${before}" (${await page.locator("[data-validation-summary]").textContent().catch(() => "")})`); });
    },
    async waitUntilSaved(timeoutMs = 20_000) {
      // brief-feedback.ts:31: only the exact snapshot the PUT acknowledged shows as account-saved.
      // The visible save line (brief-form.tsx:387); the sr-only live region only announces the first "saved".
      await page.locator("[data-brief-save]").getByText(/^Saved to your account at /).waitFor({ timeout: timeoutMs });
    },
    async shownAnswers(keys) {
      const out: BriefAnswers = {};
      for (const key of keys) {
        if (!isChoice(key)) { out[key] = await textbox(key).inputValue(); continue; }
        const pressed = choices(key).locator('button[aria-pressed="true"]');
        const picked = (await pressed.allInnerTexts()).map((t) => t.split("·")[0].trim());
        const note = (await choices(key).getByRole("textbox").inputValue()).trim();
        out[key] = [picked.join(", "), note].filter(Boolean).join(" — ");
      }
      return out;
    },
    async reload() {
      // brief-form.tsx:299-309: a beforeunload warning while answers differ from the submitted brief.
      const onDialog = (dialog: import("@playwright/test").Dialog) => void (dialog.type() === "beforeunload" ? dialog.accept() : dialog.dismiss());
      page.on("dialog", onDialog);
      try { await page.reload(); } finally { page.off("dialog", onDialog); }
      await ready();
    },
    async submit() {
      await page.getByRole("heading", { name: "Final review" }).waitFor();
      await page.getByRole("button", { name: "Submit brief" }).click();
      const dialog = page.getByRole("dialog", { name: "Ready to send this to your designer?" }); // brief-submission-confirmation.ts
      await dialog.getByRole("checkbox").check();
      const posted = page.waitForResponse((r) => r.request().method() === "POST" && /\/api\/projects\/[^/]+\/brief$/.test(new URL(r.url()).pathname));
      await dialog.getByRole("button", { name: "Yes, send my brief" }).click();
      const res = await posted;
      if (!res.ok()) throw new Error(`brief submit failed: ${res.status()} ${await res.text()}`);
      await page.getByText(/^Your brief is in/).waitFor(); // brief-form.tsx:316
    },
  };
  return self;
}

export function thread(page: Page): ProjectThreadPages {
  return {
    async systemMessages() {
      // One reader of the messages screen (story 0.8c folded this onto pages/next/messages.ts).
      const chat = messages(page);
      await chat.open();
      return (await chat.thread()).filter((entry) => entry.kind === "system").map((entry) => entry.text);
    },
  };
}
