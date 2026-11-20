// Story 1.8a: the pure logic behind Components/ui (resources/js/lib/ui.ts). Run: npm run test:unit
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import {
    addToast,
    alertToneLabel,
    characterCount,
    confirmBlocker,
    cx,
    describedBy,
    removeToast,
    TOAST_MAX,
    TOAST_SUCCESS_MS,
    toastDismissAfter,
    toastRole,
    usesNativeAnchor,
    type Toast,
} from '../../resources/js/lib/ui.ts';

describe('class and aria helpers', () => {
    test('cx skips falsy entries', () => {
        assert.equal(cx('a', false, null, undefined, '', 'b'), 'a b');
    });

    test('describedBy joins the present ids in order, or is undefined (no empty attribute)', () => {
        assert.equal(describedBy('hint', null, 'error', false, undefined, 'count'), 'hint error count');
        assert.equal(describedBy(null, false, undefined, ''), undefined);
    });
});

describe('UX §11 character counter', () => {
    test('counts down, with singular and plural', () => {
        assert.deepEqual(characterCount(0, 500), { remaining: 500, over: false, text: '500 characters left', announce: false });
        assert.equal(characterCount(499, 500).text, '1 character left');
        assert.equal(characterCount(500, 500).text, '0 characters left');
    });

    test('allows typing past the limit and says by how much (input is never cut off, §12)', () => {
        assert.deepEqual(characterCount(503, 500), { remaining: -3, over: true, text: '3 characters too many', announce: true });
        assert.equal(characterCount(501, 500).text, '1 character too many');
    });

    test('announces only near the limit: the last 10% or 10 characters, whichever is more', () => {
        assert.equal(characterCount(449, 500).announce, false);
        assert.equal(characterCount(450, 500).announce, true);
        assert.equal(characterCount(29, 40).announce, false);
        assert.equal(characterCount(30, 40).announce, true);
    });
});

describe('UX §12 confirmation levels: what blocks the confirm button', () => {
    test('nothing to do: no blocker', () => {
        assert.equal(confirmBlocker({ acknowledged: false, typed: '' }), null);
    });

    test('level 3: the acknowledgement must be ticked', () => {
        const ack = 'I understand the other concepts will be archived';
        assert.equal(confirmBlocker({ acknowledgement: ack, acknowledged: false, typed: '' }), 'Tick the box above to continue.');
        assert.equal(confirmBlocker({ acknowledgement: ack, acknowledged: true, typed: '' }), null);
    });

    test('level 4: type-to-confirm matches exactly (case-sensitive), ignoring surrounding spaces', () => {
        const base = { confirmPhrase: 'RESET', acknowledged: false };
        assert.equal(confirmBlocker({ ...base, typed: '' }), 'Type RESET to continue.');
        assert.equal(confirmBlocker({ ...base, typed: 'reset' }), 'Type RESET to continue.');
        assert.equal(confirmBlocker({ ...base, typed: 'RESE' }), 'Type RESET to continue.');
        assert.equal(confirmBlocker({ ...base, typed: '  RESET ' }), null);
    });

    test('the acknowledgement is asked for before the phrase', () => {
        assert.equal(confirmBlocker({ acknowledgement: 'x', acknowledged: false, confirmPhrase: 'RESET', typed: 'RESET' }), 'Tick the box above to continue.');
        assert.equal(confirmBlocker({ acknowledgement: 'x', acknowledged: true, confirmPhrase: 'RESET', typed: '' }), 'Type RESET to continue.');
    });
});

describe('Link: Inertia visit or plain anchor', () => {
    test('internal paths are Inertia visits', () => {
        for (const href of ['/', '/projects/1', 'projects', '?tab=files']) assert.equal(usesNativeAnchor(href), false, href);
    });

    test('other origins, schemes and in-page hashes are plain anchors', () => {
        for (const href of ['https://example.com', 'http://x', '//cdn.example', 'mailto:a@b.c', 'tel:+44', '#main']) assert.equal(usesNativeAnchor(href), true, href);
    });
});

describe('UX §11 toasts', () => {
    const t = (id: number, tone: Toast['tone'], message = `m${id}`): Toast => ({ id, tone, message });

    test('success dismisses after 5 s; errors stay until dismissed', () => {
        assert.equal(TOAST_SUCCESS_MS, 5000);
        assert.equal(toastDismissAfter('success'), 5000);
        assert.equal(toastDismissAfter('error'), null);
    });

    test('success is role=status, error is role=alert', () => {
        assert.equal(toastRole('success'), 'status');
        assert.equal(toastRole('error'), 'alert');
    });

    test('keeps at most TOAST_MAX, dropping the oldest', () => {
        let list: Toast[] = [];
        for (let i = 1; i <= TOAST_MAX + 2; i++) list = addToast(list, t(i, 'success'));
        assert.deepEqual(
            list.map((x) => x.id),
            [3, 4, 5],
        );
    });

    test('the same message again replaces the old one instead of stacking', () => {
        const list = addToast([t(1, 'error', 'Failed'), t(2, 'success', 'Saved')], t(3, 'error', 'Failed'));
        assert.deepEqual(
            list.map((x) => x.id),
            [2, 3],
        );
    });

    test('removes by id', () => {
        assert.deepEqual(removeToast([t(1, 'success'), t(2, 'error')], 1), [t(2, 'error')]);
    });
});

describe('inline alert tone labels (colour never alone, §8.1)', () => {
    test('each tone has a spoken label', () => {
        assert.deepEqual(
            (['info', 'success', 'warning', 'danger'] as const).map(alertToneLabel),
            ['Information', 'Success', 'Warning', 'Error'],
        );
    });
});
