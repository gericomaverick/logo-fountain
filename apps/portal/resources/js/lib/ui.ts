// Pure helpers behind the Components/ui primitives (story 1.8a, UX §11–§13). No imports, so
// tests/js can run them with node:test (Node 24 type stripping) without a bundler.

/** Joins class names, skipping falsy entries. */
export function cx(...classes: Array<string | false | null | undefined>): string {
    return classes.filter(Boolean).join(' ');
}

/** The `aria-describedby` value for a control: the ids present, in order, or undefined. */
export function describedBy(...ids: Array<string | false | null | undefined>): string | undefined {
    const list = ids.filter((id): id is string => typeof id === 'string' && id !== '');
    return list.length ? list.join(' ') : undefined;
}

export type CharacterCount = {
    remaining: number;
    over: boolean;
    /** Visible and announced text, e.g. "12 characters left" or "3 characters too many". */
    text: string;
    /** Announce politely only near or past the limit, so screen readers aren't told every keystroke. */
    announce: boolean;
};

/**
 * UX §11 "character counter where there's a limit". Typing past the limit is allowed (input is
 * never cut off or cleared, §12); the field shows the overage and the form validates on submit.
 */
export function characterCount(length: number, max: number): CharacterCount {
    const remaining = max - length;
    const over = remaining < 0;
    const n = Math.abs(remaining);
    const noun = n === 1 ? 'character' : 'characters';
    const text = over ? `${n} ${noun} too many` : `${n} ${noun} left`;
    return { remaining, over, text, announce: over || remaining <= Math.max(10, Math.ceil(max * 0.1)) };
}

/**
 * UX §12 confirmation levels 3 and 4: what still blocks the confirm button, as the helper text the
 * disabled button shows ("a disabled button always says why"), or null when it may be pressed.
 * Type-to-confirm compares exactly (case-sensitive), ignoring surrounding spaces.
 */
export function confirmBlocker(state: {
    acknowledgement?: string | undefined;
    acknowledged: boolean;
    confirmPhrase?: string | undefined;
    typed: string;
}): string | null {
    if (state.acknowledgement && !state.acknowledged) return 'Tick the box above to continue.';
    if (state.confirmPhrase && state.typed.trim() !== state.confirmPhrase) return `Type ${state.confirmPhrase} to continue.`;
    return null;
}

/**
 * Whether a Link renders a plain <a> (another origin, a scheme such as mailto:, or an in-page
 * #hash) instead of an Inertia visit.
 */
export function usesNativeAnchor(href: string): boolean {
    return href.startsWith('#') || href.startsWith('//') || /^[a-z][a-z\d+.-]*:/i.test(href);
}

// ---------- Toasts (UX §11: success auto-dismisses after 5 s; errors stay until dismissed) ----------
export type ToastTone = 'success' | 'error';
export type Toast = { id: number; tone: ToastTone; message: string };

export const TOAST_SUCCESS_MS = 5000;
/** Older toasts beyond this are dropped so the stack never covers the page. */
export const TOAST_MAX = 3;

export function toastDismissAfter(tone: ToastTone): number | null {
    return tone === 'success' ? TOAST_SUCCESS_MS : null;
}

/** success → role=status (polite), error → role=alert (assertive). */
export function toastRole(tone: ToastTone): 'status' | 'alert' {
    return tone === 'success' ? 'status' : 'alert';
}

export function addToast(list: readonly Toast[], toast: Toast): Toast[] {
    // The same message twice in a row replaces the old one rather than stacking.
    const rest = list.filter((t) => !(t.tone === toast.tone && t.message === toast.message));
    return [...rest, toast].slice(-TOAST_MAX);
}

export function removeToast(list: readonly Toast[], id: number): Toast[] {
    return list.filter((t) => t.id !== id);
}

// ---------- Inline alert tones (UX §8.1: colour never carries meaning alone) ----------
export type AlertTone = 'info' | 'success' | 'warning' | 'danger';

/** Visually hidden prefix read before an alert, so the tone isn't conveyed by colour and icon only. */
export function alertToneLabel(tone: AlertTone): string {
    return { info: 'Information', success: 'Success', warning: 'Warning', danger: 'Error' }[tone];
}
