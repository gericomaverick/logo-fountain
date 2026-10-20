import type { BriefFieldDefinition } from "@/lib/brief";

/** A check means answered within the serialized limit, never saved or designer-approved. */
export function fieldFeedback(field: BriefFieldDefinition, value: string, touched: boolean, attempted: boolean) {
  const text = value.trim();
  const limit = field.maxLength ?? 800;
  return {
    error: (attempted || touched) && field.required && !text ? `${field.label} is required.` : undefined,
    answered: touched && text.length > 0 && text.length <= limit,
    lengthNote: text.length > limit
      ? `Only the first ${limit} characters are saved to your account or submitted.` : undefined,
  };
}

export type SaveRecord = {
  snapshot: string;
  phase: "saving" | "saved" | "failed";
  local: boolean;
  updatedAt?: string;
};

export function savePresentation(snapshot: string, loaded: boolean, record: SaveRecord | null, shortened = false) {
  if (!loaded) return { kind: "pending", text: "Loading your draft…" } as const;
  if (!record || record.snapshot !== snapshot) return { kind: "pending", text: "Changes pending" } as const;
  if (record.phase === "saving") return { kind: "pending", text: "Saving to your account…" } as const;
  if (record.phase === "failed") return record.local
    ? { kind: "device", text: "Kept in this tab only — account save unavailable" } as const
    : { kind: "warning", text: "Not saved — keep this tab open and try again" } as const;
  if (shortened) return { kind: "warning", text: "Account copy shortened — see field notes" } as const;
  const date = record.updatedAt ? new Date(record.updatedAt) : null;
  return { kind: "saved", text: date && !Number.isNaN(date.getTime())
    ? `Saved to your account at ${date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
    : "Account save acknowledged" } as const;
}

/** Focus alone is not a keyboard constraint; use measured viewport/zoom/height limits. */
export function canPinBriefNavigation({ width, height, viewportHeight, viewportWidth, offsetTop, scale, modal, barHeight }: {
  width: number; height: number; viewportHeight: number; viewportWidth: number;
  offsetTop: number; scale: number; modal: boolean; barHeight: number;
}) {
  return width >= 300 && height >= 640 && viewportHeight >= 640
    && viewportHeight >= height - 40 && Math.abs(viewportWidth - width) < 2
    && Math.abs(offsetTop) < 2 && scale === 1 && !modal && barHeight * 4 < viewportHeight;
}
