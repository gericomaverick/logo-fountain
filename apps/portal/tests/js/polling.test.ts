// Story 1.8c: the usePolling engine (resources/js/lib/polling.ts) under node:test mock timers
// (FR58, ADR-023, UX §12). @unit. Run: npm run test:unit
import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, mock, test } from 'node:test';

import {
    checkoutInterval,
    countNewIds,
    createPoller,
    FAILURE_THRESHOLD,
    MAX_BACKOFF_MS,
    newItemsAnnouncement,
    nextDelay,
    POLL_INTERVALS,
    type PollerOptions,
    type PollState,
    type VisibilitySource,
} from '../../resources/js/lib/polling.ts';

/** Lets settled fetch promises run their continuations (setImmediate isn't mocked). */
const flush = () => new Promise<void>((resolve) => setImmediate(resolve));

async function advance(ms: number) {
    mock.timers.tick(ms);
    await flush();
}

function fakeVisibility(hidden = false) {
    const listeners = new Set<() => void>();
    const source: VisibilitySource & { set(hidden: boolean): void } = {
        hidden: () => hidden,
        subscribe: (listener) => {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
        set(next) {
            hidden = next;
            for (const l of listeners) l();
        },
    };
    return source;
}

type Item = { id: string };

/** A scripted server: each call takes the next outcome ('ok' returns the current items). */
function harness(overrides: Partial<PollerOptions<Item[]>> = {}) {
    const states: PollState<Item[]>[] = [];
    const announcements: string[] = [];
    let items: Item[] = [{ id: 'a' }];
    let failNext = 0;
    const calls: number[] = [];
    const fetch = mock.fn(async () => {
        calls.push(Date.now());
        if (failNext > 0) {
            failNext--;
            throw new Error('network');
        }
        return items.slice();
    });
    const poller = createPoller<Item[]>({
        fetch,
        interval: 2000,
        initialData: [{ id: 'a' }],
        now: () => Date.now(),
        onState: (s) => states.push(s),
        onAnnounce: (m) => announcements.push(m),
        announce: (prev, next) => newItemsAnnouncement(countNewIds(prev, next), 'message'),
        ...overrides,
    });
    return {
        poller,
        fetch,
        calls,
        states,
        announcements,
        last: () => states.at(-1),
        setItems: (next: Item[]) => (items = next),
        fail: (n: number) => (failNext = n),
    };
}

beforeEach(() => mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 0 }));
afterEach(() => mock.timers.reset());

describe('schedule', () => {
    test('with first-paint data, the first request waits one interval, then one per interval', async () => {
        const h = harness();
        h.poller.start();
        await advance(1999);
        assert.equal(h.fetch.mock.callCount(), 0);
        await advance(1);
        assert.equal(h.fetch.mock.callCount(), 1);
        await advance(2000);
        await advance(2000);
        assert.deepEqual(h.calls, [2000, 4000, 6000]);
        h.poller.stop();
    });

    test('without first-paint data it fetches at once', async () => {
        const h = harness({ initialData: undefined });
        h.poller.start();
        await flush();
        assert.equal(h.fetch.mock.callCount(), 1);
        h.poller.stop();
    });

    test('one request at a time: a slow response delays the next poll instead of overlapping it', async () => {
        let resolve: (v: Item[]) => void = () => {};
        const fetch = mock.fn(() => new Promise<Item[]>((r) => (resolve = r)));
        const h = harness({ fetch, immediate: true });
        h.poller.start();
        await advance(10_000); // the response hasn't arrived: no second request
        assert.equal(fetch.mock.callCount(), 1);
        resolve([{ id: 'a' }]);
        await flush();
        await advance(2000);
        assert.equal(fetch.mock.callCount(), 2);
        h.poller.stop();
    });

    test('checkout: 2 s until 45 s have passed, then 10 s (success-processing-client.tsx:15-17)', async () => {
        assert.equal(checkoutInterval(0), 2000);
        assert.equal(checkoutInterval(44_999), 2000);
        assert.equal(checkoutInterval(45_000), 10_000);
        const h = harness({ interval: checkoutInterval, initialData: undefined });
        h.poller.start();
        await flush();
        for (let t = 0; t < 60_000; t += 1000) await advance(1000);
        // 0, 2 … 44 s (23 calls), then 46 s is the first slow wait → 56 s.
        assert.deepEqual(h.calls.slice(-3), [44_000, 46_000, 56_000]);
        h.poller.stop();
    });

    test('the Next intervals are kept (FR58)', () => {
        assert.equal(POLL_INTERVALS.customerProject, 10_000);
        assert.equal(POLL_INTERVALS.adminProject, 2000);
        assert.equal(POLL_INTERVALS.adminAudit, 2500);
        assert.equal(POLL_INTERVALS.checkoutFast, 2000);
        assert.equal(POLL_INTERVALS.checkoutSlow, 10_000);
        assert.equal(POLL_INTERVALS.checkoutSlowAfter, 45_000);
    });

    test('stopWhen ends polling (e.g. a fulfilled checkout)', async () => {
        const h = harness({ stopWhen: (items) => items.length > 1 });
        h.poller.start();
        await advance(2000);
        h.setItems([{ id: 'a' }, { id: 'b' }]);
        await advance(2000);
        assert.equal(h.last()?.done, true);
        await advance(20_000);
        assert.equal(h.fetch.mock.callCount(), 2);
        h.poller.stop();
    });

    test('stop() aborts the request in flight and ignores its result', async () => {
        let signal: AbortSignal | undefined;
        const fetch = mock.fn((s: AbortSignal) => {
            signal = s;
            return new Promise<Item[]>(() => {});
        });
        const h = harness({ fetch, immediate: true });
        h.poller.start();
        await flush();
        h.poller.stop();
        assert.equal(signal?.aborted, true);
        await advance(60_000);
        assert.equal(fetch.mock.callCount(), 1);
    });

    test('refresh() polls at once and restarts the interval from there', async () => {
        const h = harness();
        h.poller.start();
        await advance(500);
        h.poller.refresh();
        await flush();
        await advance(2000);
        assert.deepEqual(h.calls, [500, 2500]);
        h.poller.stop();
    });
});

describe('failures: "Reconnecting…" after 3 in a row, with backoff', () => {
    test('the delay table: the interval below the threshold, then doubling up to the cap', () => {
        assert.equal(FAILURE_THRESHOLD, 3);
        assert.deepEqual(
            [0, 1, 2, 3, 4, 5, 6, 7, 8].map((n) => nextDelay(2000, n)),
            [2000, 2000, 2000, 4000, 8000, 16_000, 32_000, MAX_BACKOFF_MS, MAX_BACKOFF_MS],
        );
        assert.deepEqual([3, 4, 5].map((n) => nextDelay(10_000, n)), [20_000, 40_000, 60_000]);
        // An interval longer than the cap is never shortened.
        assert.equal(nextDelay(90_000, 5), 90_000);
    });

    test('two failures retry on the interval and stay quiet; the third shows reconnecting and backs off', async () => {
        const h = harness();
        h.fail(5);
        h.poller.start();
        await advance(2000); // failure 1
        await advance(2000); // failure 2
        assert.equal(h.last()?.consecutiveFailures, 2);
        assert.equal(h.last()?.reconnecting, false);
        await advance(2000); // failure 3
        assert.equal(h.last()?.reconnecting, true);
        assert.deepEqual(h.calls, [2000, 4000, 6000]);
        await advance(3999);
        assert.equal(h.fetch.mock.callCount(), 3); // backing off: 4 s, not 2 s
        await advance(1); // failure 4 at 10 s
        await advance(8000); // failure 5 at 18 s
        assert.deepEqual(h.calls, [2000, 4000, 6000, 10_000, 18_000]);
        assert.equal(h.last()?.reconnecting, true, 'still polling, still reconnecting');
        h.poller.stop();
    });

    test('a success clears reconnecting and goes back to the normal interval; data is kept meanwhile', async () => {
        const h = harness();
        h.fail(3);
        h.poller.start();
        for (let i = 0; i < 3; i++) await advance(2000);
        assert.equal(h.last()?.reconnecting, true);
        assert.deepEqual(h.last()?.data, [{ id: 'a' }], 'the last good data stays on screen');
        await advance(4000); // the 4 s backoff, now a success
        assert.equal(h.last()?.reconnecting, false);
        assert.equal(h.last()?.consecutiveFailures, 0);
        assert.equal(h.last()?.error, null);
        await advance(2000);
        assert.deepEqual(h.calls, [2000, 4000, 6000, 10_000, 12_000]);
        h.poller.stop();
    });
});

describe('hidden tab', () => {
    test('pauses: no timer and no request while hidden; visible again polls at once, then resumes', async () => {
        const visibility = fakeVisibility();
        const h = harness({ visibility });
        h.poller.start();
        await advance(2000);
        visibility.set(true);
        assert.equal(h.last()?.paused, true);
        await advance(60_000);
        assert.equal(h.fetch.mock.callCount(), 1);
        visibility.set(false);
        await flush();
        assert.equal(h.fetch.mock.callCount(), 2);
        assert.equal(h.last()?.paused, false);
        await advance(2000);
        assert.deepEqual(h.calls, [2000, 62_000, 64_000]);
        h.poller.stop();
    });

    test('a tab that starts hidden makes no request until it is shown', async () => {
        const visibility = fakeVisibility(true);
        const h = harness({ visibility, initialData: undefined });
        h.poller.start();
        await advance(30_000);
        assert.equal(h.fetch.mock.callCount(), 0);
        visibility.set(false);
        await flush();
        assert.equal(h.fetch.mock.callCount(), 1);
        h.poller.stop();
    });

    test('a response that lands while hidden is used, but nothing is scheduled until visible', async () => {
        let resolve: (v: Item[]) => void = () => {};
        const visibility = fakeVisibility();
        const fetch = mock.fn(() => new Promise<Item[]>((r) => (resolve = r)));
        const h = harness({ fetch, visibility, immediate: true });
        h.poller.start();
        visibility.set(true);
        resolve([{ id: 'a' }, { id: 'b' }]);
        await flush();
        assert.equal(h.last()?.data?.length, 2);
        await advance(60_000);
        assert.equal(fetch.mock.callCount(), 1);
        h.poller.stop();
    });

    test('stop() unsubscribes from visibility changes', async () => {
        const visibility = fakeVisibility();
        const h = harness({ visibility });
        h.poller.start();
        h.poller.stop();
        visibility.set(true);
        visibility.set(false);
        await flush();
        assert.equal(h.fetch.mock.callCount(), 0);
    });
});

describe('announcements (aria-live=polite)', () => {
    test('new items are announced once; unchanged data and the first load are not', async () => {
        const h = harness({ initialData: undefined });
        h.poller.start();
        await flush(); // first load: [a]
        assert.deepEqual(h.announcements, []);
        await advance(2000); // unchanged
        h.setItems([{ id: 'a' }, { id: 'b' }]);
        await advance(2000);
        h.setItems([{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }]);
        await advance(2000);
        assert.deepEqual(h.announcements, ['1 new message', '2 new messages']);
        h.poller.stop();
    });

    test('new items are counted by id, so a reorder or an edit is not "new"', () => {
        assert.equal(countNewIds([{ id: 'a' }, { id: 'b' }], [{ id: 'b' }, { id: 'a' }]), 0);
        assert.equal(countNewIds(undefined, [{ id: 'a' }]), 0);
        assert.equal(countNewIds([{ id: 'a' }], [{ id: 'a' }, { id: 'z' }]), 1);
        assert.equal(newItemsAnnouncement(0, 'message'), null);
        assert.equal(newItemsAnnouncement(1, 'event'), '1 new event');
        assert.equal(newItemsAnnouncement(3, 'reply', 'replies'), '3 new replies');
    });
});
