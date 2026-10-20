import { describe, expect, it } from "vitest";

import { briefSections } from "./brief";
import { composeBriefAnswer, parseBriefAnswer, toggleBriefChoice } from "./brief-choices";

const OPTIONS = ["Modern", "Classic", "Playful", "Minimal"] as const;

describe("composeBriefAnswer", () => {
  it("joins selections and keeps the note after a separator", () => {
    expect(composeBriefAnswer(["Modern", "Minimal"], "calm and reassuring")).toBe("Modern, Minimal — calm and reassuring");
  });

  it("returns only the selections when the note is empty", () => {
    expect(composeBriefAnswer(["Modern"], "")).toBe("Modern");
  });

  it("keeps a blank note, because it is a space someone just pressed", () => {
    // Trimming here is what stopped people typing a space at all. Whitespace is
    // tidied where the answer is stored instead: cleanText in normalizeBriefAnswers.
    expect(composeBriefAnswer(["Modern"], "   ")).toBe("Modern —    ");
  });

  it("returns the note as typed when nothing is picked", () => {
    expect(composeBriefAnswer([], "  something specific  ")).toBe("  something specific  ");
  });

  it("is empty when there is neither", () => {
    expect(composeBriefAnswer([], "")).toBe("");
  });
});

describe("parseBriefAnswer", () => {
  it("round-trips a composed answer", () => {
    const composed = composeBriefAnswer(["Modern", "Minimal"], "calm and reassuring");
    expect(parseBriefAnswer(composed, OPTIONS)).toEqual({ selected: ["Modern", "Minimal"], note: "calm and reassuring" });
  });

  it("round-trips selections with no note", () => {
    expect(parseBriefAnswer("Modern, Classic", OPTIONS)).toEqual({ selected: ["Modern", "Classic"], note: "" });
  });

  it("treats free text written before this question had options as a note", () => {
    const legacy = "Something friendly but grown up, not corporate";
    expect(parseBriefAnswer(legacy, OPTIONS)).toEqual({ selected: [], note: legacy });
  });

  it("does not half-match a list containing an unknown value", () => {
    expect(parseBriefAnswer("Modern, Whimsical", OPTIONS)).toEqual({ selected: [], note: "Modern, Whimsical" });
  });

  it("matches options case-insensitively and de-duplicates", () => {
    expect(parseBriefAnswer("modern, MODERN", OPTIONS)).toEqual({ selected: ["Modern"], note: "" });
  });

  it("keeps a note that itself contains the separator", () => {
    const composed = composeBriefAnswer(["Minimal"], "think Stripe — but warmer");
    expect(parseBriefAnswer(composed, OPTIONS)).toEqual({ selected: ["Minimal"], note: "think Stripe — but warmer" });
  });

  it("is empty for an empty answer", () => {
    expect(parseBriefAnswer("   ", OPTIONS)).toEqual({ selected: [], note: "" });
  });
});

describe("toggleBriefChoice", () => {
  it("adds in the order the question lists, not the order clicked", () => {
    const afterFirst = toggleBriefChoice([], "Minimal", OPTIONS);
    expect(toggleBriefChoice(afterFirst, "Modern", OPTIONS)).toEqual(["Modern", "Minimal"]);
  });

  it("removes an option that was already picked", () => {
    expect(toggleBriefChoice(["Modern", "Minimal"], "Modern", OPTIONS)).toEqual(["Minimal"]);
  });
});

describe("the options the brief actually offers", () => {
  const fieldsWithOptions = briefSections
    .flatMap((section) => section.fields)
    .filter((field) => field.options && field.options.length > 0);

  it("covers the questions people find hardest to answer cold", () => {
    expect(fieldsWithOptions.map((field) => field.key)).toEqual([
      "brandPersonality",
      "styleDirection",
      "colorPreferences",
      "usageContexts",
    ]);
  });

  it("never contains a separator, which would make an answer unparseable", () => {
    for (const field of fieldsWithOptions) {
      for (const option of field.options ?? []) {
        expect(option.value, `${field.key} / ${option.value}`).not.toContain(", ");
        expect(option.value, `${field.key} / ${option.value}`).not.toContain(" — ");
        expect(option.value.trim()).toBe(option.value);
      }
    }
  });

  it("round-trips every option through compose and parse", () => {
    for (const field of fieldsWithOptions) {
      const values = (field.options ?? []).map((option) => option.value);
      const composed = composeBriefAnswer(values, "and a note of our own");
      expect(parseBriefAnswer(composed, values), field.key).toEqual({ selected: values, note: "and a note of our own" });
    }
  });

  it("offers a way out on the question most likely to stump someone", () => {
    const style = fieldsWithOptions.find((field) => field.key === "styleDirection");
    expect(style?.options?.some((option) => option.value === "Not sure yet")).toBe(true);
  });
});

describe("typing into the note, one keystroke at a time", () => {
  // The field is controlled: every keystroke composes a stored string and
  // parses it straight back out to redisplay. Anything the round trip drops is
  // a character the person cannot type at all. The earlier tests all composed
  // a finished string in one go, which is why they never caught this.
  const type = (text: string, selected: string[] = ["Modern"]) => {
    let stored = composeBriefAnswer(selected, "");
    for (const character of text) {
      const current = parseBriefAnswer(stored, OPTIONS);
      stored = composeBriefAnswer(current.selected, current.note + character);
    }
    return parseBriefAnswer(stored, OPTIONS);
  };

  it("keeps the spaces between words", () => {
    expect(type("we want calm").note).toBe("we want calm");
  });

  it("keeps a space the moment it is pressed, before the next word", () => {
    expect(type("calm ").note).toBe("calm ");
  });

  it("keeps newlines, so a note can have more than one line", () => {
    expect(type("one\ntwo").note).toBe("one\ntwo");
  });

  it("keeps a leading space", () => {
    expect(type(" calm").note).toBe(" calm");
  });

  it("does the same with nothing picked", () => {
    expect(type("just our own words", []).note).toBe("just our own words");
  });

  it("still keeps the selection while the note is typed", () => {
    expect(type("we want calm").selected).toEqual(["Modern"]);
  });

  it("survives a space as the very first keystroke", () => {
    // The note is " " here: blank, but not empty. Treating it as empty drops
    // the separator, and the next keystroke lands in the selection list.
    expect(type(" ").note).toBe(" ");
  });
});
