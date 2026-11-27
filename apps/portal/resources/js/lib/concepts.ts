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

// Story 6.8 UI half (C-10, C-11): the feedback composer's rules.
export type RevisionUsage = { limit?: number; consumed?: number; reserved?: number; remaining?: number; unlimited?: boolean };

/** Next's check (concept page.tsx:530) used `remaining`; the left count is the API's, else limit − used − in progress. */
export function revisionsLeft(u: RevisionUsage | null | undefined): number | null {
    if (!u) return 0;
    if (u.unlimited) return null;
    return Math.max(u.remaining ?? (u.limit ?? 0) - (u.consumed ?? 0) - (u.reserved ?? 0), 0);
}

/** UX §3: shown before sending, "This uses 1 of your 2 revisions. You'll have 1 left." */
export function revisionPreview(u: RevisionUsage | null | undefined): string {
    const left = revisionsLeft(u);
    if (left === null) return 'This asks your designer for a new version.';
    if (left <= 0) return 'You have no revisions left in your package.';
    const total = u?.limit ?? left;
    return `This uses 1 of your ${total} ${total === 1 ? 'revision' : 'revisions'}. You’ll have ${left - 1} left.`;
}

/** Why a revision request can't be sent right now, before the user tries; null when it can. */
export function revisionBlock(conceptStatus: string, projectStatus: string, u: RevisionUsage | null | undefined): { reason: string; upsell: boolean } | null {
    if (conceptStatus !== 'published') return { reason: 'This concept can’t be revised.', upsell: false };
    if (projectStatus !== 'CONCEPTS_READY' && projectStatus !== 'REVISIONS_IN_PROGRESS') return { reason: 'Revisions can’t be requested at this stage of your project.', upsell: false };
    if (revisionsLeft(u) === 0) return { reason: 'You have no revisions left.', upsell: true };
    return null;
}

/** The API's codes as plain sentences (C-10, C-11); `upsell` means point to the Overview's add-on. */
export function feedbackError(payload: unknown, fallback: string): { message: string; upsell: boolean } {
    const err = (payload as { error?: { code?: string } } | null)?.error;
    switch (typeof err === 'object' ? err?.code : undefined) {
        case 'NO_REVISIONS_REMAINING':
            return { message: 'You have no revisions left in your package.', upsell: true };
        case 'CONCEPT_NOT_FOUND':
            return { message: 'This concept can’t take feedback any more. It may have been approved or replaced. Go back to your concepts to see the latest.', upsell: false };
        case 'INVALID_PROJECT_STATUS_TRANSITION':
            return { message: 'Your project has moved on, so a revision can’t be requested right now. Reload the page to see where it is.', upsell: false };
        case 'INVALID_COMMENT_BODY':
            return { message: 'A comment needs 1 to 2000 characters.', upsell: false };
        case 'INVALID_BODY':
            return { message: 'A revision request needs 1 to 5000 characters.', upsell: false };
        default:
            return { message: apiError(payload, fallback), upsell: false };
    }
}

/** Story 6.9 (C-12): Next shows Approve only on a published concept while the project is CONCEPTS_READY. */
export function canApprove(conceptStatus: string, projectStatus: string): boolean {
    return conceptStatus === 'published' && projectStatus === 'CONCEPTS_READY';
}

/** Next's `lib/final-approval.ts` copy. */
export const APPROVAL_COPY = {
    title: 'Ready to lock this in?',
    body: 'Once you approve this concept, it becomes your final chosen direction and we’ll move straight into final file delivery. Your other concepts are archived. This step is final.',
    acknowledgement: 'I understand this approval is final and I want to continue.',
    confirm: 'Yes, approve this concept',
    cancel: 'Not yet',
};

/** The approve API's codes as plain sentences (C-12). */
export function approvalError(payload: unknown): string {
    const err = (payload as { error?: { code?: string } } | null)?.error;
    switch (typeof err === 'object' ? err?.code : undefined) {
        case 'CONCEPT_NOT_FOUND':
            return 'This concept can’t be approved any more. It may already be approved or replaced. Reload the page to see the latest.';
        case 'INVALID_PROJECT_STATUS_TRANSITION':
            return 'Your project has moved on, so this concept can’t be approved right now. Reload the page to see where it is.';
        case 'STATUS_CHANGE_CONFLICT':
            return 'Your project changed while we were saving. Nothing was approved: please try again.';
        case 'PROJECT_NOT_FOUND':
            return 'We couldn’t find this project. Check the link or go back to your projects.';
        default:
            return apiError(payload, 'We couldn’t approve this concept. Please try again.');
    }
}
