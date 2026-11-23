// Story 4.9b (A-05, A-07, A-08): the auth screens' client helpers. @unit
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { AUTH_FAILED_TEXT, captureFragment, logoutAndVerifySession, postAuth, takeMailboxProof, validateLogin, validatePasswordReset } from '../../resources/js/lib/auth.ts';

describe('captureFragment', () => {
    test('reads token and next, then replaces the URL without the fragment and clears history state', () => {
        const calls: unknown[][] = [];
        captureFragment(
            { hash: '#token=abc&next=%2Fdashboard', pathname: '/auth/callback', search: '?x=1' },
            { replaceState: (...a) => calls.push(a) },
        );
        assert.deepEqual(takeMailboxProof(), { token: 'abc', next: '/dashboard' });
        assert.deepEqual(calls, [[null, '', '/auth/callback?x=1']]);
    });
    test('no fragment leaves the URL alone', () => {
        const calls: unknown[][] = [];
        captureFragment({ hash: '', pathname: '/set-password', search: '' }, { replaceState: (...a) => calls.push(a) });
        assert.equal(calls.length, 0);
    });
});

describe('validation messages', () => {
    test('login', () => {
        assert.deepEqual(validateLogin(' ', ''), { email: 'Enter your email address.', password: 'Enter your password.' });
        assert.deepEqual(validateLogin('a@b.c', 'x'), {});
    });
    test('password rules and mismatch', () => {
        assert.equal(validatePasswordReset('short', 'short').password, 'Use at least 8 characters.');
        assert.equal(validatePasswordReset('a'.repeat(73), 'a'.repeat(73)).password, 'Use 72 characters or fewer.');
        assert.equal(validatePasswordReset('longenough', 'different1').confirm, 'Passwords do not match.');
        assert.equal(validatePasswordReset('longenough', '').confirm, 'Confirm your password.');
        assert.deepEqual(validatePasswordReset('longenough', 'longenough'), {});
    });
});

describe('postAuth and logout', () => {
    test('failure shows only the fixed text', async () => {
        const res = await postAuth('login', {}, (async () => new Response('{"error":"secret"}', { status: 401 })) as typeof fetch);
        assert.deepEqual(res, { ok: false, error: AUTH_FAILED_TEXT });
    });
    test('logout succeeds only when the session is anonymous', async () => {
        const make = (authenticated: boolean) =>
            (async (url: string) => new Response(JSON.stringify(String(url).endsWith('logout') ? { ok: true } : { authenticated }))) as unknown as typeof fetch;
        await logoutAndVerifySession(make(false));
        await assert.rejects(logoutAndVerifySession(make(true)), /still be active/);
    });
});
