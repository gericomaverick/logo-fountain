export type BriefAnswers = {
  brandName: string;
  tagline: string;
  industry: string;
  offerSummary: string;
  audiencePrimary: string;
  audienceSecondary: string;
  businessGoals: string;
  brandPersonality: string;
  styleDirection: string;
  colorPreferences: string;
  mustInclude: string;
  avoidanceNotes: string;
  usageContexts: string;
  deliverablesContext: string;
  deadlineOrLaunch: string;
  competitors: string;
  additionalNotes: string;
};

export type BriefFieldDefinition = {
  key: keyof BriefAnswers;
  label: string;
  required?: boolean;
  kind?: "input" | "textarea";
  rows?: number;
  placeholder?: string;
  helperText?: string;
  maxLength?: number;
};

export type BriefSectionDefinition = {
  id: string;
  title: string;
  description: string;
  fields: BriefFieldDefinition[];
};

const EMPTY_ANSWERS: BriefAnswers = {
  brandName: "",
  tagline: "",
  industry: "",
  offerSummary: "",
  audiencePrimary: "",
  audienceSecondary: "",
  businessGoals: "",
  brandPersonality: "",
  styleDirection: "",
  colorPreferences: "",
  mustInclude: "",
  avoidanceNotes: "",
  usageContexts: "",
  deliverablesContext: "",
  deadlineOrLaunch: "",
  competitors: "",
  additionalNotes: "",
};

export const briefSections: BriefSectionDefinition[] = [
  {
    id: "brand-core",
    title: "Brand foundations",
    description: "Who you are, what you do, and what this logo needs to communicate.",
    fields: [
      { key: "brandName", label: "Brand name", required: true, kind: "input", maxLength: 120, placeholder: "e.g. Northvale Analytics" },
      { key: "tagline", label: "Tagline / strapline", kind: "input", maxLength: 140, placeholder: "Optional — include only if it should appear with the logo" },
      { key: "industry", label: "Industry", required: true, kind: "input", maxLength: 120, placeholder: "e.g. B2B SaaS, wellness clinic, coffee roastery" },
      {
        key: "offerSummary",
        label: "What do you sell or offer?",
        required: true,
        kind: "textarea",
        rows: 4,
        maxLength: 700,
        helperText: "Be specific so the designer can understand your business model.",
        placeholder: "We provide subscription accounting software for UK freelancers and sole traders.",
      },
    ],
  },
  {
    id: "audience-goals",
    title: "Audience & objectives",
    description: "Who the logo should speak to and what outcome it should support.",
    fields: [
      {
        key: "audiencePrimary",
        label: "Primary target audience",
        required: true,
        kind: "textarea",
        rows: 3,
        maxLength: 500,
        placeholder: "Who buys from you most often? Include traits like role, age band, context, or budget.",
      },
      {
        key: "audienceSecondary",
        label: "Secondary audience (optional)",
        kind: "textarea",
        rows: 3,
        maxLength: 400,
        placeholder: "Any second audience that should still feel represented.",
      },
      {
        key: "businessGoals",
        label: "What should this logo help achieve?",
        required: true,
        kind: "textarea",
        rows: 3,
        maxLength: 500,
        placeholder: "e.g. Look more premium, increase trust with enterprise buyers, stand out from local competitors.",
      },
    ],
  },
  {
    id: "creative-direction",
    title: "Creative direction",
    description: "Preferred style signals and strong do/don't guidance.",
    fields: [
      {
        key: "brandPersonality",
        label: "Brand personality",
        required: true,
        kind: "textarea",
        rows: 3,
        maxLength: 400,
        placeholder: "Pick 3–5 words. e.g. Bold, optimistic, clean, technical, playful.",
      },
      {
        key: "styleDirection",
        label: "Style direction",
        required: true,
        kind: "textarea",
        rows: 4,
        maxLength: 700,
        placeholder: "What visual direction do you like? Mention typography, icon style, geometry, feel.",
      },
      {
        key: "colorPreferences",
        label: "Colour preferences",
        kind: "textarea",
        rows: 3,
        maxLength: 400,
        placeholder: "Preferred colours, banned colours, and any accessibility constraints.",
      },
      {
        key: "mustInclude",
        label: "Must include",
        kind: "textarea",
        rows: 3,
        maxLength: 450,
        placeholder: "Required symbols, initials, wording, cultural references, or legal marks.",
      },
      {
        key: "avoidanceNotes",
        label: "Avoid / anti-goals",
        kind: "textarea",
        rows: 3,
        maxLength: 450,
        placeholder: "What should the designer avoid? e.g. Generic gradients, mascot style, script fonts.",
      },
    ],
  },
  {
    id: "practical-context",
    title: "Practical context",
    description: "Where the logo appears and any real-world constraints.",
    fields: [
      {
        key: "usageContexts",
        label: "Where will this logo be used most?",
        required: true,
        kind: "textarea",
        rows: 3,
        maxLength: 500,
        placeholder: "e.g. Website header, app icon, social avatar, packaging, signage, uniforms.",
      },
      {
        key: "deliverablesContext",
        label: "Deliverable context (optional)",
        kind: "textarea",
        rows: 3,
        maxLength: 400,
        placeholder: "Anything the team should optimise for now: print-first, icon-first, motion-ready, etc.",
      },
      {
        key: "deadlineOrLaunch",
        label: "Deadline or launch date",
        kind: "input",
        maxLength: 120,
        placeholder: "Optional — e.g. Product launch on 14 Sept, expo in Q4",
      },
      {
        key: "competitors",
        label: "Competitors or references",
        kind: "textarea",
        rows: 3,
        maxLength: 500,
        placeholder: "Share competitor names/links and what you do or don't like about their branding.",
      },
      {
        key: "additionalNotes",
        label: "Anything else we should know?",
        kind: "textarea",
        rows: 3,
        maxLength: 500,
        placeholder: "Optional final notes that don't fit elsewhere.",
      },
    ],
  },
];

const REQUIRED_FIELDS: Array<keyof BriefAnswers> = [
  "brandName",
  "industry",
  "offerSummary",
  "audiencePrimary",
  "businessGoals",
  "brandPersonality",
  "styleDirection",
  "usageContexts",
];

function cleanText(value: unknown, maxLength = 800): string {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, maxLength);
}

export function parseBriefAnswers(value: unknown): BriefAnswers | null {
  if (typeof value !== "object" || value === null) return null;
  const raw = value as Record<string, unknown>;

  const next: BriefAnswers = {
    ...EMPTY_ANSWERS,
    brandName: cleanText(raw.brandName, 120),
    tagline: cleanText(raw.tagline, 140),
    industry: cleanText(raw.industry, 120),
    offerSummary: cleanText(raw.offerSummary, 700),
    audiencePrimary: cleanText(raw.audiencePrimary, 500),
    audienceSecondary: cleanText(raw.audienceSecondary, 400),
    businessGoals: cleanText(raw.businessGoals, 500),
    brandPersonality: cleanText(raw.brandPersonality, 400),
    styleDirection: cleanText(raw.styleDirection, 700),
    colorPreferences: cleanText(raw.colorPreferences, 400),
    mustInclude: cleanText(raw.mustInclude, 450),
    avoidanceNotes: cleanText(raw.avoidanceNotes, 450),
    usageContexts: cleanText(raw.usageContexts, 500),
    deliverablesContext: cleanText(raw.deliverablesContext, 400),
    deadlineOrLaunch: cleanText(raw.deadlineOrLaunch, 120),
    competitors: cleanText(raw.competitors, 500),
    additionalNotes: cleanText(raw.additionalNotes, 500),
  };

  // Backward compatibility for v1 brief shape.
  if (!next.offerSummary) next.offerSummary = cleanText(raw.description, 700);
  if (!next.styleDirection) next.styleDirection = cleanText(raw.styleNotes, 700);

  if (!next.brandName || !next.industry || (!next.offerSummary && !cleanText(raw.description, 700))) {
    return null;
  }

  return next;
}

export function validateBriefSubmission(value: unknown): { ok: true; answers: BriefAnswers } | { ok: false; missing: string[] } {
  const parsed = parseBriefAnswers(value);
  if (!parsed) return { ok: false, missing: ["brandName", "industry", "offerSummary"] };

  const missing = REQUIRED_FIELDS.filter((key) => !parsed[key]);
  if (missing.length > 0) return { ok: false, missing };

  return { ok: true, answers: parsed };
}
