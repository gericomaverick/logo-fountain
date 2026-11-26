// Story 6.7 UI half: pure helpers behind the concepts gallery and viewer. No imports beyond types, so tests/js runs them.
import type { SignedImage } from './media';

export type ApiConcept = { id: string; number: number; status: string; revisionVersion: number; createdAt: string; imageUrl?: string | null; imageKey?: string };
export type ApiAsset = { version: number; createdAt: string; notes?: string | null; url?: string | null; imageKey?: string };

/** A signed image only when the API gave both the URL and its stable key (DV-12); never a storage path. */
export function signed(url: string | null | undefined, key: string | undefined): SignedImage | null {
    return url && key ? { url, imageKey: key } : null;
}

/** One entry per version (the API lists a version's newest file first), highest version first. */
export function versionsOf(assets: readonly ApiAsset[]): { version: number; image: SignedImage | null; createdAt: string; notes: string }[] {
    const seen = new Map<number, { version: number; image: SignedImage | null; createdAt: string; notes: string }>();
    for (const a of assets) {
        if (!seen.has(a.version)) seen.set(a.version, { version: a.version, image: signed(a.url, a.imageKey), createdAt: a.createdAt, notes: a.notes?.trim() ?? '' });
    }
    return [...seen.values()].sort((a, b) => b.version - a.version);
}

/** The API's `{error:{message,details:{nextStep}}}` as one plain sentence. */
export function apiError(payload: unknown, fallback: string): string {
    const err = (payload as { error?: { message?: string; details?: { nextStep?: string } } | string } | null)?.error;
    const message = typeof err === 'string' ? err : (err?.message ?? fallback);
    const next = typeof err === 'string' ? undefined : err?.details?.nextStep;
    return next ? `${message} ${next}` : message;
}

export function cardStatus(status: string): 'approved' | 'archived' | null {
    return status === 'approved' ? 'approved' : status === 'archived' ? 'archived' : null;
}

/**
 * Next's notes rule (concept page.tsx:248-258): a version's own note shows as "Revision note · vN" for v>1,
 * or as the "Designer note" for v1 when there is no concept rationale; never when it repeats the rationale.
 */
export function versionNote(version: number, note: string, rationale: string): { label: string; text: string } | null {
    const text = note.trim();
    const why = rationale.trim();
    if (!text || text.toLowerCase() === why.toLowerCase()) return null;
    if (version > 1) return { label: `Revision note · v${version}`, text };
    return version === 1 && !why ? { label: 'Designer note', text } : null;
}
