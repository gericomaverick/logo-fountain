// Story 4.9b (A-05, A-07, A-08): the auth screens' client helpers, ported from apps/web `lib/auth/client.ts`,
// `validation.ts` and `logout.ts`. Pure where possible so `npm run test:unit` covers them.

export const AUTH_FAILED_TEXT = 'Authentication could not be completed. Check your details or request a new link.';

export type PostResult = { ok: boolean; error: string | null };

/** POST JSON to /api/auth/<path> with the same-origin cookie. The fixed text is the only failure message shown. */
export async function postAuth(path: string, body: unknown, fetcher: typeof fetch = fetch): Promise<PostResult> {
    try {
        const response = await fetcher(`/api/auth/${path}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify(body),
            cache: 'no-store',
            credentials: 'same-origin',
        });
        return { ok: response.ok, error: response.ok ? null : AUTH_FAILED_TEXT };
    } catch {
        return { ok: false, error: AUTH_FAILED_TEXT };
    }
}

type Place = { hash: string; pathname: string; search: string };
type Replace = { replaceState: (state: unknown, unused: string, url: string) => void };

/**
 * Reads `token` and `next` from the URL fragment and removes the fragment from the address bar and history
 * entry before anything renders (the fragment never reaches HTTP logs or referrers; `client.ts:7-13`).
 */
export function takeMailboxProof(
    place: Place = window.location,
    history: Replace = window.history,
): { token: string; next: string | null } {
    const params = new URLSearchParams(place.hash.slice(1));
    const token = params.get('token') ?? '';
    const next = params.get('next');
    history.replaceState(null, '', place.pathname + place.search);
    return { token, next };
}

export type Errors<T extends string> = Partial<Record<T, string>>;

export function hasErrors<T extends string>(errors: Errors<T>): boolean {
    return Object.values(errors).some(Boolean);
}

export function validateEmail(email: string): string | null {
    return email.trim().length === 0 ? 'Enter your email address.' : null;
}

export function validateLogin(email: string, password: string): Errors<'email' | 'password'> {
    const errors: Errors<'email' | 'password'> = {};
    const emailError = validateEmail(email);
    if (emailError) errors.email = emailError;
    if (password.trim().length === 0) errors.password = 'Enter your password.';
    return errors;
}

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_BYTES = 72;

export function validateNewPassword(password: string): string | null {
    if (password.length < PASSWORD_MIN_LENGTH) return `Use at least ${PASSWORD_MIN_LENGTH} characters.`;
    if (new TextEncoder().encode(password).length > PASSWORD_MAX_BYTES) return `Use ${PASSWORD_MAX_BYTES} characters or fewer.`;
    return null;
}

export function validatePasswordReset(password: string, confirm: string): Errors<'password' | 'confirm'> {
    const errors: Errors<'password' | 'confirm'> = {};
    const passwordError = validateNewPassword(password);
    if (passwordError) errors.password = passwordError;
    if (confirm.trim().length === 0) errors.confirm = 'Confirm your password.';
    else if (password !== confirm) errors.confirm = 'Passwords do not match.';
    return errors;
}

/** Only reports success after sign-out succeeds and the session check shows anonymous (`logout.ts:2-12`). */
export async function logoutAndVerifySession(fetcher: typeof fetch = fetch): Promise<void> {
    const response = await fetcher('/api/auth/logout', { method: 'POST', headers: { Accept: 'application/json' }, credentials: 'same-origin' });
    if (!response.ok) throw new Error('Could not sign out. Please retry.');
    const result: unknown = await response.json();
    if ((result as { ok?: unknown } | null)?.ok !== true) throw new Error('Could not confirm sign-out. Please retry.');

    const check = await fetcher('/api/auth/session', { cache: 'no-store', credentials: 'same-origin', headers: { Accept: 'application/json' } });
    if (!check.ok) throw new Error('Could not confirm sign-out. Please retry.');
    const session: unknown = await check.json();
    if ((session as { authenticated?: unknown } | null)?.authenticated !== false) throw new Error('Your session may still be active. Please retry signing out.');
}
