// Story 6.7 UI half: gallery and viewer helpers (resources/js/lib/concepts.ts). @unit. Run: npm run test:unit
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { apiError, cardStatus, versionNote, signed, versionsOf } from '../../resources/js/lib/concepts.ts';

describe('concepts helpers', () => {
    test('signed needs both the url and the key', () => {
        assert.equal(signed('https://x/y', undefined), null);
        assert.equal(signed(null, 'k'), null);
        assert.deepEqual(signed('https://x/y', 'k'), { url: 'https://x/y', imageKey: 'k' });
    });
    test('version notes follow Next: revision note for v>1, designer note for v1 without rationale', () => {
        assert.deepEqual(versionNote(2, ' Fixed ', 'Why'), { label: 'Revision note · v2', text: 'Fixed' });
        assert.equal(versionNote(2, 'WHY', 'why'), null);
        assert.deepEqual(versionNote(1, 'Hi', ''), { label: 'Designer note', text: 'Hi' });
        assert.equal(versionNote(1, 'Hi', 'Rationale'), null);
        assert.equal(versionNote(3, '', ''), null);
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
