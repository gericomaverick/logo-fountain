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
  competitors: string;
  additionalNotes: string;
};

/**
 * A choice offered for a question people find hard to answer cold. `value` is
 * what gets stored, so it must not contain the separators `brief-choices.ts`
 * composes with (`, ` and ` — `); `hint` explains it without entering the answer.
 */
export type BriefFieldOption = {
  value: string;
  hint?: string;
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
  /** A worked answer, shown on request, so nobody has to guess what good looks like. */
  example?: string;
  /** Offering choices turns a blank box into a pick-and-elaborate question. */
  options?: readonly BriefFieldOption[];
  /** Invitation above the choices. */
  optionsPrompt?: string;
  /** Label for the free-text box that sits under the choices. */
  notePrompt?: string;
};

export type BriefSectionDefinition = {
  id: string;
  title: string;
  description: string;
  fields: BriefFieldDefinition[];
};

export const EMPTY_BRIEF_ANSWERS: BriefAnswers = {
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
  competitors: "",
  additionalNotes: "",
};

export const briefSections: BriefSectionDefinition[] = [
  {
    id: "brand-core",
    title: "Brand foundations",
    description: "Who you are, what you do, and what this logo needs to communicate.",
    fields: [
      {
        key: "brandName",
        label: "Brand name",
        required: true,
        kind: "input",
        maxLength: 120,
        placeholder: "e.g. Northvale Analytics",
        helperText: "Exactly as it should be spelled and capitalised in the logo.",
      },
      {
        key: "tagline",
        label: "Tagline / strapline",
        kind: "input",
        maxLength: 140,
        placeholder: "Optional — include only if it should appear with the logo",
        example: "Numbers, minus the headache",
      },
      { key: "industry", label: "Industry", required: true, kind: "input", maxLength: 120, placeholder: "e.g. B2B SaaS, wellness clinic, coffee roastery" },
      {
        key: "offerSummary",
        label: "What do you sell or offer?",
        required: true,
        kind: "textarea",
        rows: 6,
        maxLength: 700,
        helperText: "A clear one-paragraph summary helps us design with the right commercial context.",
        placeholder: "We provide subscription accounting software for UK freelancers and sole traders.",
        example:
          "We roast and deliver single-origin coffee to independent cafés across the North West. Customers subscribe for a weekly or fortnightly delivery, and we handle the grind profile for their machine. Most of our growth comes from café owners recommending us to each other.",
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
        rows: 5,
        maxLength: 500,
        placeholder: "Who buys from you most often? Include traits like role, age band, context, or budget.",
        example:
          "Independent café owners, mostly 30–50, running one or two sites. They care about quality and provenance, they are time-poor, and they buy from people they trust rather than from catalogues.",
      },
      {
        key: "audienceSecondary",
        label: "Secondary audience (optional)",
        kind: "textarea",
        rows: 5,
        maxLength: 400,
        placeholder: "Any second audience that should still feel represented.",
        example: "Home subscribers who discovered us through a café and now order a bag a month for themselves.",
      },
      {
        key: "businessGoals",
        label: "What should this logo help achieve?",
        required: true,
        kind: "textarea",
        rows: 5,
        maxLength: 500,
        placeholder: "e.g. Look more premium, increase trust with enterprise buyers, stand out from local competitors.",
        example:
          "Look established enough that a café owner trusts us with a standing order. Right now our handmade look reads as a hobby, and we lose deals to bigger roasters on credibility alone.",
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
        rows: 5,
        maxLength: 400,
        optionsPrompt: "Pick three to five that fit. There are no wrong answers here.",
        notePrompt: "Anything else about how it should feel (optional)",
        options: [
          { value: "Modern" },
          { value: "Classic" },
          { value: "Minimal" },
          { value: "Bold" },
          { value: "Playful" },
          { value: "Premium" },
          { value: "Approachable" },
          { value: "Technical" },
          { value: "Handcrafted" },
          { value: "Trustworthy" },
          { value: "Energetic" },
          { value: "Calm" },
        ],
        placeholder: "e.g. We want to feel like the grown-up option without being stuffy.",
      },
      {
        key: "styleDirection",
        label: "Style direction",
        required: true,
        kind: "textarea",
        rows: 6,
        maxLength: 700,
        optionsPrompt: "Which kinds of logo appeal to you? Pick as many as you like — or tell us you are not sure.",
        notePrompt: "Anything specific about type, shape or feel (optional)",
        options: [
          { value: "Wordmark", hint: "Your name set in distinctive type — think Google" },
          { value: "Lettermark", hint: "Your initials or a monogram — think HBO" },
          { value: "Icon with wordmark", hint: "A symbol beside the name — think Adidas" },
          { value: "Abstract symbol", hint: "A shape that stands for you — think Nike" },
          { value: "Emblem or badge", hint: "Name inside a contained shape — think Starbucks" },
          { value: "Illustrated or mascot", hint: "A character or drawn scene" },
          { value: "Not sure yet", hint: "Happy for the designer to recommend" },
        ],
        placeholder: "e.g. Something that still reads at the size of a stamp on a coffee bag.",
      },
      {
        key: "colorPreferences",
        label: "Colour preferences",
        kind: "textarea",
        rows: 5,
        maxLength: 400,
        optionsPrompt: "Any direction you already know? Leave it blank if you would rather we explored.",
        notePrompt: "Specific colours, or any to avoid (optional)",
        options: [
          { value: "Keep our existing colours" },
          { value: "Warm reds and oranges" },
          { value: "Cool blues and greens" },
          { value: "Earthy and natural" },
          { value: "Bright and vivid" },
          { value: "Muted and understated" },
          { value: "Black and white only" },
          { value: "No preference" },
        ],
        placeholder: "e.g. Avoid green — our main competitor owns it locally.",
      },
      {
        key: "mustInclude",
        label: "Must include",
        kind: "textarea",
        rows: 5,
        maxLength: 450,
        placeholder: "Required symbols, initials, wording, cultural references, or legal marks.",
        example: "The word \u201cRoasters\u201d has to stay in the logo, and we need the \u00ae after the name.",
      },
      {
        key: "avoidanceNotes",
        label: "Avoid / anti-goals",
        kind: "textarea",
        rows: 5,
        maxLength: 450,
        helperText: "Knowing what you dislike narrows things down faster than almost anything else.",
        placeholder: "What should the designer avoid? e.g. Generic gradients, mascot style, script fonts.",
        example: "No coffee beans and no steam swirls — every roaster near us uses them. Nothing that looks hand-drawn.",
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
        rows: 5,
        maxLength: 500,
        optionsPrompt: "Tick everywhere you expect to use it. This decides how simple the mark has to be.",
        notePrompt: "Anywhere unusual we should plan for (optional)",
        options: [
          { value: "Website" },
          { value: "Social media" },
          { value: "App icon" },
          { value: "Business cards" },
          { value: "Signage" },
          { value: "Packaging" },
          { value: "Clothing or merch" },
          { value: "Vehicles" },
          { value: "Email signature" },
          { value: "Print advertising" },
          { value: "Invoices and documents" },
        ],
        placeholder: "e.g. Stamped into the side of a kraft coffee bag, one colour.",
      },
      {
        key: "deliverablesContext",
        label: "Deliverable context (optional)",
        kind: "textarea",
        rows: 5,
        maxLength: 400,
        placeholder: "Anything the team should optimise for now: print-first, icon-first, motion-ready, etc.",
        example: "Print first — most of what we produce is physical packaging, so it has to work in a single colour.",
      },
      {
        key: "competitors",
        label: "Competitors or references",
        kind: "textarea",
        rows: 5,
        maxLength: 500,
        helperText: "Logos you admire are just as useful as competitors, even from other industries.",
        placeholder: "Share competitor names/links and what you do or don't like about their branding.",
        example:
          "Climpson & Sons feel close to right — confident but not shouty. Our nearest competitor uses a bean-and-swirl mark we want to stay well clear of.",
      },
      {
        key: "additionalNotes",
        label: "Anything else we should know?",
        kind: "textarea",
        rows: 5,
        maxLength: 500,
        placeholder: "Optional final notes that don't fit elsewhere.",
        example: "We are rebranding ahead of a second site opening in March, so signage is the first thing it has to work on.",
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

export function normalizeBriefAnswers(value: unknown): BriefAnswers | null {
  if (typeof value !== "object" || value === null) return null;
  const raw = value as Record<string, unknown>;

  const next: BriefAnswers = {
    ...EMPTY_BRIEF_ANSWERS,
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
    competitors: cleanText(raw.competitors, 500),
    additionalNotes: cleanText(raw.additionalNotes, 500),
  };

  // Backward compatibility for v1 brief shape.
  if (!next.offerSummary) next.offerSummary = cleanText(raw.description, 700);
  if (!next.styleDirection) next.styleDirection = cleanText(raw.styleNotes, 700);

  return next;
}

export function missingRequiredFields(answers: BriefAnswers, section?: BriefSectionDefinition): Array<keyof BriefAnswers> {
  const required = section
    ? section.fields.filter((field) => field.required).map((field) => field.key)
    : REQUIRED_FIELDS;

  return required.filter((key) => !answers[key]);
}

export function requiredFieldLabels(keys: Array<keyof BriefAnswers>, section?: BriefSectionDefinition): string[] {
  if (!section) return keys;

  const labelsByKey = new Map(section.fields.map((field) => [field.key, field.label]));
  return keys.map((key) => labelsByKey.get(key) ?? key);
}

export function parseBriefAnswers(value: unknown): BriefAnswers | null {
  const next = normalizeBriefAnswers(value);
  if (!next) return null;

  if (!next.brandName || !next.industry || !next.offerSummary) {
    return null;
  }

  return next;
}

export function validateBriefSubmission(value: unknown): { ok: true; answers: BriefAnswers } | { ok: false; missing: string[] } {
  const parsed = parseBriefAnswers(value);
  if (!parsed) return { ok: false, missing: ["brandName", "industry", "offerSummary"] };

  const missing = missingRequiredFields(parsed);
  if (missing.length > 0) return { ok: false, missing };

  return { ok: true, answers: parsed };
}
