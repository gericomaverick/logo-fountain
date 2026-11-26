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

import { feedbackError, revisionBlock, revisionPreview, revisionsLeft } from '../../resources/js/lib/concepts.ts';

describe('feedback rules (story 6.8)', () => {
    const u = { limit: 2, consumed: 0, reserved: 0, remaining: 2 };
    test('preview says what it uses and what is left', () => {
        assert.equal(revisionPreview(u), 'This uses 1 of your 2 revisions. You’ll have 1 left.');
        assert.equal(revisionPreview({ limit: 1, remaining: 1 }), 'This uses 1 of your 1 revision. You’ll have 0 left.');
        assert.match(revisionPreview({ limit: 2, remaining: 0 }), /no revisions left/);
        assert.equal(revisionsLeft({ limit: 3, consumed: 1, reserved: 1 }), 1);
        assert.equal(revisionsLeft({ unlimited: true, limit: 0 }), null);
        assert.doesNotMatch(revisionPreview({ unlimited: true }), /unlimited/i);
    });
    test('blocked by concept, project stage, then allowance', () => {
        assert.equal(revisionBlock('approved', 'CONCEPTS_READY', u)?.upsell, false);
        assert.match(revisionBlock('published', 'AWAITING_APPROVAL', u)?.reason ?? '', /stage/);
        assert.equal(revisionBlock('published', 'CONCEPTS_READY', { limit: 2, remaining: 0 })?.upsell, true);
        assert.equal(revisionBlock('published', 'REVISIONS_IN_PROGRESS', u), null);
    });
    test('error codes become plain sentences; no-revisions points to the upsell', () => {
        const e = (code: string) => ({ error: { code, message: 'x' } });
        assert.equal(feedbackError(e('NO_REVISIONS_REMAINING'), 'f').upsell, true);
        assert.match(feedbackError(e('CONCEPT_NOT_FOUND'), 'f').message, /approved or replaced/);
        assert.match(feedbackError(e('INVALID_PROJECT_STATUS_TRANSITION'), 'f').message, /moved on/);
        assert.equal(feedbackError({ error: { message: 'Boom' } }, 'f').message, 'Boom');
    });
});
