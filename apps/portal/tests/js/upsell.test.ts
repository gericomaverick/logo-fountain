// Stories 6.3 and 6.4: the upsell rules in resources/js/lib/upsell.ts (C-04, K-08, K-10). @unit. Run: npm run test:unit
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import {
    DISMISS_MS,
    dismissKey,
    inUpsellPhase,
    isDismissed,
    nextPackageUp,
    purchaseCopy,
    purchaseFromSearch,
    purchaseInterval,
    resolveUpsellOffer,
    UPSELL_PRICES,
} from '../../resources/js/lib/upsell.ts';

describe('offer', () => {
    test('add-on only with nothing left; upgrade with one or none left', () => {
        assert.deepEqual(resolveUpsellOffer({ remaining: 0, reserved: 0 }, 'essential').addon, true);
        assert.equal(resolveUpsellOffer({ remaining: 0, reserved: 0 }, 'essential').upgradeTo, 'professional');
        const one = resolveUpsellOffer({ remaining: 1, reserved: 0 }, 'professional');
        assert.equal(one.addon, false);
        assert.equal(one.upgradeTo, 'complete');
        assert.equal(resolveUpsellOffer({ remaining: 2, reserved: 0 }, 'essential').upgradeTo, null);
        assert.equal(resolveUpsellOffer({ remaining: 0, reserved: 0 }, 'complete').upgradeTo, null);
        assert.equal(nextPackageUp('x'), null);
    });
    test('prices and phases', () => {
        assert.deepEqual(UPSELL_PRICES, { extraRevision: '£95', professional: '£495', complete: '£750' });
        assert.equal(inUpsellPhase('CONCEPTS_READY'), true);
        assert.equal(inUpsellPhase('IN_DESIGN'), false);
    });
});

describe('24 h snooze', () => {
    const now = 1_000_000;
    test('is 24 hours', () => assert.equal(DISMISS_MS, 86_400_000));
    test('hidden until the expiry, shown again at and after it', () => {
        const raw = String(now + DISMISS_MS);
        assert.equal(isDismissed(raw, now), true);
        assert.equal(isDismissed(raw, now + DISMISS_MS - 1), true);
        assert.equal(isDismissed(raw, now + DISMISS_MS), false);
        assert.equal(isDismissed(raw, now + DISMISS_MS + 1), false);
    });
    test('missing or unreadable values are not dismissed', () => {
        for (const v of [null, undefined, '', 'abc']) assert.equal(isDismissed(v, now), false);
    });
    test('key is per project and package', () => {
        assert.equal(dismissKey('p1', 'essential'), 'upsell:dismissed:p1:essential');
        assert.equal(dismissKey('p1', null), 'upsell:dismissed:p1:unknown');
    });
});

describe('purchase banner', () => {
    test('polls at 2.5 s first, then every 7 s', () => {
        assert.equal(purchaseInterval(0), 2_500);
        assert.equal(purchaseInterval(2_499), 2_500);
        assert.equal(purchaseInterval(2_500), 7_000);
        assert.equal(purchaseInterval(60_000), 7_000);
    });
    test('states and copy', () => {
        assert.equal(purchaseCopy('confirming', null).title, 'Confirming your purchase');
        assert.match(purchaseCopy('confirmed', 'upgrade').body, /Upgrade confirmed/);
        assert.match(purchaseCopy('confirmed', 'addon').body, /extra revision/);
        assert.equal(purchaseCopy('delayed', null).title, 'Purchase confirmation delayed');
    });
    test('survives a refresh: the state comes from the URL alone', () => {
        const search = '?upsell=1&session_id=cs_test_1&kind=addon';
        assert.deepEqual(purchaseFromSearch(search), { sessionId: 'cs_test_1', kind: 'addon' });
        assert.deepEqual(purchaseFromSearch(search), purchaseFromSearch(search));
        assert.equal(purchaseFromSearch('?upsell=1&session_id=x&kind=zzz')?.kind, null);
    });
    test('ignored without upsell=1 or a session id', () => {
        assert.equal(purchaseFromSearch('?session_id=x'), null);
        assert.equal(purchaseFromSearch('?upsell=1'), null);
        assert.equal(purchaseFromSearch('?upsell=1&session_id=%20'), null);
    });
});
