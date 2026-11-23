// Story 5.4 (K-02, K-03): client helpers for the checkout success and continue pages.

export const SENT_TEXT = 'Sign-in link sent. Check the purchaser email inbox to continue.';
export const MISSING_SESSION_TEXT = 'Missing session id.';

export type SendResult = { ok: boolean; message: string };

/** POST the send-link action. Failures show the server's message; a 429 adds the wait. */
export async function sendSignInLink(sessionId: string, fetcher: typeof fetch = fetch): Promise<SendResult> {
    if (!sessionId) return { ok: false, message: MISSING_SESSION_TEXT };
    try {
        const response = await fetcher('/api/checkout/resend-magic-link', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify({ session_id: sessionId }),
            cache: 'no-store',
            credentials: 'same-origin',
        });
        if (response.ok) return { ok: true, message: SENT_TEXT };
        const body = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
        let message = body?.error?.message ?? 'We couldn’t send the sign-in link. Please try again.';
        const wait = Number(response.headers.get('retry-after'));
        if (response.status === 429 && wait > 0) message += ` Try again in ${wait} seconds.`;
        return { ok: false, message };
    } catch {
        return { ok: false, message: 'We couldn’t send the sign-in link. Please try again.' };
    }
}

export type CheckoutStatus = { fulfilled: boolean; status: 'FULFILLED' | 'PENDING' };

export async function fetchStatus(sessionId: string, signal: AbortSignal, fetcher: typeof fetch = fetch): Promise<CheckoutStatus> {
    const response = await fetcher(`/api/checkout/status?session_id=${encodeURIComponent(sessionId)}`, { signal, cache: 'no-store', headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error('status');
    return (await response.json()) as CheckoutStatus;
}
