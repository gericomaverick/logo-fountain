// Story 6.7 UI half: gallery and viewer helpers (resources/js/lib/concepts.ts). @unit. Run: npm run test:unit
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { apiError, cardStatus, newestFirst, signed, versionsOf } from '../../resources/js/lib/concepts.ts';

describe('concepts helpers', () => {
    test('signed needs both the url and the key', () => {
        assert.equal(signed('https://x/y', undefined), null);
        assert.equal(signed(null, 'k'), null);
        assert.deepEqual(signed('https://x/y', 'k'), { url: 'https://x/y', imageKey: 'k' });
    });
    test('newest first, ties by number', () => {
        const out = newestFirst([{ createdAt: '2026-01-01', number: 1 }, { createdAt: '2026-02-01', number: 2 }]);
        assert.deepEqual(out.map((c) => c.number), [2, 1]);
    });
    test('one entry per version, highest first, first file wins', () => {
        const v = versionsOf([
            { version: 1, createdAt: 'a', url: 'u1', imageKey: 'k1' },
            { version: 2, createdAt: 'b', url: 'u2', imageKey: 'k2' },
            { version: 2, createdAt: 'c', url: 'u3', imageKey: 'k3' },
        ]);
        assert.deepEqual(v.map((x) => [x.version, x.image?.imageKey]), [[2, 'k2'], [1, 'k1']]);
    });
    test('api errors read as one sentence; status maps to the card', () => {
        assert.equal(apiError({ error: { message: 'Nope.', details: { nextStep: 'Retry.' } } }, 'x'), 'Nope. Retry.');
        assert.equal(apiError(null, 'fallback'), 'fallback');
        assert.equal(cardStatus('approved'), 'approved');
        assert.equal(cardStatus('published'), null);
    });
});
