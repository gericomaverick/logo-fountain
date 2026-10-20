/**
 * Some brief questions are hard to answer from a blank box — "brand
 * personality", "style direction" — so the form offers choices for them. The
 * stored answer stays a single string, exactly as a typed answer always was, so
 * the submitted brief, its versions and the admin view are unaffected.
 *
 * A composed answer reads "Modern, Minimal — plus a note in their own words",
 * which is also what a designer wants to read.
 */

const SEPARATOR = " — ";
const JOIN = ", ";

export type ComposedAnswer = {
  /** Option values the person picked, in the order the question lists them. */
  selected: string[];
  /** Anything they typed themselves. */
  note: string;
};

/**
 * Build the stored string from picked options and a free-text note.
 *
 * The note is kept exactly as typed. This runs on every keystroke — the stored
 * string is parsed straight back out to redisplay the field — so trimming here
 * deletes a space at the moment it is pressed, and the person cannot type one
 * at all. Emptiness is measured by length, not by whether it is blank, so a
 * note that is still only a space survives long enough to become a word.
 */
export function composeBriefAnswer(selected: string[], note: string): string {
  const picked = selected.filter((value) => value.trim().length > 0).join(JOIN);

  if (!picked) return note;
  if (note.length === 0) return picked;
  return `${picked}${SEPARATOR}${note}`;
}

/**
 * Recover the picked options and the note from a stored string, so reopening a
 * draft or editing an answer restores the selection rather than showing it as
 * raw text.
 *
 * Only values the question actually offers count as selections; anything else
 * is treated as the person's own words. That keeps answers written before this
 * question had options, or typed in another client, intact.
 */
export function parseBriefAnswer(value: string, options: readonly string[]): ComposedAnswer {
  if (!value.trim()) return { selected: [], note: "" };

  const separatorAt = value.indexOf(SEPARATOR);
  const head = separatorAt === -1 ? value : value.slice(0, separatorAt);
  // Kept byte for byte: this is what the textarea redisplays while someone types.
  const tail = separatorAt === -1 ? "" : value.slice(separatorAt + SEPARATOR.length);

  const byLowerValue = new Map(options.map((option) => [option.toLowerCase(), option]));
  const candidates = head.split(JOIN).map((part) => part.trim());
  const selected: string[] = [];

  for (const candidate of candidates) {
    const match = byLowerValue.get(candidate.toLowerCase());
    // An unrecognised part means the head is not a selection list at all.
    if (!match) return { selected: [], note: value };
    if (!selected.includes(match)) selected.push(match);
  }

  return { selected, note: tail };
}

/** Toggle one option, preserving the order the question lists them in. */
export function toggleBriefChoice(selected: string[], option: string, options: readonly string[]): string[] {
  const next = selected.includes(option) ? selected.filter((value) => value !== option) : [...selected, option];
  return options.filter((value) => next.includes(value));
}
