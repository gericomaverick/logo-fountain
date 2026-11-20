import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

import { createPoller, documentVisibility, type PollState, type Poller, type PollerOptions } from '@/lib/polling';

/**
 * The only way screens poll (story 1.8c; FR58, ADR-023, project-context "polling only through
 * usePolling"). A thin React wrapper over lib/polling's createPoller: one request at a time,
 * "Reconnecting…" after 3 consecutive failures with backoff, paused while the tab is hidden, and
 * a polite announcement for new items. Render <PollingStatus> once per polled region for the
 * notice and the aria-live region. It never moves focus; the data is replaced in place, and lists
 * append new items at the end so nothing moves under the reader (UX §12).
 *
 * `fetch`, `announce` and `stopWhen` may be inline closures: the latest ones are used without
 * restarting the poller. Changing `key` (e.g. the project id) restarts it.
 */
export type UsePollingOptions<T> = Pick<PollerOptions<T>, 'interval' | 'initialData' | 'immediate' | 'maxBackoffMs'> & {
    fetch: (signal: AbortSignal) => Promise<T>;
    announce?: (prev: T | undefined, next: T) => string | null;
    stopWhen?: (data: T) => boolean;
    /** Restart polling when this changes. */
    key?: string;
    /** false stops polling (e.g. until a session id is known). */
    enabled?: boolean;
};

export type UsePollingResult<T> = PollState<T> & {
    /** The current polite announcement (rendered by PollingStatus). */
    announcement: string;
    /** Poll now and reset the schedule ("Retry now"). */
    refresh: () => void;
};

/** How long an announcement stays in the live region before it's cleared for the next one. */
const ANNOUNCEMENT_MS = 5000;

export function usePolling<T>(options: UsePollingOptions<T>): UsePollingResult<T> {
    const { interval, initialData, immediate, maxBackoffMs, key, enabled = true } = options;
    const latest = useRef(options);
    // The poller's callbacks read the newest options. Updated after render (react-hooks/refs), and
    // before any effect or timer can call them.
    useLayoutEffect(() => {
        latest.current = options;
    });

    const [state, setState] = useState<PollState<T>>(() => ({
        data: initialData,
        error: null,
        consecutiveFailures: 0,
        reconnecting: false,
        paused: false,
        lastSuccessAt: null,
        done: false,
    }));
    const [announcement, setAnnouncement] = useState('');
    const poller = useRef<Poller | null>(null);
    const clearTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const intervalKey = typeof interval === 'function' ? 'fn' : interval;

    useEffect(() => {
        if (!enabled) return;
        const p = createPoller<T>({
            fetch: (signal) => latest.current.fetch(signal),
            interval: typeof interval === 'function' ? (elapsed) => (latest.current.interval as (ms: number) => number)(elapsed) : interval,
            initialData: latest.current.initialData,
            immediate,
            maxBackoffMs,
            announce: (prev, next) => latest.current.announce?.(prev, next) ?? null,
            stopWhen: (data) => latest.current.stopWhen?.(data) ?? false,
            visibility: documentVisibility(),
            onState: setState,
            onAnnounce: (message) => {
                // Clear first so the same text twice in a row is still spoken.
                setAnnouncement('');
                if (clearTimer.current) clearTimeout(clearTimer.current);
                clearTimer.current = setTimeout(() => {
                    setAnnouncement(message);
                    clearTimer.current = setTimeout(() => setAnnouncement(''), ANNOUNCEMENT_MS);
                }, 50);
            },
        });
        poller.current = p;
        p.start();
        return () => {
            p.stop();
            poller.current = null;
            if (clearTimer.current) clearTimeout(clearTimer.current);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps -- closures are read through `latest`
    }, [enabled, key, intervalKey, immediate, maxBackoffMs]);

    const refresh = useCallback(() => poller.current?.refresh(), []);
    return { ...state, announcement, refresh };
}
